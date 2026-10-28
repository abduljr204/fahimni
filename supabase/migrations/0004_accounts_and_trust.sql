-- Fahimni — tutor onboarding & verification, parent accounts, notification preferences and
-- delivery log, account deletion, reports/disputes, suspensions and reminders.
-- Mirrors the prototype services in src/services/mock/ (mock-onboarding, mock-account,
-- mock-moderation, mock-notifications). See docs/ACCOUNTS_AND_TRUST.md.

-- ─── Profiles: private fields and suspension ────────────────────────────────
-- Phone numbers are private: they live in a table only the owner (and the delivery job,
-- with the service role) can read.
create table public.profile_private (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  phone text check (phone ~ '^\+2189[1-5][0-9]{7}$')
);
alter table public.profile_private enable row level security;
create policy "owners manage private profile" on public.profile_private
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table public.profiles
  add column suspended_at timestamptz,
  add column suspension_reason text;
alter table public.student_profiles add column birth_year smallint check (birth_year between 1940 and 2100);

create or replace function public.is_active() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and suspended_at is null);
$$;

-- Suspended accounts can read their data but can't write: tighten the write policies.
drop policy "participants send messages once unlocked" on public.messages;
create policy "participants send messages once unlocked" on public.messages
  for insert with check (sender_id = auth.uid() and is_active() and kind = 'text'
                         and is_participant(conversation_id) and conversation_unlocked(conversation_id));
-- create_booking, accept_proposal and the payments/messages Route Handlers must also check
-- is_active(); add `if not is_active() then raise exception 'account_suspended'; end if;`
-- at the top of each SECURITY DEFINER function.

-- Only admins change suspension fields (extends the existing protection trigger).
create or replace function public.protect_privileged_columns() returns trigger
language plpgsql as $$
begin
  if public.is_admin() then return new; end if;
  if tg_table_name = 'profiles' and (new.role is distinct from old.role
       or new.suspended_at is distinct from old.suspended_at
       or new.suspension_reason is distinct from old.suspension_reason) then
    raise exception 'role and suspension can only be changed by an admin';
  end if;
  if tg_table_name = 'tutor_profiles' and (
       new.verification is distinct from old.verification
    or new.is_published is distinct from old.is_published
    or new.rating is distinct from old.rating
    or new.review_count is distinct from old.review_count) then
    raise exception 'verification, publishing and rating are managed by the platform';
  end if;
  return new;
end;
$$;

-- ─── Tutor applications & verification ──────────────────────────────────────
alter type verification_status add value if not exists 'rejected';
create type application_status as enum ('pending', 'approved', 'rejected');

create table public.tutor_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  tutor_id uuid not null references public.tutor_profiles (id) on delete cascade,
  status application_status not null default 'pending',
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles (id),
  note text check (char_length(note) <= 500),
  created_at timestamptz not null default now()
);

create table public.tutor_documents (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.tutor_applications (id) on delete cascade,
  kind text not null check (kind in ('identity', 'qualification')),
  storage_path text not null,     -- PRIVATE bucket "tutor-documents"
  name text not null,
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  size_bytes integer not null check (size_bytes between 1 and 5242880),
  -- Documents are deleted 90 days after review by a scheduled job.
  delete_after timestamptz
);

alter table public.tutor_applications enable row level security;
alter table public.tutor_documents enable row level security;
create policy "applicants read own application" on public.tutor_applications
  for select using (user_id = auth.uid() or is_admin());
create policy "applicants create own application" on public.tutor_applications
  for insert with check (user_id = auth.uid() and status = 'pending');
create policy "applicants and admins read documents" on public.tutor_documents
  for select using (exists (select 1 from tutor_applications a where a.id = application_id and (a.user_id = auth.uid() or is_admin())));
create policy "applicants add documents" on public.tutor_documents
  for insert with check (exists (select 1 from tutor_applications a where a.id = application_id and a.user_id = auth.uid() and a.status = 'pending'));

