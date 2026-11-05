-- Fahimni — the production API.
--
-- The browser never touches tables directly (0001–0004 assumed it would). Everything goes
-- through the functions below, which check who is asking, enforce the same rules as the
-- prototype services in src/services/mock/, and return JSON in the shapes of
-- src/domain/types.ts. A few tables stay readable under RLS for Supabase Realtime.
--
-- Functions ending in `_as` take the acting user explicitly. They are granted to the service
-- role only, and are called by Route Handlers after they verify the session and run checks
-- that live in TypeScript (src/domain/contact-guard.ts).

-- ─── Schema adjustments ─────────────────────────────────────────────────────

-- Managed children have a profile but no login, so profiles can't require an auth user.
-- Deleting an account anonymises the profile and keeps it for bookings and accounting.
alter table public.profiles drop constraint profiles_id_fkey;
alter table public.profiles
  alter column id set default gen_random_uuid(),
  add column managed boolean not null default false;

-- Younger students count school years, up to 12.
alter table public.student_profiles drop constraint student_profiles_study_year_check;
alter table public.student_profiles add constraint student_profiles_study_year_check check (study_year between 1 and 12);

-- Reviews are public, so they carry the author's name instead of exposing their profile.
alter table public.reviews
  add column author_id uuid references public.profiles (id) on delete set null,
  add column author_name jsonb not null default '{}'::jsonb,
  add column author_hue smallint not null default 260,
  add column subject_id uuid references public.subjects (id);

alter table public.tutor_profiles add column profile_views integer not null default 0;

-- The default payment option is fixed with the offer; the learner can change it at checkout.
alter table public.lesson_proposals add column settlement settlement_method not null default 'in_app';

alter table public.notification_deliveries
  add column type text,
  add column data jsonb not null default '{}'::jsonb;

-- Spam protection, shared by every server instance.
create table public.rate_events (
  user_id uuid not null,
  action text not null,
  created_at timestamptz not null default now()
);
create index rate_events_lookup on public.rate_events (user_id, action, created_at);
alter table public.rate_events enable row level security;

-- Blocked pre-booking messages; repeated attempts raise an automatic report for admins.
create table public.blocked_attempts (
  user_id uuid not null,
  body text not null,
  created_at timestamptz not null default now()
);
create index blocked_attempts_lookup on public.blocked_attempts (user_id, created_at);
alter table public.blocked_attempts enable row level security;

-- ─── Small helpers ──────────────────────────────────────────────────────────

