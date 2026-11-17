drop policy if exists library_books_active_role_restriction on public.library_books;
create policy library_books_active_role_restriction on public.library_books
  as restrictive
  for all to authenticated
  using (public.has_active_role(ARRAY[
    'super_admin'::public.app_role,
    'kepala_sekolah'::public.app_role,
    'operator'::public.app_role,
    'guru'::public.app_role
  ]))
  with check (public.has_active_role(ARRAY[
    'super_admin'::public.app_role,
    'kepala_sekolah'::public.app_role,
    'operator'::public.app_role,
    'guru'::public.app_role
  ]));

drop policy if exists library_members_active_role_restriction on public.library_members;
create policy library_members_active_role_restriction on public.library_members
  as restrictive
  for all to authenticated
  using (public.has_active_role(ARRAY[
    'super_admin'::public.app_role,
    'kepala_sekolah'::public.app_role,
    'operator'::public.app_role,
    'guru'::public.app_role
  ]))
  with check (public.has_active_role(ARRAY[
    'super_admin'::public.app_role,
    'kepala_sekolah'::public.app_role,
    'operator'::public.app_role,
    'guru'::public.app_role
  ]));

drop policy if exists library_loans_active_role_restriction on public.library_loans;
create policy library_loans_active_role_restriction on public.library_loans
  as restrictive
  for all to authenticated
  using (public.has_active_role(ARRAY[
    'super_admin'::public.app_role,
    'kepala_sekolah'::public.app_role,
    'operator'::public.app_role,
    'guru'::public.app_role
  ]))
  with check (public.has_active_role(ARRAY[
    'super_admin'::public.app_role,
    'kepala_sekolah'::public.app_role,
    'operator'::public.app_role,
    'guru'::public.app_role
  ]));

drop policy if exists library_visits_active_role_restriction on public.library_visits;
create policy library_visits_active_role_restriction on public.library_visits
  as restrictive
  for all to authenticated
  using (public.has_active_role(ARRAY[
    'super_admin'::public.app_role,
    'kepala_sekolah'::public.app_role,
    'operator'::public.app_role,
    'guru'::public.app_role
  ]))
  with check (public.has_active_role(ARRAY[
    'super_admin'::public.app_role,
    'kepala_sekolah'::public.app_role,
    'operator'::public.app_role,
    'guru'::public.app_role
  ]));

drop policy if exists academic_records_active_role_restriction on public.academic_records;
create policy academic_records_active_role_restriction on public.academic_records
  as restrictive
  for all to authenticated
  using (public.has_active_role(ARRAY[
    'super_admin'::public.app_role,
    'kepala_sekolah'::public.app_role,
    'operator'::public.app_role,
    'guru'::public.app_role
  ]))
  with check (public.has_active_role(ARRAY[
    'super_admin'::public.app_role,
    'kepala_sekolah'::public.app_role,
    'operator'::public.app_role,
    'guru'::public.app_role
  ]));
