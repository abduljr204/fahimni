-- Fahimni — pre-booking chat, lesson proposals, protected meeting details, parent-managed
-- students and the private video classroom.
--
-- Mirrors src/domain/{access,contact-guard,pricing,refunds}.ts and the prototype services in
-- src/services/mock/. Every rule the prototype enforces in the browser is enforced here, on
-- the server, for production. See docs/PRE_BOOKING_AND_CLASSROOM.md.

-- ─── Parents and younger students ───────────────────────────────────────────
alter type user_role add value if not exists 'parent';

alter table public.student_profiles
  add column guardian_user_id uuid references public.profiles (id) on delete set null,
  add column level text check (level in ('secondary', 'university_early', 'university_advanced', 'postgraduate'));

-- True for the student themselves and for the parent who manages them.
create or replace function public.acts_for_student(s uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select s = auth.uid()
      or exists (select 1 from student_profiles where user_id = s and guardian_user_id = auth.uid());
$$;

-- ─── Tutor profile details shown before booking ─────────────────────────────
alter table public.tutor_profiles
  add column qualifications jsonb not null default '[]'::jsonb,       -- LocalizedText[]
  add column grade_levels text[] not null default '{}',
  add column intro_video_path text,                                   -- object in the private "intro-videos" bucket
  add column intro_video_seconds integer;

-- ─── Platform settings ──────────────────────────────────────────────────────
alter table public.platform_settings
  add column in_person_payment_options settlement_method[] not null default '{in_app,deposit_and_cash}'
    check (cardinality(in_person_payment_options) >= 1),
  add column classroom_opens_minutes_before smallint not null default 15 check (classroom_opens_minutes_before between 0 and 120),
  add column classroom_closes_minutes_after smallint not null default 30 check (classroom_closes_minutes_after between 0 and 120);

-- ─── Bookings: booking, payment and lesson state kept separate ──────────────
create type lesson_status as enum ('scheduled', 'in_progress', 'completed');

alter table public.bookings
  add column lesson_status lesson_status not null default 'scheduled',
  add column booked_by uuid references public.profiles (id),
  add column objectives text check (char_length(objectives) <= 600),
  add column area text check (char_length(area) <= 80);

-- 'completed' used to be a booking status. It is now a lesson status on a confirmed booking.
-- (Postgres can't drop an enum value; 'completed' simply stops being used in booking_status.)
update public.bookings set status = 'confirmed', lesson_status = 'completed' where status = 'completed';
update public.bookings set booked_by = student_id where booked_by is null;
alter table public.bookings alter column booked_by set not null;
alter table public.bookings add constraint booking_status_not_completed check (status <> 'completed');

alter type payment_status add value if not exists 'partially_refunded';
alter type payment_record_status add value if not exists 'partially_refunded';
alter table public.payments add column refunded_minor integer check (refunded_minor >= 0);

-- Exact meeting places live apart from bookings, readable only once confirmed and paid.
create table public.booking_meeting_details (
  booking_id uuid primary key references public.bookings (id) on delete cascade,
  location jsonb not null,           -- LocalizedText
  notes text check (char_length(notes) <= 500)
);
insert into public.booking_meeting_details (booking_id, location)
  select id, location from public.bookings where location is not null;
alter table public.bookings drop column location;
alter table public.bookings drop column meeting_url;   -- online lessons use the in-app classroom

create or replace function public.is_paid_and_confirmed(b public.bookings) returns boolean
language sql immutable as $$
  select b.status = 'confirmed' and b.payment_status in ('simulated', 'authorized', 'paid');
$$;

alter table public.booking_meeting_details enable row level security;
create policy "participants read meeting details once paid" on public.booking_meeting_details
  for select using (exists (
    select 1 from bookings b
    where b.id = booking_id and is_paid_and_confirmed(b)
      and (acts_for_student(b.student_id) or owns_tutor(b.tutor_id))
  ));
create policy "tutors set meeting details for paid lessons" on public.booking_meeting_details
  for all using (exists (select 1 from bookings b where b.id = booking_id and owns_tutor(b.tutor_id) and is_paid_and_confirmed(b)))
  with check (exists (select 1 from bookings b where b.id = booking_id and owns_tutor(b.tutor_id) and is_paid_and_confirmed(b)));

-- Parents can see their child's bookings.
drop policy "parties read bookings" on public.bookings;
create policy "parties read bookings" on public.bookings
  for select using (acts_for_student(student_id) or owns_tutor(tutor_id) or is_admin());

-- ─── Conversations: parents take part; unlock after a paid booking ──────────
create or replace function public.is_participant(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from conversations
    where id = c and (acts_for_student(student_id) or tutor_user_id = auth.uid())
  );
$$;

create or replace function public.conversation_unlocked(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from conversations cv join bookings b on b.student_id = cv.student_id and b.tutor_id = cv.tutor_id
    where cv.id = c and is_paid_and_confirmed(b)
  );
$$;

drop policy "participants read conversations" on public.conversations;
create policy "participants read conversations" on public.conversations
  for select using (acts_for_student(student_id) or tutor_user_id = auth.uid());
drop policy "students start conversations" on public.conversations;
create policy "learners start conversations" on public.conversations
  for insert with check (acts_for_student(student_id));

create type message_kind as enum ('text', 'proposal', 'system');
alter table public.messages
  add column kind message_kind not null default 'text',
  add column proposal_id uuid,
  add column system_event text check (system_event in ('contact_unlocked', 'contact_locked')),
  drop constraint messages_body_check,
  add constraint messages_body_check check (char_length(body) <= 2000);

-- Before payment, messages must pass the contact check in src/domain/contact-guard.ts, which
-- can't run in SQL. So clients may insert directly only into unlocked conversations; locked
-- ones go through the `POST /api/messages` Route Handler, which runs the check and inserts
-- with the service-role key.
drop policy "participants send messages" on public.messages;
create policy "participants send messages once unlocked" on public.messages
  for insert with check (sender_id = auth.uid() and kind = 'text' and is_participant(conversation_id) and conversation_unlocked(conversation_id));

create table public.message_attachments (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages (id) on delete cascade,
  storage_path text not null,       -- object in the private "chat-attachments" bucket
  name text not null check (char_length(name) <= 120),
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  size_bytes integer not null check (size_bytes between 1 and 5242880),
  width integer,
  height integer
);
alter table public.message_attachments enable row level security;
create policy "participants read attachments" on public.message_attachments
  for select using (exists (select 1 from messages m where m.id = message_id and is_participant(m.conversation_id)));
-- Storage: create a PRIVATE bucket "chat-attachments"; serve files with short-lived signed
-- URLs after the same participant check. Inserts go through the messages Route Handler.

-- ─── Lesson proposals ───────────────────────────────────────────────────────
create type proposal_status as enum ('pending', 'accepted', 'declined', 'withdrawn', 'expired');

create table public.lesson_proposals (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  tutor_id uuid not null references public.tutor_profiles (id),
  student_id uuid not null references public.profiles (id),
  subject_id uuid not null references public.subjects (id),
  objectives text not null check (char_length(objectives) between 10 and 600),
  starts_at timestamptz not null,
  duration_minutes smallint not null check (duration_minutes in (30, 60, 90)),
  mode lesson_mode not null,
  area text check (char_length(area) <= 80),
  -- Fixed when sent; the payment option is chosen at checkout.
  hourly_rate_minor integer not null,
  commission_bps integer not null,
  price_minor integer not null,
  currency char(3) not null,
  status proposal_status not null default 'pending',
  expires_at timestamptz not null,
  booking_id uuid references public.bookings (id),
  responded_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.messages add constraint messages_proposal_fk foreign key (proposal_id) references public.lesson_proposals (id);
alter table public.bookings add column proposal_id uuid references public.lesson_proposals (id);

alter table public.lesson_proposals enable row level security;
create policy "participants read proposals" on public.lesson_proposals
  for select using (is_participant(conversation_id));
-- Writes only through the functions below (tutor area text is checked for exact addresses by
-- the proposals Route Handler, which calls create_proposal with the service role).

create or replace function public.accept_proposal(
  p_proposal_id uuid, p_settlement settlement_method,
  p_expected_total_minor integer, p_expected_due_in_app_minor integer
) returns public.bookings
language plpgsql security definer set search_path = public as $$
declare
  p lesson_proposals;
  s platform_settings;
  b bookings;
  v_commission integer;
  v_due_in_app integer;
begin
  select * into p from lesson_proposals where id = p_proposal_id for update;
  if not found or not acts_for_student(p.student_id) then raise exception 'forbidden'; end if;
  if p.status = 'pending' and p.expires_at < now() then
    update lesson_proposals set status = 'expired', responded_at = now() where id = p.id;
    raise exception 'proposal_unavailable';
  end if;
  if p.status <> 'pending' then raise exception 'proposal_unavailable'; end if;

  select * into s from platform_settings;
  if p.mode = 'online' and p_settlement <> 'in_app' then raise exception 'validation'; end if;
  if p.mode = 'in_person' and not (p_settlement = any (s.in_person_payment_options)) then raise exception 'validation'; end if;

  -- Same agreed price; only the split depends on the option chosen now.
  v_commission := round(p.price_minor * p.commission_bps / 10000.0);
  v_due_in_app := case when p_settlement = 'in_app' then p.price_minor else v_commission end;
  if p.price_minor <> p_expected_total_minor or v_due_in_app <> p_expected_due_in_app_minor then
    raise exception 'price_changed';
  end if;

  insert into bookings (student_id, tutor_id, subject_id, starts_at, duration_minutes, mode, status,
                        price_minor, currency, hourly_rate_minor, commission_bps, commission_minor,
                        tutor_earnings_minor, settlement, due_in_app_minor, due_in_cash_minor,
                        booked_by, proposal_id, objectives, area)
  values (p.student_id, p.tutor_id, p.subject_id, p.starts_at, p.duration_minutes, p.mode, 'confirmed',
          p.price_minor, p.currency, p.hourly_rate_minor, p.commission_bps, v_commission,
          p.price_minor - v_commission, p_settlement, v_due_in_app, p.price_minor - v_due_in_app,
          auth.uid(), p.id, p.objectives, p.area)
  returning * into b;   -- the exclusion constraint rejects a slot that was taken meanwhile

  update lesson_proposals set status = 'accepted', booking_id = b.id, responded_at = now() where id = p.id;
  insert into notifications (user_id, type, data)
  select t.user_id, 'booking_requested', jsonb_build_object('bookingId', b.id) from tutor_profiles t where t.id = p.tutor_id;
  -- Payment happens next (payments Route Handler); the conversation unlocks when it succeeds.
  return b;
end;
$$;

create or replace function public.respond_to_proposal(p_proposal_id uuid, p_action text) returns public.lesson_proposals
language plpgsql security definer set search_path = public as $$
declare p lesson_proposals;
begin
  select * into p from lesson_proposals where id = p_proposal_id for update;
  if not found then raise exception 'forbidden'; end if;
  if p_action = 'decline' and not acts_for_student(p.student_id) then raise exception 'forbidden'; end if;
  if p_action = 'withdraw' and not owns_tutor(p.tutor_id) then raise exception 'forbidden'; end if;
  if p.status <> 'pending' then raise exception 'proposal_unavailable'; end if;
  update lesson_proposals set status = case when p_action = 'decline' then 'declined' else 'withdrawn' end::proposal_status,
                              responded_at = now()
  where id = p.id returning * into p;
  return p;
end;
$$;

-- ─── Direct booking: payment option and parent bookings ─────────────────────
drop function public.create_booking(uuid, uuid, timestamptz, smallint, lesson_mode, integer, integer, text);

create or replace function public.create_booking(
  p_tutor_id uuid, p_subject_id uuid, p_starts_at timestamptz,
  p_duration smallint, p_mode lesson_mode, p_settlement settlement_method,
  p_expected_total_minor integer, p_expected_due_in_app_minor integer,
  p_note text default null, p_for_student uuid default null
) returns public.bookings
language plpgsql security definer set search_path = public as $$
declare
  t tutor_profiles;
  s platform_settings;
  b bookings;
  v_student uuid := coalesce(p_for_student, auth.uid());
  v_total integer;
  v_commission integer;
  v_due_in_app integer;
begin
  if auth.uid() is null then raise exception 'unauthorized'; end if;
  if not acts_for_student(v_student) then raise exception 'forbidden'; end if;
  select * into t from tutor_profiles where id = p_tutor_id and is_published;
  if not found then raise exception 'not_found'; end if;
  if t.user_id = v_student or t.user_id = auth.uid() then raise exception 'forbidden'; end if;
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

  select * into s from platform_settings;
  if p_mode = 'online' and p_settlement <> 'in_app' then raise exception 'validation'; end if;
  if p_mode = 'in_person' and not (p_settlement = any (s.in_person_payment_options)) then raise exception 'validation'; end if;

  -- Same arithmetic as priceLesson() in src/domain/pricing.ts.
  v_total := round(t.hourly_rate_minor * p_duration / 60.0);
  v_commission := round(v_total * s.commission_bps / 10000.0);
  v_due_in_app := case when p_settlement = 'in_app' then v_total else v_commission end;
  if v_total <> p_expected_total_minor or v_due_in_app <> p_expected_due_in_app_minor then
    raise exception 'price_changed';
  end if;

  insert into bookings (student_id, tutor_id, subject_id, starts_at, duration_minutes, mode,
                        status, price_minor, currency, note,
                        hourly_rate_minor, commission_bps, commission_minor, tutor_earnings_minor,
                        settlement, due_in_app_minor, due_in_cash_minor, booked_by)
  values (v_student, p_tutor_id, p_subject_id, p_starts_at, p_duration, p_mode,
          case when t.instant_book then 'confirmed' else 'pending' end,
          v_total, t.currency, nullif(trim(p_note), ''),
          t.hourly_rate_minor, s.commission_bps, v_commission, v_total - v_commission,
          p_settlement, v_due_in_app, v_total - v_due_in_app, auth.uid())
  returning * into b;   -- the exclusion constraint rejects double bookings

  insert into notifications (user_id, type, data)
  values (t.user_id, 'booking_requested', jsonb_build_object('bookingId', b.id));
  return b;
end;
$$;

revoke all on function public.create_booking from public;
grant execute on function public.create_booking to authenticated;

-- ─── Classroom access ───────────────────────────────────────────────────────
-- Used by the token Route Handler (src/services/video/server.ts). Returns the caller's role
-- only for a participant of a confirmed, paid online lesson inside the entry window.
create or replace function public.classroom_access(p_booking_id uuid) returns text
language plpgsql stable security definer set search_path = public as $$
declare
  b bookings;
  s platform_settings;
  role text;
begin
  select * into b from bookings where id = p_booking_id;
  if not found then raise exception 'forbidden'; end if;   -- same answer as "not yours"
  role := case
    when owns_tutor(b.tutor_id) then 'tutor'
    when b.student_id = auth.uid() then 'student'
    when acts_for_student(b.student_id) then 'guardian'
  end;
  if role is null then raise exception 'forbidden'; end if;
  if b.mode <> 'online' or not is_paid_and_confirmed(b) then raise exception 'classroom_closed'; end if;
  select * into s from platform_settings;
  if now() < b.starts_at - make_interval(mins => s.classroom_opens_minutes_before)
     or now() > b.starts_at + make_interval(mins => b.duration_minutes + s.classroom_closes_minutes_after) then
    raise exception 'classroom_closed';
  end if;
  return role;
end;
$$;

-- Lessons are never recorded by default. A future recording feature needs its own table of
-- explicit, per-lesson consent from every participant, plus retention and deletion rules,
-- before any recording is enabled in the video provider.

revoke all on function public.accept_proposal, public.respond_to_proposal, public.classroom_access from public;
grant execute on function public.accept_proposal, public.respond_to_proposal, public.classroom_access to authenticated;

alter publication supabase_realtime add table public.lesson_proposals;
