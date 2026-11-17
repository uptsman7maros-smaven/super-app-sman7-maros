create or replace function public.superapp_has_active_role(_roles text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.status = 'active'
      and p.role::text = any(_roles)
  );
$$;

revoke all on function public.superapp_has_active_role(text[]) from public, anon;
grant execute on function public.superapp_has_active_role(text[]) to authenticated;

do $$
declare
  spec record;
  view_roles text;
  insert_roles text;
  update_roles text;
  delete_roles text;
begin
  for spec in
    select * from (values
      ('finance_transactions', array['super_admin','kepala_sekolah','kepala_tata_usaha']::text[], array['super_admin','kepala_tata_usaha']::text[], array['super_admin','kepala_tata_usaha']::text[], array['super_admin']::text[]),
      ('finance_budgets', array['super_admin','kepala_sekolah','kepala_tata_usaha']::text[], array['super_admin','kepala_tata_usaha']::text[], array['super_admin','kepala_tata_usaha']::text[], array['super_admin']::text[]),
      ('inv_assets', array['super_admin','operator','kepala_sekolah','kepala_tata_usaha']::text[], array['super_admin','operator','kepala_tata_usaha']::text[], array['super_admin','operator','kepala_tata_usaha']::text[], array['super_admin']::text[]),
      ('inv_places', array['super_admin','operator','kepala_sekolah','kepala_tata_usaha']::text[], array['super_admin','operator','kepala_tata_usaha']::text[], array['super_admin','operator','kepala_tata_usaha']::text[], array['super_admin']::text[]),
      ('inv_issues', array['super_admin','operator','kepala_sekolah','kepala_tata_usaha']::text[], array['super_admin','operator','kepala_tata_usaha']::text[], array['super_admin','operator','kepala_tata_usaha']::text[], array['super_admin']::text[]),
      ('inv_loans', array['super_admin','operator','kepala_sekolah','kepala_tata_usaha']::text[], array['super_admin','operator','kepala_tata_usaha']::text[], array['super_admin','operator','kepala_tata_usaha']::text[], array['super_admin']::text[]),
      ('inv_history', array['super_admin','operator','kepala_sekolah','kepala_tata_usaha']::text[], array['super_admin','operator','kepala_tata_usaha']::text[], array[]::text[], array[]::text[]),
      ('inv_minutes', array['super_admin','operator','kepala_sekolah','kepala_tata_usaha']::text[], array['super_admin','operator','kepala_tata_usaha']::text[], array[]::text[], array[]::text[]),
      ('school_announcements', array['super_admin','operator','kepala_sekolah','kepala_tata_usaha']::text[], array['super_admin','operator']::text[], array[]::text[], array['super_admin','operator']::text[]),
      ('school_agenda', array['super_admin','operator','kepala_sekolah','kepala_tata_usaha']::text[], array['super_admin','operator']::text[], array[]::text[], array['super_admin','operator']::text[]),
      ('school_notifications', array['super_admin','operator','kepala_sekolah','kepala_tata_usaha','staff_tata_usaha','guru','siswa','tendik']::text[], array['super_admin','operator']::text[], array[]::text[], array['super_admin','operator']::text[]),
      ('school_documents', array['super_admin','operator','kepala_sekolah','kepala_tata_usaha']::text[], array['super_admin','operator']::text[], array[]::text[], array['super_admin','operator']::text[])
    ) as rules(table_name, view_roles, insert_roles, update_roles, delete_roles)
  loop
    if to_regclass(format('public.%I', spec.table_name)) is null then
      continue;
    end if;

    view_roles := 'array[' || coalesce(array_to_string(array(select quote_literal(r) from unnest(spec.view_roles) as r), ','), '') || ']::text[]';
    insert_roles := 'array[' || coalesce(array_to_string(array(select quote_literal(r) from unnest(spec.insert_roles) as r), ','), '') || ']::text[]';
    update_roles := 'array[' || coalesce(array_to_string(array(select quote_literal(r) from unnest(spec.update_roles) as r), ','), '') || ']::text[]';
    delete_roles := 'array[' || coalesce(array_to_string(array(select quote_literal(r) from unnest(spec.delete_roles) as r), ','), '') || ']::text[]';

    execute format('alter table public.%I enable row level security', spec.table_name);
    execute format('drop policy if exists superapp_role_scope on public.%I', spec.table_name);
    execute format('drop policy if exists superapp_role_access on public.%I', spec.table_name);
    execute format('drop policy if exists superapp_insert_scope on public.%I', spec.table_name);
    execute format('drop policy if exists superapp_update_scope on public.%I', spec.table_name);
    execute format('drop policy if exists superapp_delete_scope on public.%I', spec.table_name);

    execute format(
      'create policy superapp_role_scope on public.%I as restrictive for all to authenticated using (public.superapp_has_active_role(%s)) with check (public.superapp_has_active_role(%s))',
      spec.table_name, view_roles, view_roles
    );
    execute format(
      'create policy superapp_role_access on public.%I for all to authenticated using (public.superapp_has_active_role(%s)) with check (public.superapp_has_active_role(%s))',
      spec.table_name, view_roles, view_roles
    );
    execute format(
      'create policy superapp_insert_scope on public.%I as restrictive for insert to authenticated with check (public.superapp_has_active_role(%s))',
      spec.table_name, insert_roles
    );
    execute format(
      'create policy superapp_update_scope on public.%I as restrictive for update to authenticated using (public.superapp_has_active_role(%s)) with check (public.superapp_has_active_role(%s))',
      spec.table_name, update_roles, update_roles
    );
    execute format(
      'create policy superapp_delete_scope on public.%I as restrictive for delete to authenticated using (public.superapp_has_active_role(%s))',
      spec.table_name, delete_roles
    );
  end loop;