create or replace function public.review_application(p_application_id uuid, p_approve boolean, p_note text default null)
returns public.tutor_applications
language plpgsql security definer set search_path = public as $$
declare a tutor_applications;
begin
  if not is_admin() then raise exception 'forbidden'; end if;
  if not p_approve and char_length(coalesce(trim(p_note), '')) < 5 then raise exception 'reason_required'; end if;
  update tutor_applications
     set status = case when p_approve then 'approved' else 'rejected' end::application_status,
         reviewed_at = now(), reviewed_by = auth.uid(), note = nullif(trim(p_note), '')
   where id = p_application_id and status = 'pending'
  returning * into a;
  if not found then raise exception 'not_found'; end if;
  update tutor_profiles
     set verification = case when p_approve then 'verified' else 'rejected' end::verification_status,
         is_published = p_approve
   where id = a.tutor_id;
  update tutor_documents set delete_after = now() + interval '90 days' where application_id = a.id;
  insert into notifications (user_id, type, data)
  values (a.user_id, case when p_approve then 'application_approved' else 'application_rejected' end::notification_type, '{}'::jsonb);
  return a;
end;
$$;

alter type notification_type add value if not exists 'proposal_received';
alter type notification_type add value if not exists 'proposal_accepted';
alter type notification_type add value if not exists 'proposal_declined';
alter type notification_type add value if not exists 'application_approved';
alter type notification_type add value if not exists 'application_rejected';
alter type notification_type add value if not exists 'report_resolved';
alter type notification_type add value if not exists 'account_warning';

-- ─── Notification preferences, delivery log, reminders ──────────────────────
create table public.notification_preferences (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  -- {"email":{"lessons":true,"messages":false,"account":true},"sms":{…},"push":{…}}
  prefs jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.notification_preferences enable row level security;
create policy "owners manage preferences" on public.notification_preferences
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Browser push subscriptions (Web Push), one per device.
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
create policy "owners manage push subscriptions" on public.push_subscriptions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Written only by the delivery job (service role); users read their own log.
create table public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  notification_id uuid references public.notifications (id) on delete set null,
  channel text not null check (channel in ('email', 'sms', 'push')),
  destination text not null,
  status text not null check (status in ('queued', 'sent', 'failed')),
  provider_reference text,
  error text,
  created_at timestamptz not null default now()
);
alter table public.notification_deliveries enable row level security;
create policy "owners read deliveries" on public.notification_deliveries for select using (user_id = auth.uid());

-- Lesson reminders: a scheduled job (pg_cron or a Supabase scheduled function, every 5 min)
-- picks confirmed, paid lessons starting within 24 h / 1 h without that reminder yet.
alter table public.bookings add column reminders_sent text[] not null default '{}';

-- ─── Reports, disputes, moderation ──────────────────────────────────────────
create type report_status as enum ('open', 'resolved', 'dismissed');

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('report', 'dispute')),
  reporter_id uuid references public.profiles (id) on delete set null,   -- null for automatic flags
  target_user_id uuid not null references public.profiles (id) on delete cascade,
  reason text not null,
  details text not null default '' check (char_length(details) <= 1000),
  message_id uuid references public.messages (id) on delete set null,
  conversation_id uuid references public.conversations (id) on delete set null,
  booking_id uuid references public.bookings (id) on delete set null,
  evidence text,                 -- copy of the reported message
  auto boolean not null default false,
  status report_status not null default 'open',
  resolution_action text check (resolution_action in ('none', 'warning', 'suspend', 'unpublish', 'refund')),
  resolution_note text,
  refund_minor integer,
  resolved_by uuid references public.profiles (id),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
create index reports_open_idx on public.reports (status, created_at) where status = 'open';
create unique index one_open_dispute_per_booking on public.reports (booking_id) where kind = 'dispute' and status = 'open';

