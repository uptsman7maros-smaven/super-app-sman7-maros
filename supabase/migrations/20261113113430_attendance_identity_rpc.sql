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
    s.nisn::text,
    s.full_name::text
  from public.profiles p
  join public.students s on s.nisn = p.username
  where p.id = auth.uid()
    and p.status = 'active'::public.account_status
    and p.role::text = 'siswa'

  union all

  select
    'guru_tendik'::text,
    t.nip::text,
    t.full_name::text
  from public.profiles p
  join public.teachers t
    on t.profile_id = p.id
    or (
      t.profile_id is null
      and p.username = t.nip
      and p.role::text in ('guru', 'tendik')
    )
  where p.id = auth.uid()
    and p.status = 'active'::public.account_status
    and p.role::text in ('guru', 'tendik');
$function$;

revoke all on function public.get_my_attendance_identity() from public, anon, authenticated;
grant execute on function public.get_my_attendance_identity() to authenticated;

drop policy if exists students_self_attendance_read on public.students;
drop policy if exists teachers_self_attendance_read on public.teachers;
