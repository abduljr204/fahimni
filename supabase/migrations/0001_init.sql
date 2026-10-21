-- Naqraw — initial production schema (Phase 4).
-- Mirrors src/domain/types.ts. Every table has Row Level Security enabled; the
-- browser only ever uses the anon key, so these policies ARE the authorization layer.
-- Privileged transitions (confirming bookings, payments) run in SECURITY DEFINER
-- functions or server-side Route Handlers using the service-role key.

create extension if not exists "pgcrypto";
create extension if not exists "btree_gist";

-- ─── Enums ──────────────────────────────────────────────────────────────────
create type user_role as enum ('student', 'tutor', 'admin');
create type subject_category as enum ('math','science','engineering','medicine','it','business','languages','law');
create type lesson_mode as enum ('online', 'in_person');
create type verification_status as enum ('verified', 'pending', 'unverified');
create type booking_status as enum ('pending', 'confirmed', 'declined', 'cancelled', 'completed');
create type payment_status as enum ('unpaid', 'simulated', 'authorized', 'paid', 'refunded');
create type notification_type as enum (
  'booking_requested','booking_confirmed','booking_declined','booking_cancelled',
  'lesson_reminder','new_message','review_received','welcome'
);

-- ─── Users ──────────────────────────────────────────────────────────────────
-- One row per auth.users entry, created by the trigger below.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role user_role not null default 'student',
  display_name jsonb not null default '{}'::jsonb,      -- LocalizedText {"ar": "...", "en": "..."}
  avatar_hue smallint not null default 260 check (avatar_hue between 0 and 360),
  avatar_url text,
  preferred_locale text not null default 'ar' check (preferred_locale in ('ar', 'en')),
  created_at timestamptz not null default now()
);

create table public.student_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles (id) on delete cascade,
  university jsonb not null default '{}'::jsonb,
  major jsonb not null default '{}'::jsonb,
  study_year smallint not null check (study_year between 1 and 8),
  created_at timestamptz not null default now()
);

-- ─── Catalogue ──────────────────────────────────────────────────────────────
create table public.subjects (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name jsonb not null,
  category subject_category not null
);

create table public.tutor_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles (id) on delete cascade,
  display_name jsonb not null,
  headline jsonb not null default '{}'::jsonb,
  bio jsonb not null default '{}'::jsonb,
  university jsonb not null default '{}'::jsonb,
  city jsonb not null default '{}'::jsonb,
  languages text[] not null default '{}',
  modes lesson_mode[] not null default '{online}',
  -- Minor units per ISO 4217: LYD has 3 decimals (1 dinar = 1,000 dirhams).
  hourly_rate_minor integer not null check (hourly_rate_minor > 0),
  currency char(3) not null default 'LYD',
  years_experience smallint not null default 0,
  rating numeric(2,1) not null default 0,
  review_count integer not null default 0,
  lessons_completed integer not null default 0,
  response_time_minutes integer not null default 60,
  -- Only admins may change verification (enforced by the policy + trigger below).
  verification verification_status not null default 'unverified',
  instant_book boolean not null default false,
  timezone text not null default 'Africa/Tripoli',
  is_published boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.tutor_subjects (
  tutor_id uuid references public.tutor_profiles (id) on delete cascade,
  subject_id uuid references public.subjects (id) on delete restrict,
  primary key (tutor_id, subject_id)
);

create table public.availability_windows (
  id uuid primary key default gen_random_uuid(),
  tutor_id uuid not null references public.tutor_profiles (id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  start_time time not null,
  end_time time not null,
  check (start_time < end_time)
);

-- ─── Bookings ───────────────────────────────────────────────────────────────
create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles (id) on delete restrict,
  tutor_id uuid not null references public.tutor_profiles (id) on delete restrict,
  subject_id uuid not null references public.subjects (id),
  starts_at timestamptz not null,
  duration_minutes smallint not null check (duration_minutes in (30, 60, 90)),
  mode lesson_mode not null,
  status booking_status not null default 'pending',
  price_minor integer not null check (price_minor >= 0),
  currency char(3) not null,
  payment_status payment_status not null default 'unpaid',
  note text check (char_length(note) <= 500),
  meeting_url text,
  location jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- A tutor can never be double-booked, even under concurrent requests.
  constraint no_overlapping_bookings exclude using gist (
    tutor_id with =,
    tstzrange(starts_at, starts_at + make_interval(mins => duration_minutes)) with &&
  ) where (status in ('pending', 'confirmed'))
);
create index bookings_student_idx on public.bookings (student_id, starts_at);
create index bookings_tutor_idx on public.bookings (tutor_id, starts_at);

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.bookings (id) on delete cascade,
  tutor_id uuid not null references public.tutor_profiles (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  comment text check (char_length(comment) <= 600),
  created_at timestamptz not null default now()
);

