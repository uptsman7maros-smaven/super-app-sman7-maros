begin;

drop policy if exists module_settings_admin_write on public.app_module_settings;
drop policy if exists app_module_settings_super_admin_write on public.app_module_settings;
drop policy if exists app_module_settings_write_guard on public.app_module_settings;
drop policy if exists app_module_settings_update_guard on public.app_module_settings;
drop policy if exists app_module_settings_delete_guard on public.app_module_settings;

drop policy if exists app_module_settings_manage_write on public.app_module_settings;
create policy app_module_settings_manage_write
  on public.app_module_settings
  for update
  to authenticated
  using (public.superapp_has_active_role(array['super_admin','operator']::text[]))
  with check (public.superapp_has_active_role(array['super_admin','operator']::text[]));

drop policy if exists app_module_settings_super_admin_insert on public.app_module_settings;
create policy app_module_settings_super_admin_insert
  on public.app_module_settings
  for insert
  to authenticated
  with check (public.superapp_has_active_role(array['super_admin','operator']::text[]));

drop policy if exists app_module_settings_super_admin_delete on public.app_module_settings;
create policy app_module_settings_super_admin_delete
  on public.app_module_settings
  for delete
  to authenticated
  using (public.superapp_has_active_role(array['super_admin','operator']::text[]));

create or replace function public.set_app_module_status(
  p_module_id uuid,
  p_is_enabled boolean
)
returns public.app_module_settings
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_row public.app_module_settings;
begin
  if not public.superapp_has_active_role(array['super_admin','operator']::text[]) then
    raise exception 'Hanya Super Admin atau Operator yang dapat mengubah status modul';
  end if;

  update public.app_module_settings
  set is_enabled = p_is_enabled,
      updated_at = now(),
      updated_by = auth.uid()
  where id = p_module_id
  returning * into updated_row;

  if updated_row.id is null then
    raise exception 'Modul tidak ditemukan';
  end if;

  return updated_row;
end;
$$;

revoke all on function public.set_app_module_status(uuid, boolean) from public, anon;
grant execute on function public.set_app_module_status(uuid, boolean) to authenticated;

update public.app_module_settings
set is_enabled = true,
    updated_at = now(),
    updated_by = auth.uid();

commit;
