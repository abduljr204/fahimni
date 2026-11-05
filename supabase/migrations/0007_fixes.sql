-- Fixes found by running the app against a real project.

-- Supabase refuses an UPDATE without a WHERE clause through its API, even on a one-row table.
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
    classroom_closes_minutes_after = p_closes_after, updated_at = now(), updated_by = v_user
  where id;
  return get_settings();
end;
$$;

create or replace function public.create_child(p_parent uuid, p_child jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := gen_random_uuid();
  v_name text := trim(coalesce(p_child->>'fullName', ''));
  v_school text := trim(coalesce(p_child->>'school', ''));
  v_birth integer := nullif(p_child->>'birthYear', '')::integer;
  v_year integer := nullif(p_child->>'studyYear', '')::integer;
  v_hue smallint := floor(random() * 360)::smallint;
  v_age integer := extract(year from now())::integer - v_birth;
begin
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

revoke all on function public.update_settings(integer, integer, integer, settlement_method[], integer, integer) from public, anon;
grant execute on function public.update_settings(integer, integer, integer, settlement_method[], integer, integer) to authenticated, service_role;
revoke all on function public.create_child(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.create_child(uuid, jsonb) to service_role;