alter table public.reports enable row level security;
create policy "reporters read own reports" on public.reports for select using (reporter_id = auth.uid() or is_admin());
-- Inserts go through file_report() so the relationship and dispute window are checked.

create or replace function public.file_report(
  p_kind text, p_target uuid, p_reason text, p_details text,
  p_message_id uuid default null, p_booking_id uuid default null
) returns public.reports
language plpgsql security definer set search_path = public as $$
declare r reports; b bookings; m messages;
begin
  if auth.uid() is null or not is_active() then raise exception 'forbidden'; end if;
  if p_kind = 'dispute' then
    select * into b from bookings where id = p_booking_id;
    if not found or not acts_for_student(b.student_id) then raise exception 'forbidden'; end if;
    if not is_paid_and_confirmed(b) or now() < b.starts_at or now() > b.starts_at + interval '14 days' then
      raise exception 'dispute_not_allowed';
    end if;
    select user_id into p_target from tutor_profiles where id = b.tutor_id;
  elsif p_message_id is not null then
    select * into m from messages where id = p_message_id;
    if not found or not is_participant(m.conversation_id) then raise exception 'forbidden'; end if;
    p_target := m.sender_id;
  end if;
  -- Only people you've dealt with, or a tutor's public profile.
  if not exists (select 1 from tutor_profiles where user_id = p_target and is_published)
     and not exists (select 1 from conversations c where is_participant(c.id)
                     and (c.student_id = p_target or c.tutor_user_id = p_target)) then
    raise exception 'forbidden';
  end if;
  insert into reports (kind, reporter_id, target_user_id, reason, details, message_id, booking_id, evidence)
  values (p_kind, auth.uid(), p_target, p_reason, coalesce(p_details, ''), p_message_id, p_booking_id, left(m.body, 1000))
  returning * into r;
  return r;
end;
$$;

-- Applies an admin decision. Refunds are issued by the payments Route Handler with the
-- provider; this records the decision and the amount.
create or replace function public.resolve_report(p_report_id uuid, p_action text, p_dismiss boolean, p_note text, p_refund_minor integer default null)
returns public.reports
language plpgsql security definer set search_path = public as $$
declare r reports;
begin
  if not is_admin() then raise exception 'forbidden'; end if;
  select * into r from reports where id = p_report_id and status = 'open' for update;
  if not found then raise exception 'not_found'; end if;
  if not p_dismiss then
    if p_action = 'suspend' then
      update profiles set suspended_at = now(), suspension_reason = p_note where id = r.target_user_id;
      update tutor_profiles set is_published = false where user_id = r.target_user_id;
    elsif p_action = 'unpublish' then
      update tutor_profiles set is_published = false where user_id = r.target_user_id;
    elsif p_action = 'warning' then
      insert into notifications (user_id, type, data) values (r.target_user_id, 'account_warning', '{}'::jsonb);
    end if;
  end if;
  update reports set status = case when p_dismiss then 'dismissed' else 'resolved' end::report_status,
         resolution_action = case when p_dismiss then 'none' else p_action end,
         resolution_note = p_note, refund_minor = p_refund_minor, resolved_by = auth.uid(), resolved_at = now()
   where id = r.id returning * into r;
  if r.reporter_id is not null then
    insert into notifications (user_id, type, data) values (r.reporter_id, 'report_resolved', jsonb_build_object('bookingId', r.booking_id));
  end if;
  return r;
end;
$$;

revoke all on function public.review_application, public.file_report, public.resolve_report from public;
grant execute on function public.review_application, public.file_report, public.resolve_report to authenticated;

-- ─── Account deletion ───────────────────────────────────────────────────────
-- Run by the `DELETE /api/account` Route Handler with the service role after re-checking the
-- password: refuse if the user (or their children) has upcoming paid lessons; cancel and
-- refund pending requests; anonymise profiles; delete student_profiles, profile_private,
-- favorites, notifications, preferences, push subscriptions and storage objects; then delete
-- the auth user. Bookings and payments stay, anonymised, for accounting.
