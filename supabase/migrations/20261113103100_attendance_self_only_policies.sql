create or replace function public.attendance_self_identity_matches(
  p_person_type text,
  p_person_identifier text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.status = 'active'::public.account_status
      and (
        (
          p.role = 'siswa'::public.app_role
          and p_person_type = 'siswa'
          and p.username = p_person_identifier
        )
        or (
          p_person_type = 'guru_tendik'
          and exists (
            select 1
            from public.teachers t
            where t.nip = p_person_identifier
              and (
                t.profile_id = p.id
                or (
                  t.profile_id is null
                  and p.username = t.nip
                  and p.role::text in (
                    'guru',
                    'tendik',
                    'staff_tata_usaha',
                    'kepala_tata_usaha'
                  )
                )
              )
          )
        )
      )
  );
$function$;

revoke all on function public.attendance_self_identity_matches(text, text) from public;
grant execute on function public.attendance_self_identity_matches(text, text) to authenticated;

drop policy if exists students_self_attendance_read on public.students;
create policy students_self_attendance_read on public.students
  for select to authenticated
  using (public.attendance_self_identity_matches('siswa', nisn));

drop policy if exists teachers_self_attendance_read on public.teachers;
create policy teachers_self_attendance_read on public.teachers
  for select to authenticated
  using (public.attendance_self_identity_matches('guru_tendik', nip));

drop policy if exists attendance_read_authorized on public.attendance_records;
create policy attendance_read_authorized on public.attendance_records
  for select to authenticated
  using (
    public.has_active_role(ARRAY[
      'super_admin'::public.app_role,
      'kepala_sekolah'::public.app_role,
      'operator'::public.app_role,
      'kepala_tata_usaha'::public.app_role,
      'staff_tata_usaha'::public.app_role
    ])
    or public.attendance_self_identity_matches(person_type, person_identifier)
  );

drop policy if exists attendance_insert_authorized on public.attendance_records;
create policy attendance_insert_authorized on public.attendance_records
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and (
      public.has_active_role(ARRAY[
        'super_admin'::public.app_role,
        'operator'::public.app_role
      ])
      or public.attendance_self_identity_matches(person_type, person_identifier)
    )
  );

drop policy if exists attendance_update_authorized on public.attendance_records;
create policy attendance_update_authorized on public.attendance_records
  for update to authenticated
  using (
    public.has_active_role(ARRAY[
      'super_admin'::public.app_role,
      'operator'::public.app_role
    ])
    or public.attendance_self_identity_matches(person_type, person_identifier)
  )
  with check (
    public.has_active_role(ARRAY[
      'super_admin'::public.app_role,
      'operator'::public.app_role
    ])
    or public.attendance_self_identity_matches(person_type, person_identifier)
  );
