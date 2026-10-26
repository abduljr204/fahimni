-- Fahimni — tutor pricing, platform commission and payments.
-- Mirrors PlatformSettings, LessonPricing and Payment in src/domain/types.ts and the
-- arithmetic in src/domain/pricing.ts.
--
-- Rules:
--  * Tutors set their own hourly rate, within limits managed by admins.
--  * The commission is a share of the lesson price (included, never added on top).
--  * Online lessons are paid in full in the app. In-person lessons: the student pays
--    the commission in the app and the rest in cash to the tutor.
--  * Pricing is copied onto the booking when it is requested and never recalculated,
--    so later rate or commission changes leave existing requests and lessons untouched.

-- ─── Platform settings (single row) ─────────────────────────────────────────
create table public.platform_settings (
  id boolean primary key default true check (id),
  commission_bps integer not null default 1000 check (commission_bps between 0 and 5000),  -- 1000 = 10%
  min_hourly_rate_minor integer not null check (min_hourly_rate_minor > 0),
  max_hourly_rate_minor integer not null,
  currency char(3) not null default 'LYD',
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id),
  check (min_hourly_rate_minor <= max_hourly_rate_minor)
);
-- LYD minor units: 1 dinar = 1,000 dirhams. Demo values: 10%, 20–150 LYD per hour.
insert into public.platform_settings (commission_bps, min_hourly_rate_minor, max_hourly_rate_minor)
values (1000, 20000, 150000);

alter table public.platform_settings enable row level security;
create policy "platform settings readable" on public.platform_settings for select using (true);
create policy "admins update platform settings" on public.platform_settings
  for update using (is_admin()) with check (is_admin());

-- Tutors can only save a rate inside the current limits. Rates saved before the limits
-- changed stay as they are until the tutor edits them.
create or replace function public.enforce_rate_limits() returns trigger
language plpgsql security definer set search_path = public as $$
declare s platform_settings;
begin
  if tg_op = 'UPDATE' and new.hourly_rate_minor = old.hourly_rate_minor then return new; end if;
  if public.is_admin() then return new; end if;
  select * into s from platform_settings;
  if new.hourly_rate_minor < s.min_hourly_rate_minor or new.hourly_rate_minor > s.max_hourly_rate_minor then
    raise exception 'rate_out_of_range';
  end if;
  return new;
end;
$$;
create trigger enforce_tutor_rate_limits before insert or update of hourly_rate_minor on public.tutor_profiles
  for each row execute function public.enforce_rate_limits();

-- ─── Agreed pricing on bookings ─────────────────────────────────────────────
create type settlement_method as enum ('in_app', 'deposit_and_cash');

alter table public.bookings
  add column hourly_rate_minor integer,
  add column commission_bps integer,
  add column commission_minor integer,
  add column tutor_earnings_minor integer,
  add column settlement settlement_method,
  add column due_in_app_minor integer,
  add column due_in_cash_minor integer;

-- Bookings made before this migration had no commission.
update public.bookings set
  hourly_rate_minor = round(price_minor * 60.0 / duration_minutes),
  commission_bps = 0,
  commission_minor = 0,
  tutor_earnings_minor = price_minor,
  settlement = 'in_app',
  due_in_app_minor = price_minor,
  due_in_cash_minor = 0;

alter table public.bookings
  alter column hourly_rate_minor set not null,
  alter column commission_bps set not null,
  alter column commission_minor set not null,
  alter column tutor_earnings_minor set not null,
  alter column settlement set not null,
  alter column due_in_app_minor set not null,
  alter column due_in_cash_minor set not null,
  add constraint pricing_split check (commission_minor + tutor_earnings_minor = price_minor),
  add constraint payment_split check (due_in_app_minor + due_in_cash_minor = price_minor);

-- Bookings have no UPDATE policy, so users can't change agreed prices; the functions
-- in 0001 only touch status and timestamps.

