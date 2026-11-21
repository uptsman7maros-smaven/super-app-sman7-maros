create or replace function public.library_is_head_librarian()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce(
    exists (
      select 1
      from public.library_librarian_assignments assignment
      join public.profiles profile on profile.id = assignment.profile_id
      where assignment.profile_id = auth.uid()
        and assignment.active
        and profile.status::text = 'active'
        and profile.role::text = 'guru'
    )
    or public.superapp_teacher_has_additional_role('Kepala Perpustakaan'),
    false
  );
$function$;

revoke all on function public.library_is_head_librarian() from public, anon;
grant execute on function public.library_is_head_librarian() to authenticated;

create or replace function public.set_teacher_homeroom_class(
  p_teacher_id uuid,
  p_class_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_profile_id uuid;
  v_primary_role text;
  v_staff_category text;
begin
  if not public.superapp_has_active_role(array['super_admin', 'operator']::text[]) then
    raise exception 'Akses pengaturan wali kelas tidak diizinkan.'
      using errcode = '42501';
  end if;

  select teacher.profile_id, teacher.staff_category, teacher.primary_role
  into v_profile_id, v_staff_category, v_primary_role
  from public.teachers teacher
  where teacher.id = p_teacher_id;

  if not found then
    raise exception 'Data guru tidak ditemukan.';
  end if;

  if p_class_id is not null and v_profile_id is null then
    raise exception 'Tautkan akun guru sebelum menetapkan wali kelas.';
  end if;

  if p_class_id is not null
    and (v_staff_category <> 'Guru' or v_primary_role <> 'Guru Mata Pelajaran') then
    raise exception 'Wali kelas hanya dapat ditetapkan kepada guru mata pelajaran.';
  end if;

  if p_class_id is not null and not exists (
    select 1 from public.classes class where class.id = p_class_id
  ) then
    raise exception 'Kelas wali tidak ditemukan.';
  end if;

  update public.classes class
  set homeroom_teacher_id = null
  where (
      class.homeroom_teacher_id = p_teacher_id
      or (
        v_profile_id is not null
        and class.homeroom_teacher_id = v_profile_id
      )
    )
    and class.id is distinct from p_class_id;

  if p_class_id is not null then
    update public.classes
    set homeroom_teacher_id = v_profile_id
    where id = p_class_id;
  end if;
end;
$function$;

revoke all on function public.set_teacher_homeroom_class(uuid, uuid) from public, anon;
grant execute on function public.set_teacher_homeroom_class(uuid, uuid) to authenticated;
