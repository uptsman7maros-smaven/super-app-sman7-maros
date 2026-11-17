drop policy if exists academic_records_active_role_restriction on public.academic_records;
create policy academic_records_active_role_restriction on public.academic_records
  as restrictive for all to authenticated
  using (
    public.has_active_role(ARRAY[
      'super_admin'::public.app_role,
      'kepala_sekolah'::public.app_role,
      'operator'::public.app_role,
      'guru'::public.app_role
    ])
    or (
      public.has_active_role(ARRAY['siswa'::public.app_role])
      and category in (
        'Jadwal Mengajar',
        'Materi Kelas',
        'Tugas Kelas',
        'Pengumuman',
        'Tautan E-learning'
      )
    )
  )
  with check (public.has_active_role(ARRAY[
    'super_admin'::public.app_role,
    'operator'::public.app_role,
    'guru'::public.app_role
  ]));

drop policy if exists library_books_active_role_restriction on public.library_books;
create policy library_books_active_role_restriction on public.library_books
  as restrictive for all to authenticated
  using (public.has_active_role(ARRAY[
    'super_admin'::public.app_role,
    'kepala_sekolah'::public.app_role,
    'operator'::public.app_role,
    'guru'::public.app_role,
    'siswa'::public.app_role
  ]))
  with check (public.has_active_role(ARRAY[
    'super_admin'::public.app_role,
    'kepala_sekolah'::public.app_role,
    'operator'::public.app_role,
    'guru'::public.app_role
  ]));

drop policy if exists academic_records_insert_role_scope on public.academic_records;
create policy academic_records_insert_role_scope on public.academic_records
  as restrictive for insert to authenticated
  with check (public.has_active_role(ARRAY[
    'super_admin'::public.app_role,
    'operator'::public.app_role,
    'guru'::public.app_role
  ]));

drop policy if exists academic_records_update_role_scope on public.academic_records;
create policy academic_records_update_role_scope on public.academic_records
  as restrictive for update to authenticated
  using (public.has_active_role(ARRAY[
    'super_admin'::public.app_role,
    'operator'::public.app_role,
    'guru'::public.app_role
  ]))
  with check (public.has_active_role(ARRAY[
    'super_admin'::public.app_role,
    'operator'::public.app_role,
    'guru'::public.app_role
  ]));

drop policy if exists academic_records_delete_role_scope on public.academic_records;
create policy academic_records_delete_role_scope on public.academic_records
  as restrictive for delete to authenticated
  using (public.has_active_role(ARRAY[
    'super_admin'::public.app_role,
    'operator'::public.app_role
  ]));

drop policy if exists library_books_insert_role_scope on public.library_books;
create policy library_books_insert_role_scope on public.library_books
  as restrictive for insert to authenticated
  with check (public.has_active_role(ARRAY[
    'super_admin'::public.app_role,
    'operator'::public.app_role
  ]));

drop policy if exists library_books_update_role_scope on public.library_books;
create policy library_books_update_role_scope on public.library_books
  as restrictive for update to authenticated
  using (public.has_active_role(ARRAY[
    'super_admin'::public.app_role,
    'operator'::public.app_role
  ]))
  with check (public.has_active_role(ARRAY[
    'super_admin'::public.app_role,
    'operator'::public.app_role
  ]));

drop policy if exists library_books_delete_role_scope on public.library_books;
create policy library_books_delete_role_scope on public.library_books
  as restrictive for delete to authenticated
  using (public.has_active_role(ARRAY['super_admin'::public.app_role]));

drop policy if exists library_members_insert_role_scope on public.library_members;
create policy library_members_insert_role_scope on public.library_members
  as restrictive for insert to authenticated
  with check (public.has_active_role(ARRAY[
    'super_admin'::public.app_role,
    'operator'::public.app_role
  ]));

drop policy if exists library_members_update_role_scope on public.library_members;
create policy library_members_update_role_scope on public.library_members
  as restrictive for update to authenticated
  using (public.has_active_role(ARRAY[
    'super_admin'::public.app_role,
    'operator'::public.app_role
  ]))
  with check (public.has_active_role(ARRAY[
    'super_admin'::public.app_role,
    'operator'::public.app_role
  ]));

drop policy if exists library_members_delete_role_scope on public.library_members;
create policy library_members_delete_role_scope on public.library_members
  as restrictive for delete to authenticated
  using (public.has_active_role(ARRAY['super_admin'::public.app_role]));

drop policy if exists library_loans_insert_role_scope on public.library_loans;
create policy library_loans_insert_role_scope on public.library_loans
  as restrictive for insert to authenticated
  with check (public.has_active_role(ARRAY[
    'super_admin'::public.app_role,
    'operator'::public.app_role,
    'guru'::public.app_role
  ]));

drop policy if exists library_loans_update_role_scope on public.library_loans;
create policy library_loans_update_role_scope on public.library_loans
  as restrictive for update to authenticated
  using (public.has_active_role(ARRAY[
    'super_admin'::public.app_role,
    'operator'::public.app_role,
    'guru'::public.app_role
  ]))
  with check (public.has_active_role(ARRAY[
    'super_admin'::public.app_role,
    'operator'::public.app_role,
    'guru'::public.app_role
  ]));

drop policy if exists library_loans_delete_role_scope on public.library_loans;
create policy library_loans_delete_role_scope on public.library_loans
  as restrictive for delete to authenticated
  using (public.has_active_role(ARRAY['super_admin'::public.app_role]));

drop policy if exists library_visits_insert_role_scope on public.library_visits;
create policy library_visits_insert_role_scope on public.library_visits
  as restrictive for insert to authenticated
  with check (public.has_active_role(ARRAY[
    'super_admin'::public.app_role,
    'operator'::public.app_role,
    'guru'::public.app_role
  ]));

drop policy if exists library_visits_update_role_scope on public.library_visits;
create policy library_visits_update_role_scope on public.library_visits
  as restrictive for update to authenticated
  using (public.has_active_role(ARRAY[
    'super_admin'::public.app_role,
    'operator'::public.app_role
  ]))
  with check (public.has_active_role(ARRAY[
    'super_admin'::public.app_role,
    'operator'::public.app_role
  ]));

drop policy if exists library_visits_delete_role_scope on public.library_visits;
create policy library_visits_delete_role_scope on public.library_visits
  as restrictive for delete to authenticated
  using (public.has_active_role(ARRAY['super_admin'::public.app_role]));

create or replace function public.library_enforce_circulation_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if not public.has_active_role(ARRAY[
    'super_admin'::public.app_role,
    'operator'::public.app_role,
    'guru'::public.app_role
  ]) then
    raise exception 'Akses sirkulasi perpustakaan tidak diizinkan.';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$function$;

revoke all on function public.library_enforce_circulation_role() from public, anon, authenticated;

drop trigger if exists library_enforce_circulation_role on public.library_loans;
create trigger library_enforce_circulation_role
  before insert or update or delete on public.library_loans
  for each row execute function public.library_enforce_circulation_role();