end;
$$;

drop policy if exists superapp_finance_evidence_access on storage.objects;
drop policy if exists superapp_finance_evidence_role_scope on storage.objects;
drop policy if exists superapp_finance_evidence_insert_scope on storage.objects;
drop policy if exists superapp_finance_evidence_update_scope on storage.objects;
drop policy if exists superapp_finance_evidence_delete_scope on storage.objects;

create policy superapp_finance_evidence_access on storage.objects
  for all to authenticated
  using (
    bucket_id = 'finance-evidence'
    and public.superapp_has_active_role(array['super_admin','kepala_sekolah','kepala_tata_usaha']::text[])
  )
  with check (
    bucket_id = 'finance-evidence'
    and public.superapp_has_active_role(array['super_admin','kepala_tata_usaha']::text[])
  );

create policy superapp_finance_evidence_role_scope on storage.objects
  as restrictive for all to authenticated
  using (
    bucket_id <> 'finance-evidence'
    or public.superapp_has_active_role(array['super_admin','kepala_sekolah','kepala_tata_usaha']::text[])
  )
  with check (
    bucket_id <> 'finance-evidence'
    or public.superapp_has_active_role(array['super_admin','kepala_sekolah','kepala_tata_usaha']::text[])
  );

create policy superapp_finance_evidence_insert_scope on storage.objects
  as restrictive for insert to authenticated
  with check (
    bucket_id <> 'finance-evidence'
    or public.superapp_has_active_role(array['super_admin','kepala_tata_usaha']::text[])
  );

create policy superapp_finance_evidence_update_scope on storage.objects
  as restrictive for update to authenticated
  using (
    bucket_id <> 'finance-evidence'
    or public.superapp_has_active_role(array['super_admin','kepala_tata_usaha']::text[])
  )
  with check (
    bucket_id <> 'finance-evidence'
    or public.superapp_has_active_role(array['super_admin','kepala_tata_usaha']::text[])
  );

create policy superapp_finance_evidence_delete_scope on storage.objects
  as restrictive for delete to authenticated
  using (
    bucket_id <> 'finance-evidence'
    or public.superapp_has_active_role(array['super_admin']::text[])
  );