-- ─── Payments ledger ────────────────────────────────────────────────────────
create type payment_purpose as enum ('lesson', 'commission_deposit');
create type payment_record_status as enum ('pending', 'requires_action', 'succeeded', 'failed', 'refunded');

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete restrict,
  payer_id uuid not null references public.profiles (id) on delete restrict,
  amount_minor integer not null check (amount_minor > 0),
  currency char(3) not null,
  purpose payment_purpose not null,
  provider text not null,
  provider_reference text,
  status payment_record_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_reference)
);
create index payments_booking_idx on public.payments (booking_id);

-- Read-only for users. Rows are written by the payment Route Handlers and webhook
-- with the service-role key (see src/services/payments/provider.ts).
alter table public.payments enable row level security;
create policy "parties read payments" on public.payments
  for select using (
    payer_id = auth.uid() or is_admin()
    or exists (select 1 from bookings b where b.id = booking_id and owns_tutor(b.tutor_id))
  );

-- ─── create_booking: price the lesson and reject stale quotes ───────────────
drop function public.create_booking(uuid, uuid, timestamptz, smallint, lesson_mode, text);

create or replace function public.create_booking(
  p_tutor_id uuid, p_subject_id uuid, p_starts_at timestamptz,
  p_duration smallint, p_mode lesson_mode,
  p_expected_total_minor integer, p_expected_due_in_app_minor integer,
  p_note text default null
) returns public.bookings
language plpgsql security definer set search_path = public as $$
declare
  t tutor_profiles;
  s platform_settings;
  b bookings;
  v_total integer;
  v_commission integer;
  v_due_in_app integer;
  v_settlement settlement_method;
begin
  if auth.uid() is null then raise exception 'unauthorized'; end if;
  select * into t from tutor_profiles where id = p_tutor_id and is_published;
  if not found then raise exception 'not_found'; end if;
  if t.user_id = auth.uid() then raise exception 'forbidden'; end if;
  if not exists (select 1 from tutor_subjects where tutor_id = p_tutor_id and subject_id = p_subject_id)
     or not (p_mode = any (t.modes)) then
    raise exception 'validation';
  end if;
  if p_starts_at < now() + interval '2 hours' then raise exception 'slot_unavailable'; end if;
  if not exists (
    select 1 from availability_windows w
    where w.tutor_id = p_tutor_id
      and w.weekday = extract(dow from p_starts_at at time zone t.timezone)
      and (p_starts_at at time zone t.timezone)::time >= w.start_time
      and ((p_starts_at + make_interval(mins => p_duration)) at time zone t.timezone)::time <= w.end_time
  ) then
    raise exception 'slot_unavailable';
  end if;

  -- Same arithmetic as priceLesson() in src/domain/pricing.ts.
  select * into s from platform_settings;
  v_total := round(t.hourly_rate_minor * p_duration / 60.0);
  v_commission := round(v_total * s.commission_bps / 10000.0);
  v_settlement := case when p_mode = 'in_person' then 'deposit_and_cash' else 'in_app' end;
  v_due_in_app := case when v_settlement = 'in_app' then v_total else v_commission end;

  -- The student agreed to a specific price; if it moved, they must review it again.
  if v_total <> p_expected_total_minor or v_due_in_app <> p_expected_due_in_app_minor then
    raise exception 'price_changed';
  end if;

  insert into bookings (student_id, tutor_id, subject_id, starts_at, duration_minutes, mode,
                        status, price_minor, currency, note,
                        hourly_rate_minor, commission_bps, commission_minor, tutor_earnings_minor,
                        settlement, due_in_app_minor, due_in_cash_minor)
  values (auth.uid(), p_tutor_id, p_subject_id, p_starts_at, p_duration, p_mode,
          case when t.instant_book then 'confirmed' else 'pending' end,
          v_total, t.currency, nullif(trim(p_note), ''),
          t.hourly_rate_minor, s.commission_bps, v_commission, v_total - v_commission,
          v_settlement, v_due_in_app, v_total - v_due_in_app)
  returning * into b;   -- the exclusion constraint rejects double bookings

  insert into notifications (user_id, type, data)
  values (t.user_id, 'booking_requested', jsonb_build_object('bookingId', b.id));
  return b;
end;
$$;

revoke all on function public.create_booking from public;
grant execute on function public.create_booking to authenticated;