create table public.favorites (
  user_id uuid references public.profiles (id) on delete cascade,
  tutor_id uuid references public.tutor_profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, tutor_id)
);

-- ─── Messaging ──────────────────────────────────────────────────────────────
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles (id) on delete cascade,
  tutor_id uuid not null references public.tutor_profiles (id) on delete cascade,
  tutor_user_id uuid not null references public.profiles (id) on delete cascade,
  last_message_at timestamptz not null default now(),
  last_message_preview text not null default '',
  last_message_sender_id uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  unique (student_id, tutor_id)
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index messages_conversation_idx on public.messages (conversation_id, created_at);

-- ─── Notifications ──────────────────────────────────────────────────────────
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  type notification_type not null,
  data jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);

-- ─── Helpers ────────────────────────────────────────────────────────────────
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin');
$$;

create or replace function public.owns_tutor(t uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from tutor_profiles where id = t and user_id = auth.uid());
$$;

create or replace function public.is_participant(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from conversations
    where id = c and (student_id = auth.uid() or tutor_user_id = auth.uid())
  );
$$;

-- New auth users get a student profile row automatically.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, display_name)
  values (new.id, jsonb_build_object('ar', coalesce(new.raw_user_meta_data->>'full_name', ''),
                                     'en', coalesce(new.raw_user_meta_data->>'full_name', '')));
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Users cannot promote themselves or self-verify.
create or replace function public.protect_privileged_columns() returns trigger
language plpgsql as $$
begin
  if public.is_admin() then return new; end if;
  if tg_table_name = 'profiles' and new.role is distinct from old.role then
    raise exception 'role can only be changed by an admin';
  end if;
  if tg_table_name = 'tutor_profiles' and (
       new.verification is distinct from old.verification
    or new.rating is distinct from old.rating
    or new.review_count is distinct from old.review_count) then
    raise exception 'verification and rating are managed by the platform';
  end if;
  return new;
end;
$$;
create trigger protect_profiles before update on public.profiles
  for each row execute function public.protect_privileged_columns();
create trigger protect_tutor_profiles before update on public.tutor_profiles
  for each row execute function public.protect_privileged_columns();

-- ─── Row Level Security ─────────────────────────────────────────────────────
alter table public.profiles enable row level security;
alter table public.student_profiles enable row level security;
alter table public.subjects enable row level security;
alter table public.tutor_profiles enable row level security;
alter table public.tutor_subjects enable row level security;
alter table public.availability_windows enable row level security;
alter table public.bookings enable row level security;
alter table public.reviews enable row level security;
alter table public.favorites enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.notifications enable row level security;

-- Profiles: public display info, self-managed.
create policy "profiles are readable" on public.profiles for select using (true);
create policy "users update own profile" on public.profiles for update using (id = auth.uid());

create policy "students read own student profile" on public.student_profiles
  for select using (user_id = auth.uid() or is_admin());
create policy "students manage own student profile" on public.student_profiles
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Catalogue: public read; writes by admins only.
create policy "subjects readable" on public.subjects for select using (true);
create policy "admins manage subjects" on public.subjects for all using (is_admin()) with check (is_admin());

create policy "published tutors readable" on public.tutor_profiles
  for select using (is_published or user_id = auth.uid() or is_admin());
create policy "tutors update own profile" on public.tutor_profiles
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "tutors create own profile" on public.tutor_profiles
  for insert with check (user_id = auth.uid());

create policy "tutor subjects readable" on public.tutor_subjects for select using (true);
create policy "tutors manage own subjects" on public.tutor_subjects
  for all using (owns_tutor(tutor_id)) with check (owns_tutor(tutor_id));

create policy "availability readable" on public.availability_windows for select using (true);
create policy "tutors manage own availability" on public.availability_windows
  for all using (owns_tutor(tutor_id)) with check (owns_tutor(tutor_id));

-- Bookings: visible to the two parties. Creation and status changes go through
-- the functions below so price, slot and state transitions are validated server-side.
create policy "parties read bookings" on public.bookings
  for select using (student_id = auth.uid() or owns_tutor(tutor_id) or is_admin());

create policy "reviews readable" on public.reviews for select using (true);

