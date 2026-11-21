create or replace function public.kb_counselor_assigned_students()
returns table (
  id uuid,
  profile_id uuid,
  parent_phone text,
  nisn text,
  full_name text,
  status text,
  birth_date date,
  gender text,
  class_id uuid,
  class_name text,
  grade_level integer,
  academic_year_id uuid,
  academic_year text,
  homeroom_teacher_id uuid,
  homeroom_teacher_name text,
  counselor_profile_id uuid,
  counselor_name text
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if not public.superapp_has_active_role(array['guru_bk']::text[]) then
    raise exception 'Akses daftar siswa asuh tidak diizinkan.'
      using errcode = '42501';
  end if;

  return query
    with caller as (
      select profile.id, profile.username, profile.full_name
      from public.profiles profile
      where profile.id = auth.uid()
    ),
    counselor as (
      select teacher.full_name, teacher.bk_class_ids, teacher.profile_id
      from public.teachers teacher
      cross join caller
      where teacher.primary_role = 'Guru BK'
        and (
          teacher.profile_id = caller.id
          or (
            teacher.profile_id is null
            and btrim(teacher.nip::text) = btrim(caller.username::text)
          )
        )
      order by (teacher.profile_id = caller.id) desc
      limit 1
    )
    select
      student.id::uuid,
      student.profile_id::uuid,
      student.parent_phone::text,
      student.nisn::text,
      student.full_name::text,
      student.status::text,
      student.birth_date::date,
      student.gender::text,
      class.id::uuid,
      class.name::text,
      class.grade_level::integer,
      class.academic_year_id::uuid,
      year.name::text,
      class.homeroom_teacher_id::uuid,
      homeroom.full_name::text,
      caller.id::uuid,
      coalesce(counselor.full_name::text, caller.full_name::text, caller.username::text)
    from public.students student
    cross join caller
    left join counselor on true
    left join public.attendance_bk_assignments assignment
      on assignment.student_id = student.id
    left join public.classes class on class.id = student.class_id
    left join public.academic_years year on year.id = class.academic_year_id
    left join lateral (
      select teacher.full_name
      from public.teachers teacher
      where class.homeroom_teacher_id = teacher.id
        or class.homeroom_teacher_id = teacher.profile_id
      order by (class.homeroom_teacher_id = teacher.id) desc
      limit 1
    ) homeroom on true
    where assignment.counselor_profile_id = caller.id
      or (
        assignment.student_id is null
        and student.class_id = any(coalesce(counselor.bk_class_ids, '{}'::uuid[]))
      )
    order by student.full_name;
end;
$function$;

revoke all on function public.kb_counselor_assigned_students() from public, anon;
grant execute on function public.kb_counselor_assigned_students() to authenticated;