-- Same format as Date.prototype.toISOString(), so the app can compare and sort the text.
create or replace function public.iso(ts timestamptz) returns text
language sql immutable set search_path = public as $$
  select to_char(ts at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
$$;

create or replace function public.money_json(p_minor integer, p_currency text) returns jsonb
language sql immutable set search_path = public as $$
  select jsonb_build_object('amountMinor', p_minor, 'currency', trim(p_currency));
$$;

-- People write in one language; it is shown as written in both.
create or replace function public.both_langs(p_text text) returns jsonb
language sql immutable set search_path = public as $$
  select jsonb_build_object('ar', p_text, 'en', p_text);
$$;

create or replace function public.try_uuid(p_text text) returns uuid
language plpgsql immutable set search_path = public as $$
begin
  return p_text::uuid;
exception when others then
  return null;
end;
$$;

create or replace function public.require_active() returns uuid
language plpgsql stable security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_suspended timestamptz;
begin
  if v_user is null then raise exception 'unauthorized'; end if;
  select suspended_at into v_suspended from profiles where id = v_user;
  if not found then raise exception 'unauthorized'; end if;
  if v_suspended is not null then raise exception 'account_suspended'; end if;
  return v_user;
end;
$$;

create or replace function public.require_admin() returns uuid
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'unauthorized'; end if;
  if not is_admin() then raise exception 'forbidden'; end if;
  return auth.uid();
end;
$$;

create or replace function public.require_active_user(p_user uuid) returns void
language plpgsql stable security definer set search_path = public as $$
declare v_suspended timestamptz;
begin
  select suspended_at into v_suspended from profiles where id = p_user;
  if not found then raise exception 'unauthorized'; end if;
  if v_suspended is not null then raise exception 'account_suspended'; end if;
end;
$$;

create or replace function public.hit_rate_limit(p_user uuid, p_action text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_max integer;
  v_window interval;
begin
  select l.max_hits, l.win into v_max, v_window
  from (values
    ('message', 20, interval '1 minute'),
    ('booking', 5, interval '10 minutes'),
    ('proposal', 10, interval '1 hour'),
    ('report', 5, interval '1 hour')
  ) as l(action, max_hits, win)
  where l.action = p_action;
  if (select count(*) from rate_events where user_id = p_user and action = p_action and created_at > now() - v_window) >= v_max then
    raise exception 'rate_limited';
  end if;
  insert into rate_events (user_id, action) values (p_user, p_action);
end;
$$;

-- True for the student themselves and for the parent who manages them, for a given user.
create or replace function public.acts_for(p_actor uuid, p_student uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select p_actor = p_student
      or exists (select 1 from student_profiles where user_id = p_student and guardian_user_id = p_actor);
$$;

-- The learner's side of a conversation or booking: the student and, for children, the parent.
create or replace function public.learner_side(p_student uuid) returns setof uuid
language sql stable security definer set search_path = public as $$
  select p_student
  union
  select guardian_user_id from student_profiles where user_id = p_student and guardian_user_id is not null;
$$;

create or replace function public.notify(p_user uuid, p_type notification_type, p_data jsonb default '{}'::jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  -- Managed children have no inbox of their own; their parent receives a copy.
  if exists (select 1 from profiles where id = p_user and managed) then return; end if;
  insert into notifications (user_id, type, data) values (p_user, p_type, jsonb_strip_nulls(p_data));
end;
$$;

create or replace function public.subject_name(p_subject uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select name from subjects where id = p_subject;
$$;

create or replace function public.display_name_of(p_user uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select display_name from profiles where id = p_user;
$$;

-- Internal triggers must stay able to change these columns; only client roles are restricted.
create or replace function public.protect_privileged_columns() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user not in ('authenticated', 'anon') or public.is_admin() then return new; end if;
  if tg_table_name = 'profiles' and (new.role is distinct from old.role
       or new.suspended_at is distinct from old.suspended_at
       or new.suspension_reason is distinct from old.suspension_reason) then
    raise exception 'role and suspension can only be changed by an admin';
  end if;
  if tg_table_name = 'tutor_profiles' and (
       new.verification is distinct from old.verification
    or new.is_published is distinct from old.is_published
    or new.rating is distinct from old.rating
    or new.review_count is distinct from old.review_count
    or new.lessons_completed is distinct from old.lessons_completed
    or new.profile_views is distinct from old.profile_views) then
    raise exception 'verification, publishing and rating are managed by the platform';
  end if;
  return new;
end;
$$;

-- ─── Accounts ───────────────────────────────────────────────────────────────

create or replace function public.create_child(p_parent uuid, p_child jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := gen_random_uuid();
  v_name text := trim(coalesce(p_child->>'fullName', ''));
  v_school text := trim(coalesce(p_child->>'school', ''));
  v_birth integer := try_uuid(null)::text::integer;
  v_year integer;
  v_hue smallint := floor(random() * 360)::smallint;
  v_age integer;
begin
  v_birth := nullif(p_child->>'birthYear', '')::integer;
  v_year := nullif(p_child->>'studyYear', '')::integer;
  v_age := extract(year from now())::integer - v_birth;
  if char_length(v_name) not between 3 and 60 or char_length(v_school) < 2 or v_year is null then
    raise exception 'validation';
  end if;
  if v_age is null or v_age >= 18 or v_age < 6 then
    raise exception using message = 'validation', detail = '{"birthYear":"childAge"}';
  end if;
  insert into profiles (id, role, display_name, avatar_hue, managed)
  values (v_id, 'student', both_langs(v_name), v_hue, true);
  insert into student_profiles (user_id, university, major, study_year, level, birth_year, guardian_user_id)
  values (v_id, both_langs(v_school), both_langs(v_school), v_year, p_child->>'level', v_birth, p_parent);
  return jsonb_strip_nulls(jsonb_build_object(
    'userId', v_id, 'displayName', both_langs(v_name), 'avatarHue', v_hue, 'level', p_child->>'level'));
end;
$$;

-- Sign-up details arrive as user metadata, which the client controls: the role is limited to
-- what anyone may choose, and the age rule is checked here as well as in the form.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  m jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_role user_role := case m->>'role' when 'parent' then 'parent' when 'tutor' then 'tutor' else 'student' end::user_role;
  v_name text := coalesce(nullif(trim(m->>'full_name'), ''), 'User');
  v_birth integer := nullif(m->>'birth_year', '')::integer;
begin
  insert into profiles (id, role, display_name, avatar_hue)
  values (new.id, v_role, both_langs(v_name), floor(random() * 360)::smallint);

  if nullif(m->>'phone', '') is not null then
    insert into profile_private (user_id, phone) values (new.id, m->>'phone');
  end if;

  if v_role = 'student' and m ? 'university' then
    if v_birth is null or extract(year from now())::integer - v_birth < 18 then
      raise exception using message = 'validation', detail = '{"birthYear":"underAge"}';
    end if;
    insert into student_profiles (user_id, university, major, study_year, birth_year)
    values (new.id, both_langs(m->>'university'), both_langs(m->>'major'), (m->>'study_year')::integer, v_birth);
  elsif v_role = 'parent' and m ? 'child' then
    perform create_child(new.id, m->'child');
  end if;

  perform notify(new.id, 'welcome');
  return new;
end;
$$;

create or replace function public.get_session() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  p profiles;
  v_email text;
begin
  if v_user is null then return null; end if;
  select * into p from profiles where id = v_user;
  if not found then return null; end if;
  select email into v_email from auth.users where id = v_user;
  return jsonb_strip_nulls(jsonb_build_object(
    'user', jsonb_build_object(
      'id', p.id, 'email', v_email, 'role', p.role, 'displayName', p.display_name,
      'avatarHue', p.avatar_hue, 'avatarUrl', p.avatar_url, 'preferredLocale', p.preferred_locale,
      'phone', (select phone from profile_private where user_id = v_user),
      'suspendedAt', iso(p.suspended_at), 'suspensionReason', p.suspension_reason, 'createdAt', iso(p.created_at)),
    'student', (select jsonb_build_object(
      'id', s.id, 'userId', s.user_id, 'university', s.university, 'major', s.major, 'studyYear', s.study_year,
      'level', s.level, 'birthYear', s.birth_year, 'guardianUserId', s.guardian_user_id, 'createdAt', iso(s.created_at))
      from student_profiles s where s.user_id = v_user),
    'tutorId', (select id from tutor_profiles where user_id = v_user),
    'managedStudents', case when p.role = 'parent' then coalesce((
      select jsonb_agg(jsonb_build_object('userId', c.id, 'displayName', c.display_name, 'avatarHue', c.avatar_hue, 'level', s.level) order by c.created_at)
      from student_profiles s join profiles c on c.id = s.user_id where s.guardian_user_id = v_user), '[]'::jsonb) end,
    'isDemo', false));
end;
$$;

create or replace function public.update_my_profile(
  p_full_name text, p_phone text default null, p_university text default null,
  p_major text default null, p_study_year integer default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_user uuid := require_active();
begin
  update profiles set display_name = both_langs(p_full_name) where id = v_user;
  if p_phone is null then
    delete from profile_private where user_id = v_user;
  else
    insert into profile_private (user_id, phone) values (v_user, p_phone)
    on conflict (user_id) do update set phone = excluded.phone;
  end if;
  update student_profiles set
    university = case when p_university is null then university else both_langs(p_university) end,
    major = case when p_major is null then major else both_langs(p_major) end,
    study_year = coalesce(p_study_year, study_year)
  where user_id = v_user;
  update tutor_profiles set display_name = both_langs(p_full_name) where user_id = v_user;
  return get_session();
end;
$$;

create or replace function public.add_child(p_child jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_user uuid := require_active();
begin
  if (select role from profiles where id = v_user) <> 'parent' then raise exception 'forbidden'; end if;
  return create_child(v_user, p_child);
end;
$$;

create or replace function public.get_preferences() returns jsonb
language sql stable security definer set search_path = public as $$
  select prefs from notification_preferences where user_id = auth.uid();
$$;

create or replace function public.update_preferences(p_prefs jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'unauthorized'; end if;
  insert into notification_preferences (user_id, prefs) values (v_user, p_prefs)
  on conflict (user_id) do update set prefs = excluded.prefs, updated_at = now();
  return p_prefs;
end;
$$;

create or replace function public.list_deliveries() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(row_json order by created_at desc), '[]'::jsonb) from (
    select d.created_at, jsonb_build_object(
      'id', d.id, 'userId', d.user_id, 'channel', d.channel, 'to', d.destination, 'type', coalesce(d.type, 'welcome'),
      'data', d.data, 'status', case when d.status = 'queued' then 'sent' else d.status end, 'createdAt', iso(d.created_at)) as row_json
    from notification_deliveries d where d.user_id = auth.uid()
    order by d.created_at desc limit 50
  ) x;
$$;

-- ─── Catalogue ──────────────────────────────────────────────────────────────

create or replace function public.tutor_json(t public.tutor_profiles) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'id', t.id, 'userId', t.user_id, 'displayName', t.display_name, 'avatarHue', p.avatar_hue, 'avatarUrl', p.avatar_url,
    'headline', t.headline, 'bio', t.bio, 'university', t.university, 'city', t.city,
    'subjectIds', coalesce((select jsonb_agg(s.subject_id) from tutor_subjects s where s.tutor_id = t.id), '[]'::jsonb),
    'languages', to_jsonb(t.languages), 'modes', to_jsonb(t.modes),
    'qualifications', t.qualifications, 'gradeLevels', to_jsonb(t.grade_levels),
    'hourlyRate', money_json(t.hourly_rate_minor, t.currency),
    'yearsExperience', t.years_experience, 'rating', t.rating, 'reviewCount', t.review_count,
    'lessonsCompleted', t.lessons_completed, 'responseTimeMinutes', t.response_time_minutes,
    'verification', t.verification, 'instantBook', t.instant_book, 'published', t.is_published,
    'availability', coalesce((
      select jsonb_agg(jsonb_build_object('weekday', w.weekday, 'start', to_char(w.start_time, 'HH24:MI'), 'end', to_char(w.end_time, 'HH24:MI')) order by w.weekday, w.start_time)
      from availability_windows w where w.tutor_id = t.id), '[]'::jsonb),
    'timezone', t.timezone, 'createdAt', iso(t.created_at)))
  from profiles p where p.id = t.user_id;
$$;

create or replace function public.tutor_brief(p_tutor uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'id', t.id, 'userId', t.user_id, 'displayName', t.display_name, 'avatarHue', p.avatar_hue,
    'avatarUrl', p.avatar_url, 'headline', t.headline))
  from tutor_profiles t join profiles p on p.id = t.user_id where t.id = p_tutor;
$$;

create or replace function public.person_brief(p_user uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_strip_nulls(jsonb_build_object('id', p.id, 'displayName', p.display_name, 'avatarHue', p.avatar_hue, 'avatarUrl', p.avatar_url))
  from profiles p where p.id = p_user;
$$;

create or replace function public.subject_json(p_subject uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', s.id, 'slug', s.slug, 'name', s.name, 'category', s.category) from subjects s where s.id = p_subject;
$$;

create or replace function public.list_subjects() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(subject_json(id) order by category, slug), '[]'::jsonb) from subjects;
$$;

-- Search filters run in the app (src/domain/tutor-search.ts), for the Arabic-aware matching.
create or replace function public.search_tutors() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(tutor_json(t)), '[]'::jsonb) from tutor_profiles t where t.is_published;
$$;

-- Unpublished profiles stay visible to their owner, admins and people with a shared history.
create or replace function public.get_tutor(p_tutor uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  t tutor_profiles;
  v_user uuid := auth.uid();
begin
  select * into t from tutor_profiles where id = p_tutor;
  if not found then return null; end if;
  if not t.is_published and (v_user is null or not (
       t.user_id = v_user or is_admin()
       or exists (select 1 from bookings b where b.tutor_id = t.id and acts_for(v_user, b.student_id))
       or exists (select 1 from conversations c where c.tutor_id = t.id and acts_for(v_user, c.student_id)))) then
    return null;
  end if;
  if v_user is distinct from t.user_id then
    update tutor_profiles set profile_views = profile_views + 1 where id = t.id;
  end if;
  return tutor_json(t);
end;
$$;

create or replace function public.owned_tutor(p_tutor uuid) returns public.tutor_profiles
language plpgsql stable security definer set search_path = public as $$
declare t tutor_profiles;
begin
  select * into t from tutor_profiles where id = p_tutor;
  if not found then raise exception 'not_found'; end if;
  if t.user_id is distinct from auth.uid() then raise exception 'forbidden'; end if;
  return t;
end;
$$;

create or replace function public.update_availability(p_tutor uuid, p_windows jsonb, p_instant boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare t tutor_profiles := owned_tutor(p_tutor);
begin
  delete from availability_windows where tutor_id = t.id;
  insert into availability_windows (tutor_id, weekday, start_time, end_time)
  select t.id, (w->>'weekday')::smallint, (w->>'start')::time, (w->>'end')::time
  from jsonb_array_elements(p_windows) w;
  update tutor_profiles set instant_book = p_instant where id = t.id returning * into t;
  return tutor_json(t);
end;
$$;

-- Bookings store their own pricing, so existing requests and lessons are unaffected.
create or replace function public.update_hourly_rate(p_tutor uuid, p_amount_minor integer) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  t tutor_profiles := owned_tutor(p_tutor);
  s platform_settings;
begin
  select * into s from platform_settings;
  if p_amount_minor not between s.min_hourly_rate_minor and s.max_hourly_rate_minor then
    raise exception using message = 'validation', detail = '{"amountMinor":"rateOutOfRange"}';
  end if;
  update tutor_profiles set hourly_rate_minor = p_amount_minor where id = t.id returning * into t;
  return tutor_json(t);
end;
$$;

create or replace function public.apply_tutor_profile(p_tutor uuid, p jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if exists (
    select 1 from jsonb_array_elements_text(p->'subjectIds') x
    where not exists (select 1 from subjects s where s.id = try_uuid(x))
  ) then
    raise exception using message = 'validation', detail = '{"subjectIds":"pickSubjects"}';
  end if;
  update tutor_profiles set
    headline = both_langs(p->>'headline'),
    bio = both_langs(p->>'bio'),
    university = both_langs(p->>'university'),
    city = both_langs(p->>'city'),
    languages = array(select jsonb_array_elements_text(p->'languages')),
    modes = array(select x::lesson_mode from jsonb_array_elements_text(p->'modes') x),
    grade_levels = array(select jsonb_array_elements_text(p->'gradeLevels')),
    qualifications = coalesce((select jsonb_agg(both_langs(x)) from jsonb_array_elements_text(p->'qualifications') x), '[]'::jsonb)
  where id = p_tutor;
  delete from tutor_subjects where tutor_id = p_tutor;
  insert into tutor_subjects (tutor_id, subject_id)
  select p_tutor, x::uuid from jsonb_array_elements_text(p->'subjectIds') x;
end;
$$;

create or replace function public.update_tutor_profile(p_tutor uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare t tutor_profiles := owned_tutor(p_tutor);
begin
  perform apply_tutor_profile(t.id, p);
  select * into t from tutor_profiles where id = t.id;
  return tutor_json(t);
end;
$$;

create or replace function public.list_reviews(p_tutor uuid, p_limit integer default 10) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(row_json order by created_at desc), '[]'::jsonb) from (
    select r.created_at, jsonb_strip_nulls(jsonb_build_object(
      'id', r.id, 'tutorId', r.tutor_id, 'studentId', r.student_id, 'bookingId', r.booking_id,
      'authorName', r.author_name, 'authorHue', r.author_hue, 'rating', r.rating,
      'comment', case when r.comment is null then '{}'::jsonb else both_langs(r.comment) end,
      'subjectId', r.subject_id, 'createdAt', iso(r.created_at))) as row_json
    from reviews r where r.tutor_id = p_tutor order by r.created_at desc limit least(p_limit, 50)
  ) x;
$$;

create or replace function public.list_favorites() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(tutor_id), '[]'::jsonb) from favorites where user_id = auth.uid();
$$;

create or replace function public.toggle_favorite(p_tutor uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'unauthorized'; end if;
  delete from favorites where user_id = v_user and tutor_id = p_tutor;
  if found then return false; end if;
  insert into favorites (user_id, tutor_id) values (v_user, p_tutor);
  return true;
end;
$$;

-- ─── Platform settings ──────────────────────────────────────────────────────

create or replace function public.get_settings() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'commissionBps', s.commission_bps,
    'minHourlyRate', money_json(s.min_hourly_rate_minor, s.currency),
    'maxHourlyRate', money_json(s.max_hourly_rate_minor, s.currency),
    'inPersonPaymentOptions', to_jsonb(s.in_person_payment_options),
    'classroomOpensMinutesBefore', s.classroom_opens_minutes_before,
    'classroomClosesMinutesAfter', s.classroom_closes_minutes_after,
    'updatedAt', iso(s.updated_at), 'updatedBy', s.updated_by))
  from platform_settings s;
$$;

create or replace function public.update_settings(
  p_commission_bps integer, p_min_rate integer, p_max_rate integer, p_options settlement_method[],
  p_opens_before integer, p_closes_after integer
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_user uuid := require_admin();
begin
  update platform_settings set
    commission_bps = p_commission_bps, min_hourly_rate_minor = p_min_rate, max_hourly_rate_minor = p_max_rate,
    in_person_payment_options = p_options, classroom_opens_minutes_before = p_opens_before,
    classroom_closes_minutes_after = p_closes_after, updated_at = now(), updated_by = v_user;
  return get_settings();
end;
$$;

-- ─── Booking helpers ────────────────────────────────────────────────────────

create or replace function public.booking_pricing(b public.bookings) returns jsonb
language sql immutable set search_path = public as $$
  select jsonb_build_object(
    'hourlyRate', money_json(b.hourly_rate_minor, b.currency),
    'total', money_json(b.price_minor, b.currency),
    'commissionBps', b.commission_bps,
    'commission', money_json(b.commission_minor, b.currency),
    'tutorEarnings', money_json(b.tutor_earnings_minor, b.currency),
    'settlement', b.settlement,
    'dueInApp', money_json(b.due_in_app_minor, b.currency),
    'dueInCash', money_json(b.due_in_cash_minor, b.currency));
$$;

-- Same arithmetic as priceLesson() in src/domain/pricing.ts.
create or replace function public.lesson_pricing(
  p_hourly integer, p_duration integer, p_bps integer, p_settlement settlement_method, p_currency text
) returns jsonb
language plpgsql immutable set search_path = public as $$
declare
  v_total integer := round(p_hourly * p_duration / 60.0);
  v_commission integer := round(v_total * p_bps / 10000.0);
  v_due integer := case when p_settlement = 'in_app' then v_total else v_commission end;
begin
  return jsonb_build_object(
    'hourlyRate', money_json(p_hourly, p_currency),
    'total', money_json(v_total, p_currency),
    'commissionBps', p_bps,
    'commission', money_json(v_commission, p_currency),
    'tutorEarnings', money_json(v_total - v_commission, p_currency),
    'settlement', p_settlement,
    'dueInApp', money_json(v_due, p_currency),
    'dueInCash', money_json(v_total - v_due, p_currency));
end;
$$;

create or replace function public.booking_role(b public.bookings, p_user uuid) returns text
language sql stable security definer set search_path = public as $$
  select case
    when exists (select 1 from tutor_profiles where id = b.tutor_id and user_id = p_user) then 'tutor'
    when b.student_id = p_user then 'student'
    when acts_for(p_user, b.student_id) then 'guardian'
  end;
$$;

create or replace function public.booking_json(b public.bookings) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'id', b.id, 'studentId', b.student_id, 'tutorId', b.tutor_id, 'subjectId', b.subject_id,
    'startsAt', iso(b.starts_at), 'durationMinutes', b.duration_minutes, 'mode', b.mode, 'status', b.status,
    'pricing', booking_pricing(b), 'paymentStatus', b.payment_status, 'lessonStatus', b.lesson_status,
    'remindersSent', to_jsonb(b.reminders_sent), 'bookedBy', b.booked_by, 'proposalId', b.proposal_id,
    'objectives', b.objectives, 'note', b.note, 'area', b.area,
    -- The exact meeting place is withheld until the booking is confirmed and paid.
    'location', case when is_paid_and_confirmed(b) then (select m.location from booking_meeting_details m where m.booking_id = b.id) end,
    'meetingDetailsVisible', is_paid_and_confirmed(b),
    'reviewId', (select r.id from reviews r where r.booking_id = b.id),
    'tutor', tutor_brief(b.tutor_id), 'student', person_brief(b.student_id), 'subject', subject_json(b.subject_id),
    'createdAt', iso(b.created_at), 'updatedAt', iso(b.updated_at)));
$$;

-- The whole lesson must fit a weekly window, respect the lead time and not overlap a booking.
create or replace function public.slot_is_bookable(t public.tutor_profiles, p_starts_at timestamptz, p_duration integer) returns boolean
language sql stable security definer set search_path = public as $$
  select p_starts_at >= now() + interval '2 hours'
    and exists (
      select 1 from availability_windows w
      where w.tutor_id = t.id
        and w.weekday = extract(dow from p_starts_at at time zone t.timezone)
        and (p_starts_at at time zone t.timezone)::time >= w.start_time
        and (p_starts_at at time zone t.timezone)::time + make_interval(mins => p_duration) <= w.end_time
        and ((p_starts_at + make_interval(mins => p_duration)) at time zone t.timezone)::date = (p_starts_at at time zone t.timezone)::date
    )
    and not exists (
      select 1 from bookings b
      where b.tutor_id = t.id and b.status in ('pending', 'confirmed')
        and lesson_range(b.starts_at, b.duration_minutes) && tstzrange(p_starts_at, p_starts_at + make_interval(mins => p_duration))
    );
$$;

-- Slots are worked out in the tutor's time zone, so a learner abroad sees the same lessons the
-- server will accept. Only times are exposed, never who booked.
create or replace function public.get_available_slots(p_tutor uuid, p_duration integer, p_days integer) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  t tutor_profiles;
  v_today date;
  v_day date;
  v_slots jsonb;
  v_result jsonb := '[]'::jsonb;
begin
  select * into t from tutor_profiles where id = p_tutor;
  if not found then raise exception 'not_found'; end if;
  if p_duration not in (30, 60, 90) then raise exception 'validation'; end if;
  v_today := (now() at time zone t.timezone)::date;
  for i in 0 .. least(greatest(p_days, 1), 60) - 1 loop
    v_day := v_today + i;
    select coalesce(jsonb_agg(jsonb_build_object(
      'startsAt', iso(s),
      'available', s >= now() + interval '2 hours' and not exists (
        select 1 from bookings b
        where b.tutor_id = t.id and b.status in ('pending', 'confirmed')
          and lesson_range(b.starts_at, b.duration_minutes) && tstzrange(s, s + make_interval(mins => p_duration)))
    ) order by s), '[]'::jsonb) into v_slots
    from availability_windows w
    cross join lateral generate_series(
      (v_day + w.start_time) at time zone t.timezone,
      ((v_day + w.end_time) at time zone t.timezone) - make_interval(mins => p_duration),
      interval '30 minutes') s
    where w.tutor_id = t.id and w.weekday = extract(dow from v_day);
    v_result := v_result || jsonb_build_array(jsonb_build_object('date', to_char(v_day, 'YYYY-MM-DD'), 'slots', v_slots));
  end loop;
  return v_result;
end;
$$;

create or replace function public.settlement_allowed(p_mode lesson_mode, p_settlement settlement_method, s public.platform_settings) returns boolean
language sql immutable set search_path = public as $$
  select case when p_mode = 'online' then p_settlement = 'in_app' else p_settlement = any (s.in_person_payment_options) end;
$$;

-- ─── Conversations ──────────────────────────────────────────────────────────

create or replace function public.participant_of(c public.conversations, p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select p_user = c.tutor_user_id or acts_for(p_user, c.student_id);
$$;

create or replace function public.conversation_json(c public.conversations, p_viewer uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'id', c.id, 'studentId', c.student_id, 'tutorUserId', c.tutor_user_id, 'tutorId', c.tutor_id,
    'lastMessageAt', iso(c.last_message_at), 'lastMessagePreview', c.last_message_preview,
    'lastMessageSenderId', c.last_message_sender_id, 'createdAt', iso(c.created_at),
    'counterpart', (
      select person_brief(p.id) || jsonb_build_object('subtitle', coalesce(
        (select t.headline from tutor_profiles t where t.user_id = p.id),
        (select s.major from student_profiles s where s.user_id = p.id),
        '{}'::jsonb))
      from profiles p where p.id = case when p_viewer = c.tutor_user_id then c.student_id else c.tutor_user_id end),
    'unreadCount', (
      select count(*) from messages m
      where m.conversation_id = c.id and m.read_at is null
        and (m.sender_id = c.tutor_user_id) <> (p_viewer = c.tutor_user_id)),
    'unlocked', conversation_unlocked(c.id),
    'guardian', (
      select jsonb_build_object('id', g.id, 'displayName', g.display_name)
      from student_profiles s join profiles g on g.id = s.guardian_user_id where s.user_id = c.student_id)));
$$;

create or replace function public.list_conversations() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'unauthorized'; end if;
  return (
    select coalesce(jsonb_agg(conversation_json(c, v_user) order by c.last_message_at desc), '[]'::jsonb)
    from conversations c where participant_of(c, v_user));
end;
$$;

create or replace function public.get_conversation(p_conversation uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  c conversations;
  v_user uuid := auth.uid();
begin
  select * into c from conversations where id = p_conversation;
  if not found then return null; end if;
  if v_user is null or not participant_of(c, v_user) then raise exception 'forbidden'; end if;
  return conversation_json(c, v_user);
end;
$$;

create or replace function public.message_json(m public.messages) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'id', m.id, 'conversationId', m.conversation_id, 'senderId', m.sender_id, 'body', m.body, 'kind', m.kind,
    'proposalId', m.proposal_id, 'systemEvent', m.system_event, 'readAt', iso(m.read_at), 'createdAt', iso(m.created_at),
    -- `path` is exchanged for a short-lived signed URL by the app.
    'attachments', (
      select jsonb_agg(jsonb_build_object('id', a.id, 'name', a.name, 'mimeType', a.mime_type, 'sizeBytes', a.size_bytes,
                                          'path', a.storage_path, 'width', a.width, 'height', a.height))
      from message_attachments a where a.message_id = m.id)));
$$;

create or replace function public.list_messages(p_conversation uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare c conversations;
begin
  select * into c from conversations where id = p_conversation;
  if not found then raise exception 'not_found'; end if;
  if auth.uid() is null or not participant_of(c, auth.uid()) then raise exception 'forbidden'; end if;
  return (select coalesce(jsonb_agg(message_json(m) order by m.created_at), '[]'::jsonb) from messages m where m.conversation_id = c.id);
end;
$$;

create or replace function public.get_message(p_message uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  m messages;
  c conversations;
begin
  select * into m from messages where id = p_message;
  if not found then return null; end if;
  select * into c from conversations where id = m.conversation_id;
  if auth.uid() is null or not participant_of(c, auth.uid()) then raise exception 'forbidden'; end if;
  return message_json(m);
end;
$$;

create or replace function public.open_conversation(p_tutor uuid, p_student uuid default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := require_active();
  v_learner uuid := coalesce(p_student, v_user);
  t tutor_profiles;
  c conversations;
begin
  if not acts_for(v_user, v_learner) then raise exception 'forbidden'; end if;
  select * into t from tutor_profiles where id = p_tutor and is_published;
  if not found then raise exception 'not_found'; end if;
  -- Only registered learners: this is what keeps the age rule from being skipped.
  if not exists (select 1 from student_profiles where user_id = v_learner) then raise exception 'forbidden'; end if;
  if acts_for(t.user_id, v_learner) then raise exception 'validation'; end if;
  insert into conversations (student_id, tutor_id, tutor_user_id, last_message_preview)
  values (v_learner, t.id, t.user_id, '')
  on conflict (student_id, tutor_id) do nothing;
  select * into c from conversations where student_id = v_learner and tutor_id = t.id;
  return conversation_json(c, v_user);
end;
$$;

create or replace function public.push_message(
  c public.conversations, p_sender uuid, p_body text, p_kind message_kind default 'text',
  p_proposal uuid default null, p_event text default null, p_preview text default null
) returns public.messages
language plpgsql security definer set search_path = public as $$
declare
  m messages;
  v_recipient uuid;
begin
  insert into messages (conversation_id, sender_id, body, kind, proposal_id, system_event)
  values (c.id, p_sender, p_body, p_kind, p_proposal, p_event)
  returning * into m;
  update conversations set
    last_message_at = m.created_at,
    last_message_preview = coalesce(nullif(p_body, ''), p_preview, ''),
    last_message_sender_id = p_sender
  where id = c.id;
  if p_kind <> 'system' then
    for v_recipient in
      select u from (select c.tutor_user_id as u union select learner_side(c.student_id)) x
      where (u = c.tutor_user_id) <> (p_sender = c.tutor_user_id)
    loop
      perform notify(v_recipient, 'new_message', jsonb_build_object('name', display_name_of(p_sender), 'conversationId', c.id));
    end loop;
  end if;
  return m;
end;
$$;

-- Notes in the conversation that contact sharing opened up (after payment) or closed again.
create or replace function public.post_system_message(p_student uuid, p_tutor uuid, p_event text) returns void
language plpgsql security definer set search_path = public as $$
declare
  c conversations;
  v_last text;
begin
  select * into c from conversations where student_id = p_student and tutor_id = p_tutor;
  if not found then return; end if;
  select system_event into v_last from messages where conversation_id = c.id and kind = 'system' order by created_at desc limit 1;
  if v_last is not distinct from p_event then return; end if;
  perform push_message(c, c.tutor_user_id, '', 'system', null, p_event);
end;
$$;

create or replace function public.pair_unlocked(p_student uuid, p_tutor uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from bookings b where b.student_id = p_student and b.tutor_id = p_tutor and is_paid_and_confirmed(b));
$$;

-- Call after a booking stops being confirmed: nothing paid left means pre-booking rules again.
create or replace function public.relock_if_needed(p_student uuid, p_tutor uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_last text;
begin
  if pair_unlocked(p_student, p_tutor) then return; end if;
  select m.system_event into v_last
  from messages m join conversations c on c.id = m.conversation_id
  where c.student_id = p_student and c.tutor_id = p_tutor and m.kind = 'system'
  order by m.created_at desc limit 1;
  if v_last = 'contact_unlocked' then perform post_system_message(p_student, p_tutor, 'contact_locked'); end if;
end;
$$;

-- Service role only: POST /api/messages verifies the session and runs the contact check first.
create or replace function public.send_message_as(p_sender uuid, p_conversation uuid, p_body text, p_attachments jsonb default '[]'::jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  c conversations;
  m messages;
  a jsonb;
  v_body text := trim(coalesce(p_body, ''));
begin
  select * into c from conversations where id = p_conversation;
  if not found then raise exception 'not_found'; end if;
  if not participant_of(c, p_sender) then raise exception 'forbidden'; end if;
  perform require_active_user(p_sender);
  perform hit_rate_limit(p_sender, 'message');
  if (v_body = '' and jsonb_array_length(p_attachments) = 0) or jsonb_array_length(p_attachments) > 4 then
    raise exception 'validation';
  end if;
  for a in select * from jsonb_array_elements(p_attachments) loop
    -- Files must have been uploaded to this conversation's folder.
    if split_part(a->>'path', '/', 1) <> c.id::text then raise exception 'forbidden'; end if;
  end loop;
  m := push_message(c, p_sender, v_body, 'text', null, null, case when jsonb_array_length(p_attachments) > 0 then '📎 ' || (p_attachments->0->>'name') end);
  insert into message_attachments (message_id, storage_path, name, mime_type, size_bytes, width, height)
  select m.id, x->>'path', x->>'name', x->>'mimeType', (x->>'sizeBytes')::integer, (x->>'width')::integer, (x->>'height')::integer
  from jsonb_array_elements(p_attachments) x;
  return message_json(m);
end;
$$;

create or replace function public.mark_conversation_read(p_conversation uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  c conversations;
  v_user uuid := auth.uid();
begin
  select * into c from conversations where id = p_conversation;
  if not found then raise exception 'not_found'; end if;
  if v_user is null or not participant_of(c, v_user) then raise exception 'forbidden'; end if;
  update messages set read_at = now()
  where conversation_id = c.id and read_at is null and (sender_id = c.tutor_user_id) <> (v_user = c.tutor_user_id);
  update notifications set read_at = now()
  where user_id = v_user and read_at is null and type = 'new_message' and data->>'conversationId' = c.id::text;
end;
$$;

-- Service role only. Single slips don't count, since the warning already explained the rule.
create or replace function public.record_blocked_attempt(p_user uuid, p_body text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_count integer;
  v_evidence text;
begin
  insert into blocked_attempts (user_id, body) values (p_user, left(p_body, 400));
  select count(*), left(string_agg(body, ' … ' order by created_at), 600) into v_count, v_evidence
  from blocked_attempts where user_id = p_user and created_at > now() - interval '24 hours';
  if v_count < 3 then return; end if;
  if exists (select 1 from reports where auto and target_user_id = p_user and status = 'open') then return; end if;
  insert into reports (kind, target_user_id, reason, details, evidence, auto)
  values ('report', p_user, 'off_platform',
          format('Automatic flag: %s attempts to share contact details before booking within 24 hours.', v_count), v_evidence, true);
end;
$$;

-- ─── Bookings ───────────────────────────────────────────────────────────────

drop function public.create_booking(uuid, uuid, timestamptz, smallint, lesson_mode, settlement_method, integer, integer, text, uuid);
drop function public.respond_to_booking(uuid, boolean);
drop function public.cancel_booking(uuid);
drop function public.submit_review(uuid, smallint, text);

create or replace function public.create_booking(
  p_tutor_id uuid, p_subject_id uuid, p_starts_at timestamptz, p_duration integer, p_mode lesson_mode,
  p_settlement settlement_method, p_expected_total_minor integer, p_expected_due_in_app_minor integer,
  p_note text default null, p_for_student uuid default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := require_active();
  v_student uuid := coalesce(p_for_student, v_user);
  t tutor_profiles;
  s platform_settings;
  b bookings;
  v_total integer;
  v_commission integer;
  v_due_in_app integer;
  v_subject jsonb;
  v_recipient uuid;
begin
  if not acts_for(v_user, v_student) then raise exception 'forbidden'; end if;
  if not exists (select 1 from student_profiles where user_id = v_student) then raise exception 'forbidden'; end if;
  perform hit_rate_limit(v_user, 'booking');
  select * into t from tutor_profiles where id = p_tutor_id and is_published;
  if not found then raise exception 'not_found'; end if;
  if t.user_id = v_student or t.user_id = v_user then raise exception 'forbidden'; end if;
  if not exists (select 1 from tutor_subjects where tutor_id = p_tutor_id and subject_id = p_subject_id)
     or not (p_mode = any (t.modes)) then
    raise exception 'validation';
  end if;
  select * into s from platform_settings;
  if not settlement_allowed(p_mode, p_settlement, s) then raise exception 'validation'; end if;
  if not slot_is_bookable(t, p_starts_at, p_duration) then raise exception 'slot_unavailable'; end if;

  -- Same arithmetic as priceLesson() in src/domain/pricing.ts.
  v_total := round(t.hourly_rate_minor * p_duration / 60.0);
  v_commission := round(v_total * s.commission_bps / 10000.0);
  v_due_in_app := case when p_settlement = 'in_app' then v_total else v_commission end;
  -- The student agreed to a specific price; if it moved, they must review it again.
  if v_total <> p_expected_total_minor or v_due_in_app <> p_expected_due_in_app_minor then
    raise exception 'price_changed';
  end if;

  insert into bookings (student_id, tutor_id, subject_id, starts_at, duration_minutes, mode,
                        status, price_minor, currency, note,
                        hourly_rate_minor, commission_bps, commission_minor, tutor_earnings_minor,
                        settlement, due_in_app_minor, due_in_cash_minor, booked_by)
  values (v_student, p_tutor_id, p_subject_id, p_starts_at, p_duration, p_mode,
          case when t.instant_book then 'confirmed' else 'pending' end::booking_status,
          v_total, t.currency, nullif(trim(p_note), ''),
          t.hourly_rate_minor, s.commission_bps, v_commission, v_total - v_commission,
          p_settlement, v_due_in_app, v_total - v_due_in_app, v_user)
  returning * into b;   -- the exclusion constraint rejects double bookings

  v_subject := subject_name(b.subject_id);
  perform notify(t.user_id, 'booking_requested', jsonb_build_object(
    'name', display_name_of(v_student), 'subject', v_subject, 'startsAt', iso(b.starts_at), 'bookingId', b.id));
  if b.status = 'confirmed' then
    for v_recipient in select learner_side(v_student) loop
      perform notify(v_recipient, 'booking_confirmed', jsonb_build_object(
        'name', t.display_name, 'subject', v_subject, 'startsAt', iso(b.starts_at), 'bookingId', b.id));
    end loop;
  end if;
  return booking_json(b);
end;
$$;

create or replace function public.get_booking(p_booking uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare b bookings;
begin
  select * into b from bookings where id = p_booking;
  if not found then return null; end if;
  if auth.uid() is null or (booking_role(b, auth.uid()) is null and not is_admin()) then raise exception 'forbidden'; end if;
  return booking_json(b);
end;
$$;

create or replace function public.list_bookings_for_student(p_student uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'unauthorized'; end if;
  if not acts_for(auth.uid(), p_student) then raise exception 'forbidden'; end if;
  return (select coalesce(jsonb_agg(booking_json(b) order by b.starts_at), '[]'::jsonb) from bookings b where b.student_id = p_student);
end;
$$;

create or replace function public.list_bookings_for_tutor(p_tutor uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare t tutor_profiles := owned_tutor(p_tutor);
begin
  return (select coalesce(jsonb_agg(booking_json(b) order by b.starts_at), '[]'::jsonb) from bookings b where b.tutor_id = t.id);
end;
$$;

-- Gives back up to `p_amount` of the booking's in-app payment (all of it when null).
-- A real gateway refunds through the payments Route Handler before this is recorded.
create or replace function public.refund_booking(p_booking uuid, p_amount integer default null) returns void
language plpgsql security definer set search_path = public as $$
declare
  p payments;
  v_refund integer;
  v_status payment_record_status;
begin
  for p in select * from payments where booking_id = p_booking and status = 'succeeded' loop
    v_refund := least(p.amount_minor, coalesce(p_amount, p.amount_minor));
    continue when v_refund <= 0;
    v_status := case when v_refund = p.amount_minor then 'refunded' else 'partially_refunded' end::payment_record_status;
    update payments set status = v_status, refunded_minor = v_refund, updated_at = now() where id = p.id;
    update bookings set payment_status = v_status::text::payment_status, updated_at = now() where id = p_booking;
  end loop;
end;
$$;

-- Tutor at any time, or student in the free window: full refund. Later: the platform fee is kept.
create or replace function public.cancel_booking(p_booking uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  b bookings;
  t tutor_profiles;
  v_role text;
  v_refund integer;
  v_recipient uuid;
  v_name jsonb;
begin
  if v_user is null then raise exception 'unauthorized'; end if;
  select * into b from bookings where id = p_booking for update;
  if not found then raise exception 'not_found'; end if;
  v_role := booking_role(b, v_user);
  if v_role is null then raise exception 'forbidden'; end if;
  if b.status not in ('pending', 'confirmed') or b.starts_at <= now() then raise exception 'validation'; end if;
  select * into t from tutor_profiles where id = b.tutor_id;

  if v_role = 'tutor' or now() <= b.starts_at - interval '12 hours' then
    v_refund := b.due_in_app_minor;
  else
    v_refund := b.due_in_app_minor - least(b.due_in_app_minor, b.commission_minor);
  end if;

  update bookings set status = 'cancelled', updated_at = now() where id = b.id;
  perform refund_booking(b.id, v_refund);
  perform relock_if_needed(b.student_id, b.tutor_id);

  v_name := case when v_role = 'tutor' then t.display_name else display_name_of(v_user) end;
  if v_role = 'tutor' then
    for v_recipient in select learner_side(b.student_id) loop
      perform notify(v_recipient, 'booking_cancelled', jsonb_build_object('name', v_name, 'subject', subject_name(b.subject_id), 'bookingId', b.id));
    end loop;
  else
    perform notify(t.user_id, 'booking_cancelled', jsonb_build_object('name', v_name, 'subject', subject_name(b.subject_id), 'bookingId', b.id));
  end if;
  select * into b from bookings where id = b.id;
  return booking_json(b);
end;
$$;

create or replace function public.respond_to_booking(p_booking uuid, p_accept boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  b bookings;
  t tutor_profiles;
  v_was_unlocked boolean;
  v_recipient uuid;
begin
  if auth.uid() is null then raise exception 'unauthorized'; end if;
  select * into b from bookings where id = p_booking for update;
  if not found then raise exception 'not_found'; end if;
  select * into t from tutor_profiles where id = b.tutor_id;
  if t.user_id <> auth.uid() then raise exception 'forbidden'; end if;
  if b.status <> 'pending' then return booking_json(b); end if;
  v_was_unlocked := pair_unlocked(b.student_id, b.tutor_id);
  update bookings set status = case when p_accept then 'confirmed' else 'declined' end::booking_status, updated_at = now()
  where id = b.id returning * into b;
  if not p_accept then perform refund_booking(b.id, null); end if;
  if p_accept and not v_was_unlocked and is_paid_and_confirmed(b) then
    perform post_system_message(b.student_id, b.tutor_id, 'contact_unlocked');
  end if;
  for v_recipient in select learner_side(b.student_id) loop
    perform notify(v_recipient, case when p_accept then 'booking_confirmed' else 'booking_declined' end::notification_type,
      jsonb_build_object('name', t.display_name, 'subject', subject_name(b.subject_id), 'startsAt', iso(b.starts_at), 'bookingId', b.id));
  end loop;
  select * into b from bookings where id = b.id;
  return booking_json(b);
end;
$$;

-- ─── Payments (simulated until a gateway is connected) ──────────────────────

-- Never contacts a provider and never moves money; every record says provider = 'simulated'.
-- When a real gateway goes live, revoke this and let its webhook mark bookings paid.
create or replace function public.simulate_payment(p_booking uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := require_active();
  b bookings;
  p payments;
  v_was_unlocked boolean;
  v_reference text := 'sim-pay-' || gen_random_uuid();
begin
  select * into b from bookings where id = p_booking for update;
  if not found then raise exception 'not_found'; end if;
  if not acts_for(v_user, b.student_id) then raise exception 'forbidden'; end if;
  if b.status in ('declined', 'cancelled') then raise exception 'validation'; end if;

  select * into p from payments where booking_id = b.id and status = 'succeeded' limit 1;
  if found then
    return jsonb_build_object('status', 'simulated', 'reference', p.provider_reference, 'amount', money_json(p.amount_minor, p.currency));
  end if;

  v_was_unlocked := pair_unlocked(b.student_id, b.tutor_id);
  insert into payments (booking_id, payer_id, amount_minor, currency, purpose, provider, provider_reference, status)
  values (b.id, v_user, b.due_in_app_minor, b.currency,
          case when b.settlement = 'in_app' then 'lesson' else 'commission_deposit' end::payment_purpose,
          'simulated', v_reference, 'succeeded');
  update bookings set payment_status = 'simulated', updated_at = now() where id = b.id returning * into b;
  if not v_was_unlocked and is_paid_and_confirmed(b) then
    perform post_system_message(b.student_id, b.tutor_id, 'contact_unlocked');
  end if;
  return jsonb_build_object('status', 'simulated', 'reference', v_reference, 'amount', money_json(b.due_in_app_minor, b.currency));
end;
$$;

-- ─── Reviews ────────────────────────────────────────────────────────────────

create or replace function public.submit_review(p_booking uuid, p_rating integer, p_comment text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := require_active();
  b bookings;
  t tutor_profiles;
  r reviews;
  a profiles;
begin
  select * into b from bookings where id = p_booking;
  if not found then raise exception 'not_found'; end if;
  if not acts_for(v_user, b.student_id) then raise exception 'forbidden'; end if;
  if b.status <> 'confirmed' or b.lesson_status <> 'completed'
     or exists (select 1 from reviews where booking_id = b.id) then
    raise exception 'validation';
  end if;
  select * into a from profiles where id = v_user;
  select * into t from tutor_profiles where id = b.tutor_id;
  insert into reviews (booking_id, tutor_id, student_id, author_id, author_name, author_hue, rating, comment, subject_id)
  values (b.id, b.tutor_id, b.student_id, v_user, a.display_name, a.avatar_hue, p_rating, nullif(trim(p_comment), ''), b.subject_id)
  returning * into r;
  update tutor_profiles set
    rating = (select round(avg(rating)::numeric, 1) from reviews where tutor_id = b.tutor_id),
    review_count = (select count(*) from reviews where tutor_id = b.tutor_id)
  where id = b.tutor_id;
  perform notify(t.user_id, 'review_received', jsonb_build_object('name', a.display_name, 'subject', subject_name(b.subject_id)));
  return jsonb_strip_nulls(jsonb_build_object(
    'id', r.id, 'tutorId', r.tutor_id, 'studentId', r.student_id, 'bookingId', r.booking_id,
    'authorName', r.author_name, 'authorHue', r.author_hue, 'rating', r.rating,
    'comment', case when r.comment is null then '{}'::jsonb else both_langs(r.comment) end,
    'subjectId', r.subject_id, 'createdAt', iso(r.created_at)));
end;
$$;

-- ─── Lesson proposals ───────────────────────────────────────────────────────

drop function public.accept_proposal(uuid, settlement_method, integer, integer);
drop function public.respond_to_proposal(uuid, text);

create or replace function public.proposal_json(p public.lesson_proposals) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'id', p.id, 'conversationId', p.conversation_id, 'tutorId', p.tutor_id,
    'tutorUserId', (select user_id from tutor_profiles where id = p.tutor_id),
    'studentId', p.student_id, 'subjectId', p.subject_id, 'objectives', p.objectives,
    'startsAt', iso(p.starts_at), 'durationMinutes', p.duration_minutes, 'mode', p.mode, 'area', p.area,
    'pricing', lesson_pricing(p.hourly_rate_minor, p.duration_minutes, p.commission_bps, p.settlement, p.currency),
    'status', p.status, 'expiresAt', iso(p.expires_at), 'bookingId', p.booking_id,
    'respondedAt', iso(p.responded_at), 'createdAt', iso(p.created_at)));
$$;

create or replace function public.expire_proposals(p_conversation uuid default null) returns void
language sql security definer set search_path = public as $$
  update lesson_proposals set status = 'expired', responded_at = now()
  where status = 'pending' and expires_at < now() and (p_conversation is null or conversation_id = p_conversation);
$$;

-- Service role only: POST /api/proposals checks the area for exact addresses first.
create or replace function public.create_proposal_as(
  p_actor uuid, p_conversation uuid, p_subject uuid, p_objectives text, p_starts_at timestamptz,
  p_duration integer, p_mode lesson_mode, p_area text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  c conversations;
  t tutor_profiles;
  s platform_settings;
  p lesson_proposals;
  v_recipient uuid;
  v_area text := case when p_mode = 'in_person' then nullif(trim(p_area), '') end;
begin
  perform require_active_user(p_actor);
  select * into c from conversations where id = p_conversation;
  if not found then raise exception 'not_found'; end if;
  if c.tutor_user_id <> p_actor then raise exception 'forbidden'; end if;
  perform hit_rate_limit(p_actor, 'proposal');
  select * into t from tutor_profiles where id = c.tutor_id;
  if not exists (select 1 from tutor_subjects where tutor_id = t.id and subject_id = p_subject)
     or not (p_mode = any (t.modes)) then
    raise exception 'validation';
  end if;
  if not slot_is_bookable(t, p_starts_at, p_duration) then raise exception 'slot_unavailable'; end if;
  select * into s from platform_settings;

  -- The rate and commission are fixed now: later changes don't touch this offer.
  insert into lesson_proposals (conversation_id, tutor_id, student_id, subject_id, objectives, starts_at, duration_minutes,
                                mode, area, hourly_rate_minor, commission_bps, price_minor, currency, settlement, expires_at)
  values (c.id, t.id, c.student_id, p_subject, trim(p_objectives), p_starts_at, p_duration, p_mode, v_area,
          t.hourly_rate_minor, s.commission_bps, round(t.hourly_rate_minor * p_duration / 60.0), t.currency,
          case when p_mode = 'in_person' and 'deposit_and_cash' = any (s.in_person_payment_options) then 'deposit_and_cash' else 'in_app' end::settlement_method,
          least(p_starts_at - interval '2 hours', now() + interval '72 hours'))
  returning * into p;
  perform push_message(c, p_actor, p.objectives, 'proposal', p.id);
  for v_recipient in select learner_side(c.student_id) loop
    perform notify(v_recipient, 'proposal_received', jsonb_build_object(
      'name', t.display_name, 'subject', subject_name(p_subject), 'conversationId', c.id, 'proposalId', p.id));
  end loop;
  return proposal_json(p);
end;
$$;

create or replace function public.list_proposals(p_conversation uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c conversations;
begin
  select * into c from conversations where id = p_conversation;
  if not found then raise exception 'not_found'; end if;
  if auth.uid() is null or not participant_of(c, auth.uid()) then raise exception 'forbidden'; end if;
  perform expire_proposals(c.id);
  return (select coalesce(jsonb_agg(proposal_json(p) order by p.created_at), '[]'::jsonb) from lesson_proposals p where p.conversation_id = c.id);
end;
$$;

create or replace function public.get_proposal(p_proposal uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  p lesson_proposals;
  c conversations;
begin
  select * into p from lesson_proposals where id = p_proposal;
  if not found then return null; end if;
  select * into c from conversations where id = p.conversation_id;
  if auth.uid() is null or not participant_of(c, auth.uid()) then raise exception 'forbidden'; end if;
  perform expire_proposals(c.id);
  select * into p from lesson_proposals where id = p_proposal;
  return proposal_json(p) || jsonb_build_object(
    'tutor', tutor_brief(p.tutor_id),
    'student', (select jsonb_build_object('id', u.id, 'displayName', u.display_name, 'avatarHue', u.avatar_hue) from profiles u where u.id = p.student_id),
    'subject', subject_json(p.subject_id));
end;
$$;

create or replace function public.accept_proposal(
  p_proposal uuid, p_settlement settlement_method, p_expected_total_minor integer, p_expected_due_in_app_minor integer
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := require_active();
  p lesson_proposals;
  s platform_settings;
  t tutor_profiles;
  b bookings;
  v_commission integer;
  v_due_in_app integer;
begin
  select * into p from lesson_proposals where id = p_proposal for update;
  if not found then raise exception 'not_found'; end if;
  if not acts_for(v_user, p.student_id) then raise exception 'forbidden'; end if;
  if p.status <> 'pending' or p.expires_at < now() then raise exception 'proposal_unavailable'; end if;
  select * into s from platform_settings;
  if not settlement_allowed(p.mode, p_settlement, s) then raise exception 'validation'; end if;

  -- Same agreed price; only how it is paid depends on the option chosen now.
  v_commission := round(p.price_minor * p.commission_bps / 10000.0);
  v_due_in_app := case when p_settlement = 'in_app' then p.price_minor else v_commission end;
  if p.price_minor <> p_expected_total_minor or v_due_in_app <> p_expected_due_in_app_minor then
    raise exception 'price_changed';
  end if;
  select * into t from tutor_profiles where id = p.tutor_id;
  if not slot_is_bookable(t, p.starts_at, p.duration_minutes) then raise exception 'slot_unavailable'; end if;

  -- The tutor already agreed by proposing; payment completes the booking.
  insert into bookings (student_id, tutor_id, subject_id, starts_at, duration_minutes, mode, status,
                        price_minor, currency, hourly_rate_minor, commission_bps, commission_minor,
                        tutor_earnings_minor, settlement, due_in_app_minor, due_in_cash_minor,
                        booked_by, proposal_id, objectives, area)
  values (p.student_id, p.tutor_id, p.subject_id, p.starts_at, p.duration_minutes, p.mode, 'confirmed',
          p.price_minor, p.currency, p.hourly_rate_minor, p.commission_bps, v_commission,
          p.price_minor - v_commission, p_settlement, v_due_in_app, p.price_minor - v_due_in_app,
          v_user, p.id, p.objectives, p.area)
  returning * into b;

  update lesson_proposals set status = 'accepted', booking_id = b.id, responded_at = now() where id = p.id;
  perform notify(t.user_id, 'proposal_accepted', jsonb_build_object(
    'name', display_name_of(v_user), 'subject', subject_name(p.subject_id), 'startsAt', iso(p.starts_at),
    'bookingId', b.id, 'conversationId', p.conversation_id));
  return booking_json(b);
end;
$$;

create or replace function public.respond_to_proposal(p_proposal uuid, p_action text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  p lesson_proposals;
  t tutor_profiles;
begin
  if v_user is null then raise exception 'unauthorized'; end if;
  select * into p from lesson_proposals where id = p_proposal for update;
  if not found then raise exception 'not_found'; end if;
  select * into t from tutor_profiles where id = p.tutor_id;
  if p_action = 'decline' and not acts_for(v_user, p.student_id) then raise exception 'forbidden'; end if;
  if p_action = 'withdraw' and t.user_id <> v_user then raise exception 'forbidden'; end if;
  if p_action not in ('decline', 'withdraw') then raise exception 'validation'; end if;
  if p.status <> 'pending' or p.expires_at < now() then raise exception 'proposal_unavailable'; end if;
  update lesson_proposals set status = case when p_action = 'decline' then 'declined' else 'withdrawn' end::proposal_status, responded_at = now()
  where id = p.id returning * into p;
  if p_action = 'decline' then
    perform notify(t.user_id, 'proposal_declined', jsonb_build_object(
      'name', display_name_of(v_user), 'subject', subject_name(p.subject_id), 'conversationId', p.conversation_id));
  end if;
  return proposal_json(p);
end;
$$;

-- ─── Classroom ──────────────────────────────────────────────────────────────

drop function public.classroom_access(uuid);

-- Called by POST /api/classroom/[bookingId]/token as the signed-in user. Same answer for
-- "doesn't exist" and "not yours", so ids can't be probed.
create or replace function public.classroom_ticket(p_booking uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  b bookings;
  s platform_settings;
  t tutor_profiles;
  v_role text;
  v_opens timestamptz;
  v_closes timestamptz;
  v_reason text;
  v_guardian uuid;
  v_participants jsonb;
begin
  if v_user is null then raise exception 'unauthorized'; end if;
  select * into b from bookings where id = p_booking;
  if not found then raise exception 'forbidden'; end if;
  v_role := booking_role(b, v_user);
  if v_role is null then raise exception 'forbidden'; end if;
  perform require_active_user(v_user);

  select * into s from platform_settings;
  select * into t from tutor_profiles where id = b.tutor_id;
  v_opens := b.starts_at - make_interval(mins => s.classroom_opens_minutes_before);
  v_closes := b.starts_at + make_interval(mins => b.duration_minutes + s.classroom_closes_minutes_after);
  v_reason := case
    when b.mode <> 'online' then 'not_online'
    when b.status <> 'confirmed' then 'not_confirmed'
    when not is_paid_and_confirmed(b) then 'not_paid'
    when now() < v_opens then 'too_early'
    when now() > v_closes then 'ended'
  end;
  if v_reason is not null then
    raise exception using message = 'classroom_closed',
      detail = jsonb_build_object('reason', v_reason, 'opensAt', iso(v_opens), 'closesAt', iso(v_closes))::text;
  end if;

  update bookings set lesson_status = 'in_progress' where id = b.id and lesson_status = 'scheduled';

  select guardian_user_id into v_guardian from student_profiles where user_id = b.student_id;
  select jsonb_agg(jsonb_build_object('userId', u.id, 'role', x.role, 'displayName', u.display_name, 'avatarHue', u.avatar_hue) order by x.ord)
  into v_participants
  from (values (t.user_id, 'tutor', 1), (b.student_id, 'student', 2), (v_guardian, 'guardian', 3)) x(id, role, ord)
  join profiles u on u.id = x.id;

  return jsonb_strip_nulls(jsonb_build_object(
    'bookingId', b.id,
    'roomName', 'lesson-' || b.id,
    'expiresAt', iso(v_closes),
    'me', (select e from jsonb_array_elements(v_participants) e where e->>'userId' = v_user::text limit 1),
    'participants', v_participants,
    'lesson', jsonb_build_object(
      'subject', subject_name(b.subject_id), 'startsAt', iso(b.starts_at),
      'durationMinutes', b.duration_minutes, 'objectives', b.objectives),
    'recording', false));
end;
$$;

-- ─── Notifications ──────────────────────────────────────────────────────────

create or replace function public.notification_json(n public.notifications) returns jsonb
language sql stable set search_path = public as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'id', n.id, 'userId', n.user_id, 'type', n.type, 'data', n.data, 'readAt', iso(n.read_at), 'createdAt', iso(n.created_at)));
$$;

create or replace function public.list_notifications() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(row_json order by created_at desc), '[]'::jsonb) from (
    select n.created_at, notification_json(n) as row_json
    from notifications n where n.user_id = auth.uid() order by n.created_at desc limit 100
  ) x;
$$;

create or replace function public.mark_all_notifications_read() returns void
language sql security definer set search_path = public as $$
  update notifications set read_at = now() where user_id = auth.uid() and read_at is null;
$$;

-- ─── Tutor dashboard & admin overview ───────────────────────────────────────

create or replace function public.tutor_stats(p_tutor uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  t tutor_profiles := owned_tutor(p_tutor);
  v_local timestamp := now() at time zone t.timezone;
  v_month timestamptz := date_trunc('month', v_local) at time zone t.timezone;
  v_last_month timestamptz := (date_trunc('month', v_local) - interval '1 month') at time zone t.timezone;
  v_week timestamptz := (v_local::date - extract(dow from v_local)::integer)::timestamp at time zone t.timezone;
  v_total integer;
  v_stale integer;
  v_parts integer := 0;
begin
  select count(*), count(*) filter (where status = 'pending' and created_at < now() - interval '24 hours')
  into v_total, v_stale from bookings where tutor_id = t.id;
  v_parts := (nullif(t.headline->>'en', '') is not null)::integer + (nullif(t.bio->>'en', '') is not null)::integer
    + (jsonb_array_length(t.qualifications) > 0)::integer
    + (exists (select 1 from tutor_subjects where tutor_id = t.id))::integer
    + (exists (select 1 from availability_windows where tutor_id = t.id))::integer
    + ((select avatar_url from profiles where id = t.user_id) is not null)::integer;
  return (
    select jsonb_build_object(
      'earningsThisMonth', money_json(coalesce(sum(b.tutor_earnings_minor) filter (where b.status = 'confirmed' and b.starts_at >= v_month), 0)::integer, t.currency),
      'earningsLastMonth', money_json(coalesce(sum(b.tutor_earnings_minor) filter (where b.status = 'confirmed' and b.starts_at >= v_last_month and b.starts_at < v_month), 0)::integer, t.currency),
      'lessonsThisMonth', count(*) filter (where b.starts_at >= v_month and b.status not in ('cancelled', 'declined')),
      'upcomingCount', count(*) filter (where b.status = 'confirmed' and b.starts_at > now()),
      'pendingCount', count(*) filter (where b.status = 'pending'),
      'averageRating', t.rating,
      'reviewCount', t.review_count,
      'responseRate', case when v_total = 0 then 100 else round(100.0 * (v_total - v_stale) / v_total) end,
      'profileViews', t.profile_views,
      'profileCompleteness', round(100.0 * v_parts / 6),
      'weeklyLessons', (
        select jsonb_agg((select count(*) from bookings x
          where x.tutor_id = t.id and x.status not in ('cancelled', 'declined')
            and x.starts_at >= v_week + make_interval(days => d) and x.starts_at < v_week + make_interval(days => d + 1)) order by d)
        from generate_series(0, 6) d))
    from bookings b where b.tutor_id = t.id);
end;
$$;

create or replace function public.admin_overview() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_admin uuid := require_admin();
  s platform_settings;
begin
  select * into s from platform_settings;
  return jsonb_build_object(
    'lessonCount', (select count(*) from bookings where status = 'confirmed'),
    'grossVolume', money_json((select coalesce(sum(price_minor), 0)::integer from bookings where status = 'confirmed'), s.currency),
    'commissionEarned', money_json((select coalesce(sum(commission_minor), 0)::integer from bookings where status = 'confirmed'), s.currency),
    'collectedInApp', money_json((select coalesce(sum(amount_minor), 0)::integer from payments where status = 'succeeded'), s.currency),
    'paidInCash', money_json((select coalesce(sum(due_in_cash_minor), 0)::integer from bookings where status = 'confirmed'), s.currency),
    'recentPayments', (
      select coalesce(jsonb_agg(row_json order by created_at desc), '[]'::jsonb) from (
        select p.created_at, jsonb_strip_nulls(jsonb_build_object(
          'id', p.id, 'bookingId', p.booking_id, 'payerId', p.payer_id, 'amount', money_json(p.amount_minor, p.currency),
          'purpose', p.purpose, 'provider', p.provider, 'providerReference', p.provider_reference, 'status', p.status,
          'refundedAmount', case when p.refunded_minor is not null then money_json(p.refunded_minor, p.currency) end,
          'createdAt', iso(p.created_at), 'updatedAt', iso(p.updated_at),
          'studentName', display_name_of(p.payer_id),
          'tutorName', (select t.display_name from bookings b join tutor_profiles t on t.id = b.tutor_id where b.id = p.booking_id))) as row_json
        from payments p order by p.created_at desc limit 8
      ) x));
end;
$$;

-- ─── Tutor onboarding ───────────────────────────────────────────────────────

drop function public.review_application(uuid, boolean, text);

create or replace function public.application_json(a public.tutor_applications) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'id', a.id, 'userId', a.user_id, 'tutorId', a.tutor_id, 'status', a.status,
    'reviewedAt', iso(a.reviewed_at), 'reviewedBy', a.reviewed_by, 'note', a.note, 'createdAt', iso(a.created_at),
    'documents', coalesce((
      select jsonb_agg(jsonb_build_object('kind', d.kind, 'file', jsonb_build_object(
        'id', d.id, 'name', d.name, 'mimeType', d.mime_type, 'sizeBytes', d.size_bytes, 'path', d.storage_path)))
      from tutor_documents d where d.application_id = a.id), '[]'::jsonb)));
$$;

-- Runs right after sign-up, once the documents are in the applicant's storage folder.
create or replace function public.submit_tutor_application(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := require_active();
  v_me profiles;
  s platform_settings;
  v_tutor uuid;
  a tutor_applications;
  d jsonb;
begin
  select * into v_me from profiles where id = v_user;
  if v_me.role <> 'tutor' or exists (select 1 from tutor_profiles where user_id = v_user) then raise exception 'forbidden'; end if;
  select * into s from platform_settings;
  if (p->>'hourlyRateMinor')::integer not between s.min_hourly_rate_minor and s.max_hourly_rate_minor then
    raise exception using message = 'validation', detail = '{"hourlyRateMinor":"rateOutOfRange"}';
  end if;
  for d in select * from jsonb_array_elements(p->'documents') loop
    if split_part(d->>'path', '/', 1) <> v_user::text then raise exception 'forbidden'; end if;
  end loop;

  -- Hidden from search until an admin checks the documents.
  insert into tutor_profiles (user_id, display_name, hourly_rate_minor, currency, verification, is_published)
  values (v_user, v_me.display_name, (p->>'hourlyRateMinor')::integer, s.currency, 'pending', false)
  returning id into v_tutor;
  perform apply_tutor_profile(v_tutor, p);

  insert into tutor_applications (user_id, tutor_id) values (v_user, v_tutor) returning * into a;
  insert into tutor_documents (application_id, kind, storage_path, name, mime_type, size_bytes)
  select a.id, x->>'kind', x->>'path', x->>'name', x->>'mimeType', (x->>'sizeBytes')::integer
  from jsonb_array_elements(p->'documents') x;
  return get_session();
end;
$$;

create or replace function public.my_application() returns jsonb
language sql stable security definer set search_path = public as $$
  select application_json(a) from tutor_applications a where a.user_id = auth.uid() order by a.created_at desc limit 1;
$$;

create or replace function public.list_applications() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_admin uuid := require_admin();
begin
  return (
    select coalesce(jsonb_agg(application_json(a) || jsonb_build_object(
      'tutor', (select tutor_json(t) from tutor_profiles t where t.id = a.tutor_id),
      'email', coalesce((select email from auth.users u where u.id = a.user_id), '')
    ) order by a.created_at), '[]'::jsonb)
    from tutor_applications a where a.status = 'pending');
end;
$$;

create or replace function public.review_application(p_application uuid, p_approve boolean, p_note text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_admin uuid := require_admin();
  a tutor_applications;
begin
  if not p_approve and char_length(coalesce(trim(p_note), '')) < 5 then
    raise exception using message = 'validation', detail = '{"note":"reasonRequired"}';
  end if;
  select * into a from tutor_applications where id = p_application for update;
  if not found then raise exception 'not_found'; end if;
  if a.status <> 'pending' then raise exception 'validation'; end if;
  update tutor_applications set
    status = case when p_approve then 'approved' else 'rejected' end::application_status,
    reviewed_at = now(), reviewed_by = v_admin, note = nullif(trim(p_note), '')
  where id = a.id returning * into a;
  update tutor_profiles set
    verification = case when p_approve then 'verified' else 'rejected' end::verification_status,
    is_published = p_approve
  where id = a.tutor_id;
  update tutor_documents set delete_after = now() + interval '90 days' where application_id = a.id;
  perform notify(a.user_id, case when p_approve then 'application_approved' else 'application_rejected' end::notification_type);
  return application_json(a);
end;
$$;

-- ─── Reports & moderation ───────────────────────────────────────────────────

drop function public.file_report(text, uuid, text, text, uuid, uuid);
drop function public.resolve_report(uuid, text, boolean, text, integer);

create or replace function public.report_json(r public.reports) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'id', r.id, 'kind', r.kind, 'reporterId', r.reporter_id, 'targetUserId', r.target_user_id, 'reason', r.reason,
    'details', r.details, 'messageId', r.message_id, 'conversationId', r.conversation_id, 'bookingId', r.booking_id,
    'evidence', r.evidence, 'auto', r.auto, 'status', r.status, 'createdAt', iso(r.created_at),
    'resolution', case when r.resolved_at is not null then jsonb_build_object(
      'action', r.resolution_action, 'note', r.resolution_note, 'by', r.resolved_by, 'at', iso(r.resolved_at),
      'refund', case when r.refund_minor is not null then money_json(r.refund_minor, 'LYD') end) end));
$$;

create or replace function public.file_report(
  p_kind text, p_target uuid, p_reason text, p_details text default '',
  p_message uuid default null, p_conversation uuid default null, p_booking uuid default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := require_active();
  v_target uuid := p_target;
  v_evidence text;
  b bookings;
  m messages;
  c conversations;
  r reports;
begin
  perform hit_rate_limit(v_user, 'report');
  if p_kind = 'dispute' then
    select * into b from bookings where id = p_booking;
    if not found then raise exception 'not_found'; end if;
    if not acts_for(v_user, b.student_id) then raise exception 'forbidden'; end if;
    if not is_paid_and_confirmed(b) or now() < b.starts_at or now() > b.starts_at + interval '14 days' then
      raise exception using message = 'validation', detail = '{"_form":"disputeNotAllowed"}';
    end if;
    if exists (select 1 from reports where kind = 'dispute' and booking_id = b.id and status = 'open') then
      raise exception using message = 'validation', detail = '{"_form":"disputeExists"}';
    end if;
    select user_id into v_target from tutor_profiles where id = b.tutor_id;
  elsif p_message is not null then
    select * into m from messages where id = p_message;
    if not found then raise exception 'forbidden'; end if;
    select * into c from conversations where id = m.conversation_id;
    if not participant_of(c, v_user) then raise exception 'forbidden'; end if;
    v_target := m.sender_id;
    v_evidence := left(m.body, 1000);
  end if;

  -- You can only report people you have actually dealt with, or a tutor's public profile.
  if v_user = v_target then raise exception 'validation'; end if;
  if not exists (select 1 from profiles where id = v_target) then raise exception 'not_found'; end if;
  if not exists (select 1 from tutor_profiles where user_id = v_target and is_published)
     and not exists (select 1 from conversations x where participant_of(x, v_user) and participant_of(x, v_target)) then
    raise exception 'forbidden';
  end if;

  insert into reports (kind, reporter_id, target_user_id, reason, details, message_id, conversation_id, booking_id, evidence)
  values (p_kind, v_user, v_target, p_reason, coalesce(p_details, ''), p_message, p_conversation, p_booking, v_evidence)
  returning * into r;
  return report_json(r);
end;
$$;

create or replace function public.list_my_reports() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(report_json(r) order by r.created_at desc), '[]'::jsonb) from reports r where r.reporter_id = auth.uid();
$$;

create or replace function public.report_queue() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_admin uuid := require_admin();
begin
  return (
    select coalesce(jsonb_agg(report_json(r) || jsonb_strip_nulls(jsonb_build_object(
      'reporterName', case when r.reporter_id is not null then display_name_of(r.reporter_id) end,
      'targetName', u.display_name, 'targetRole', u.role, 'targetSuspended', u.suspended_at is not null,
      'booking', (select jsonb_build_object(
        'id', b.id, 'startsAt', iso(b.starts_at), 'durationMinutes', b.duration_minutes, 'mode', b.mode,
        'status', b.status, 'paymentStatus', b.payment_status, 'pricing', booking_pricing(b), 'subject', subject_name(b.subject_id))
        from bookings b where b.id = r.booking_id)
    -- Disputes involve money, so they come first; then oldest first.
    )) order by (r.kind = 'dispute') desc, r.created_at), '[]'::jsonb)
    from reports r join profiles u on u.id = r.target_user_id where r.status = 'open');
end;
$$;

create or replace function public.resolve_report(
  p_report uuid, p_action text, p_dismiss boolean, p_note text, p_refund_minor integer default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_admin uuid := require_admin();
  r reports;
  b bookings;
  v_refund integer;
begin
  select * into r from reports where id = p_report for update;
  if not found then raise exception 'not_found'; end if;
  if r.status <> 'open' then raise exception 'validation'; end if;

  if not p_dismiss then
    if p_action = 'warning' then
      perform notify(r.target_user_id, 'account_warning');
    elsif p_action = 'suspend' then
      update profiles set suspended_at = now(), suspension_reason = p_note where id = r.target_user_id;
      update tutor_profiles set is_published = false where user_id = r.target_user_id;
    elsif p_action = 'unpublish' then
      update tutor_profiles set is_published = false where user_id = r.target_user_id;
      if not found then raise exception 'validation'; end if;
    elsif p_action = 'refund' then
      select * into b from bookings where id = r.booking_id;
      if r.kind <> 'dispute' or not found then raise exception 'validation'; end if;
      v_refund := least(b.due_in_app_minor, coalesce(p_refund_minor, b.due_in_app_minor));
      if v_refund <= 0 then raise exception using message = 'validation', detail = '{"refundMinor":"required"}'; end if;
      perform refund_booking(b.id, v_refund);
    end if;
  end if;

  update reports set
    status = case when p_dismiss then 'dismissed' else 'resolved' end::report_status,
    resolution_action = case when p_dismiss then 'none' else p_action end,
    resolution_note = p_note, refund_minor = v_refund, resolved_by = v_admin, resolved_at = now()
  where id = r.id returning * into r;
  if r.reporter_id is not null then
    perform notify(r.reporter_id, 'report_resolved', jsonb_build_object('name', display_name_of(r.target_user_id), 'bookingId', r.booking_id));
  end if;
  return report_json(r);
end;
$$;

-- ─── Account deletion ───────────────────────────────────────────────────────

-- Service role only: DELETE /api/account checks the session, then removes the returned storage
-- objects and the auth user. Bookings and payments stay, anonymised, for accounting.
create or replace function public.delete_account_data(p_user uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_learners uuid[];
  v_tutor uuid;
  v_paths jsonb;
  b bookings;
  v_deleted jsonb := jsonb_build_object('ar', 'حساب محذوف', 'en', 'Deleted account');
begin
  v_learners := array(select p_user union select user_id from student_profiles where guardian_user_id = p_user);
  select id into v_tutor from tutor_profiles where user_id = p_user;

  if exists (
    select 1 from bookings x
    where (x.student_id = any (v_learners) or x.tutor_id = v_tutor)
      and is_paid_and_confirmed(x) and x.starts_at + make_interval(mins => x.duration_minutes) > now()
  ) then
    raise exception using message = 'validation', detail = '{"_form":"hasUpcomingLessons"}';
  end if;

  -- Pending requests are cancelled and refunded so nobody is left waiting or out of pocket.
  for b in
    select * from bookings x where (x.student_id = any (v_learners) or x.tutor_id = v_tutor) and x.status = 'pending'
  loop
    update bookings set status = 'cancelled', updated_at = now() where id = b.id;
    perform refund_booking(b.id, null);
  end loop;

  select coalesce(jsonb_agg(d.storage_path), '[]'::jsonb) into v_paths
  from tutor_documents d join tutor_applications a on a.id = d.application_id where a.user_id = p_user;
  delete from tutor_documents d using tutor_applications a where a.id = d.application_id and a.user_id = p_user;

  update profiles set display_name = v_deleted, avatar_url = null where id = any (v_learners);
  delete from profile_private where user_id = any (v_learners);
  delete from student_profiles where user_id = any (v_learners);
  delete from favorites where user_id = any (v_learners);
  delete from notifications where user_id = any (v_learners);
  delete from notification_preferences where user_id = any (v_learners);
  delete from push_subscriptions where user_id = any (v_learners);
  update tutor_profiles set is_published = false, display_name = v_deleted, bio = '{}'::jsonb where id = v_tutor;
  return jsonb_build_object('documentPaths', v_paths);
end;
$$;

-- ─── Scheduled maintenance ──────────────────────────────────────────────────

-- Sends the most urgent reminder due, so a late booking doesn't get both at once.
create or replace function public.send_due_reminders() returns integer
language plpgsql security definer set search_path = public as $$
declare
  b bookings;
  t tutor_profiles;
  v_minutes numeric;
  v_keys text[];
  v_key text;
  v_recipient uuid;
  v_sent integer := 0;
  v_data jsonb;
begin
  for b in
    select * from bookings x
    where x.status = 'confirmed' and x.lesson_status = 'scheduled' and x.starts_at > now()
      and x.starts_at <= now() + interval '24 hours' and is_paid_and_confirmed(x)
  loop
    v_minutes := extract(epoch from b.starts_at - now()) / 60;
    v_key := case when v_minutes <= 60 then '1h' else '24h' end;
    continue when v_key = any (b.reminders_sent);
    v_keys := case when v_key = '1h' then array['24h', '1h'] else array['24h'] end;
    update bookings set reminders_sent = v_keys where id = b.id;
    select * into t from tutor_profiles where id = b.tutor_id;
    v_data := jsonb_build_object('subject', subject_name(b.subject_id), 'startsAt', iso(b.starts_at), 'bookingId', b.id);
    for v_recipient in select learner_side(b.student_id) loop
      perform notify(v_recipient, 'lesson_reminder', v_data || jsonb_build_object('name', t.display_name));
    end loop;
    perform notify(t.user_id, 'lesson_reminder', v_data || jsonb_build_object('name', display_name_of(b.student_id)));
    v_sent := v_sent + 1;
  end loop;
  return v_sent;
end;
$$;

create or replace function public.run_maintenance() returns void
language plpgsql security definer set search_path = public as $$
begin
  -- Lessons whose end time has passed are completed.
  with done as (
    update bookings set lesson_status = 'completed', updated_at = now()
    where status = 'confirmed' and lesson_status <> 'completed'
      and starts_at + make_interval(mins => duration_minutes) < now()
    returning tutor_id
  ), counts as (
    select tutor_id, count(*) as n from done group by tutor_id
  )
  update tutor_profiles t set lessons_completed = t.lessons_completed + c.n from counts c where t.id = c.tutor_id;

  perform expire_proposals();
  perform send_due_reminders();
  delete from rate_events where created_at < now() - interval '1 day';
  delete from blocked_attempts where created_at < now() - interval '2 days';
end;
$$;

create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule('fahimni-maintenance', '*/5 * * * *', 'select public.run_maintenance()');

-- ─── File storage ───────────────────────────────────────────────────────────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('chat-attachments', 'chat-attachments', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']),
  ('tutor-documents', 'tutor-documents', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do nothing;

-- Chat files live in a folder named after the conversation; documents in the applicant's folder.
create policy "participants upload chat files" on storage.objects for insert to authenticated
  with check (bucket_id = 'chat-attachments' and public.is_participant(public.try_uuid(split_part(name, '/', 1))));
create policy "participants read chat files" on storage.objects for select to authenticated
  using (bucket_id = 'chat-attachments' and public.is_participant(public.try_uuid(split_part(name, '/', 1))));
create policy "applicants upload documents" on storage.objects for insert to authenticated
  with check (bucket_id = 'tutor-documents' and split_part(name, '/', 1) = auth.uid()::text);
create policy "applicants and admins read documents" on storage.objects for select to authenticated
  using (bucket_id = 'tutor-documents' and (split_part(name, '/', 1) = auth.uid()::text or public.is_admin()));

-- ─── Who may call what ──────────────────────────────────────────────────────

-- Direct table access is closed; the functions above are the API.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all routines in schema public from public, anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on routines from public, anon, authenticated;

-- Realtime delivers these rows, filtered by the RLS policies on each table.
grant select on public.messages, public.notifications, public.lesson_proposals to authenticated;

-- Row Level Security and storage policies call these as the signed-in user.
grant execute on function
  public.is_admin(), public.owns_tutor(uuid), public.is_participant(uuid), public.acts_for_student(uuid),
  public.try_uuid(text)
to authenticated;

-- Public catalogue: visitors can browse before signing up.
grant execute on function
  public.list_subjects(), public.search_tutors(), public.get_tutor(uuid), public.list_reviews(uuid, integer),
  public.get_settings(), public.get_available_slots(uuid, integer, integer)
to anon, authenticated;

grant execute on function
  public.get_session(), public.update_my_profile(text, text, text, text, integer), public.add_child(jsonb),
  public.get_preferences(), public.update_preferences(jsonb), public.list_deliveries(),
  public.update_availability(uuid, jsonb, boolean), public.update_hourly_rate(uuid, integer),
  public.update_tutor_profile(uuid, jsonb), public.list_favorites(), public.toggle_favorite(uuid),
  public.update_settings(integer, integer, integer, settlement_method[], integer, integer), public.admin_overview(),
  public.list_conversations(), public.get_conversation(uuid), public.list_messages(uuid), public.get_message(uuid),
  public.open_conversation(uuid, uuid), public.mark_conversation_read(uuid),
  public.create_booking(uuid, uuid, timestamptz, integer, lesson_mode, settlement_method, integer, integer, text, uuid),
  public.get_booking(uuid), public.list_bookings_for_student(uuid), public.list_bookings_for_tutor(uuid),
  public.cancel_booking(uuid), public.respond_to_booking(uuid, boolean), public.simulate_payment(uuid),
  public.submit_review(uuid, integer, text),
  public.list_proposals(uuid), public.get_proposal(uuid), public.accept_proposal(uuid, settlement_method, integer, integer),
  public.respond_to_proposal(uuid, text), public.classroom_ticket(uuid),
  public.list_notifications(), public.mark_all_notifications_read(), public.tutor_stats(uuid),
  public.submit_tutor_application(jsonb), public.my_application(), public.list_applications(),
  public.review_application(uuid, boolean, text),
  public.file_report(text, uuid, text, text, uuid, uuid, uuid), public.list_my_reports(), public.report_queue(),
  public.resolve_report(uuid, text, boolean, text, integer)
to authenticated;

-- Server only: Route Handlers and scheduled jobs.
grant all on all tables in schema public to service_role;
grant execute on all routines in schema public to service_role;
