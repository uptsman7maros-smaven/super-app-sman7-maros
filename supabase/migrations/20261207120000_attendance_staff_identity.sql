create or replace function public.get_my_attendance_identity()
returns table (
  person_type text,
  person_identifier text,
  person_name text
)
language sql
stable
security definer
set search_path = ''
as $function$
  select
    'siswa'::text,
    btrim(student.nisn)::text,
    student.full_name::text
  from public.profiles profile
  join public.students student
    on btrim(student.nisn) = btrim(profile.username)
  where profile.id = auth.uid()
    and profile.status = 'active'::public.account_status
    and profile.role::text = 'siswa'

  union all

  select
    'guru_tendik'::text,
    btrim(teacher.nip)::text,
    teacher.full_name::text
  from public.profiles profile
  join public.teachers teacher
    on teacher.profile_id = profile.id
    or (
      teacher.profile_id is null
      and btrim(profile.username) = btrim(teacher.nip)
    )
  where profile.id = auth.uid()
    and profile.status = 'active'::public.account_status
    and profile.role::text in (
      'guru', 'guru_bk', 'tendik', 'staff_tata_usaha', 'kepala_tata_usaha'
    );
$function$;

revoke all on function public.get_my_attendance_identity()
  from public, anon, authenticated;
grant execute on function public.get_my_attendance_identity()
  to authenticated;

notify pgrst, 'reload schema';