create policy "users manage own favorites" on public.favorites
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "participants read conversations" on public.conversations
  for select using (student_id = auth.uid() or tutor_user_id = auth.uid());
create policy "students start conversations" on public.conversations
  for insert with check (student_id = auth.uid());

create policy "participants read messages" on public.messages
  for select using (is_participant(conversation_id));
create policy "participants send messages" on public.messages
  for insert with check (sender_id = auth.uid() and is_participant(conversation_id));
create policy "recipients mark messages read" on public.messages
  for update using (is_participant(conversation_id) and sender_id <> auth.uid());

create policy "users read own notifications" on public.notifications
  for select using (user_id = auth.uid());
create policy "users mark own notifications read" on public.notifications
  for update using (user_id = auth.uid());

-- ─── Booking functions (authoritative business rules) ───────────────────────
create or replace function public.create_booking(
  p_tutor_id uuid, p_subject_id uuid, p_starts_at timestamptz,
  p_duration smallint, p_mode lesson_mode, p_note text default null
) returns public.bookings
language plpgsql security definer set search_path = public as $$
declare
  t tutor_profiles;
  b bookings;
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
  -- Slot must sit inside an availability window (tutor's local time).
  if not exists (
    select 1 from availability_windows w
    where w.tutor_id = p_tutor_id
      and w.weekday = extract(dow from p_starts_at at time zone t.timezone)
      and (p_starts_at at time zone t.timezone)::time >= w.start_time
      and ((p_starts_at + make_interval(mins => p_duration)) at time zone t.timezone)::time <= w.end_time
  ) then
    raise exception 'slot_unavailable';
  end if;

  insert into bookings (student_id, tutor_id, subject_id, starts_at, duration_minutes, mode,
                        status, price_minor, currency, note)
  values (auth.uid(), p_tutor_id, p_subject_id, p_starts_at, p_duration, p_mode,
          case when t.instant_book then 'confirmed' else 'pending' end,
          round(t.hourly_rate_minor * p_duration / 60.0), t.currency, nullif(trim(p_note), ''))
  returning * into b;   -- the exclusion constraint rejects double bookings

  insert into notifications (user_id, type, data)
  values (t.user_id, 'booking_requested', jsonb_build_object('bookingId', b.id));
  return b;
end;
$$;

create or replace function public.respond_to_booking(p_booking_id uuid, p_accept boolean)
returns public.bookings
language plpgsql security definer set search_path = public as $$
declare b bookings;
begin
  update bookings set status = case when p_accept then 'confirmed' else 'declined' end, updated_at = now()
  where id = p_booking_id and status = 'pending' and owns_tutor(tutor_id)
  returning * into b;
  if not found then raise exception 'forbidden'; end if;
  insert into notifications (user_id, type, data)
  values (b.student_id, case when p_accept then 'booking_confirmed' else 'booking_declined' end::notification_type,
          jsonb_build_object('bookingId', b.id));
  return b;
end;
$$;

create or replace function public.cancel_booking(p_booking_id uuid) returns public.bookings
language plpgsql security definer set search_path = public as $$
declare b bookings;
begin
  update bookings set status = 'cancelled', updated_at = now()
  where id = p_booking_id and status in ('pending', 'confirmed') and starts_at > now()
    and (student_id = auth.uid() or owns_tutor(tutor_id))
  returning * into b;
  if not found then raise exception 'forbidden'; end if;
  return b;
end;
$$;

create or replace function public.submit_review(p_booking_id uuid, p_rating smallint, p_comment text)
returns public.reviews
language plpgsql security definer set search_path = public as $$
declare b bookings; r reviews;
begin
  select * into b from bookings where id = p_booking_id and student_id = auth.uid() and status = 'completed';
  if not found then raise exception 'forbidden'; end if;
  insert into reviews (booking_id, tutor_id, student_id, rating, comment)
  values (b.id, b.tutor_id, auth.uid(), p_rating, nullif(trim(p_comment), ''))
  returning * into r;
  update tutor_profiles set
    rating = (select round(avg(rating)::numeric, 1) from reviews where tutor_id = b.tutor_id),
    review_count = (select count(*) from reviews where tutor_id = b.tutor_id)
  where id = b.tutor_id;
  return r;
end;
$$;

revoke all on function public.create_booking, public.respond_to_booking, public.cancel_booking, public.submit_review from public;
grant execute on function public.create_booking, public.respond_to_booking, public.cancel_booking, public.submit_review to authenticated;

-- Realtime for chat and notifications.
alter publication supabase_realtime add table public.messages, public.notifications;
