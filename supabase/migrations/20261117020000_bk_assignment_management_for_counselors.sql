drop policy if exists attendance_bk_assignments_read_scope on public.attendance_bk_assignments;
create policy attendance_bk_assignments_read_scope
  on public.attendance_bk_assignments
  for select to authenticated
  using (
    public.superapp_has_active_role(array['super_admin', 'operator', 'guru_bk']::text[])
  );

drop policy if exists attendance_bk_assignments_admin_write on public.attendance_bk_assignments;
drop policy if exists attendance_bk_assignments_manager_write on public.attendance_bk_assignments;
create policy attendance_bk_assignments_manager_write
  on public.attendance_bk_assignments
  for all to authenticated
  using (
    public.superapp_has_active_role(array['super_admin', 'operator', 'guru_bk']::text[])
  )
  with check (
    public.superapp_has_active_role(array['super_admin', 'operator', 'guru_bk']::text[])
    and exists (
      select 1
      from public.profiles counselor
      where counselor.id = counselor_profile_id
        and counselor.status = 'active'::public.account_status
        and counselor.role::text = 'guru_bk'
    )
  );
