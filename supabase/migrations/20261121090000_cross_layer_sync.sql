create or replace function public.current_finance_role()
returns text
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce(
    (
      select profile.role::text
      from public.profiles profile
      where profile.id = auth.uid()
      limit 1
    ),
    ''
  );
$function$;

create or replace function public.finance_can_read()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select public.current_finance_role() in (
    'super_admin',
    'operator',
    'bendahara',
    'kepala_sekolah',
    'kepala_tata_usaha'
  );
$function$;

create or replace function public.finance_can_manage()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select public.current_finance_role() in (
    'super_admin',
    'operator',
    'bendahara',
    'kepala_tata_usaha'
  );
$function$;

create or replace function public.finance_can_approve()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select public.current_finance_role() in ('super_admin', 'kepala_sekolah');
$function$;

create or replace function public.finance_can_delete()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select public.current_finance_role() in ('super_admin', 'operator');
$function$;

revoke all on function public.current_finance_role() from public, anon;
revoke all on function public.finance_can_read() from public, anon;
revoke all on function public.finance_can_manage() from public, anon;
revoke all on function public.finance_can_approve() from public, anon;
revoke all on function public.finance_can_delete() from public, anon;
grant execute on function public.current_finance_role() to authenticated;
grant execute on function public.finance_can_read() to authenticated;
grant execute on function public.finance_can_manage() to authenticated;
grant execute on function public.finance_can_approve() to authenticated;
grant execute on function public.finance_can_delete() to authenticated;

alter table public.finance_transactions enable row level security;
alter table public.finance_budgets enable row level security;

drop policy if exists superapp_role_scope on public.finance_transactions;
drop policy if exists superapp_role_access on public.finance_transactions;
drop policy if exists superapp_insert_scope on public.finance_transactions;
drop policy if exists superapp_update_scope on public.finance_transactions;
drop policy if exists superapp_delete_scope on public.finance_transactions;
drop policy if exists finance_transactions_read on public.finance_transactions;
create policy finance_transactions_read on public.finance_transactions
  for select to authenticated
  using (public.finance_can_read());

drop policy if exists finance_transactions_insert on public.finance_transactions;
create policy finance_transactions_insert on public.finance_transactions
  for insert to authenticated
  with check (
    public.finance_can_manage()
    and created_by = auth.uid()
    and status = any(array['draft', 'menunggu']::text[])
  );

drop policy if exists finance_transactions_update on public.finance_transactions;
create policy finance_transactions_update on public.finance_transactions
  for update to authenticated
  using (
    (
      public.finance_can_manage()
      and status = any(array['draft', 'menunggu', 'disetujui']::text[])
    )
    or (
      public.finance_can_approve()
      and status = 'menunggu'
      and created_by <> auth.uid()
    )
  )
  with check (
    (
      public.finance_can_manage()
      and status = any(array['draft', 'menunggu', 'disetujui', 'dibayar']::text[])
    )
    or (
      public.finance_can_approve()
      and status = any(array['disetujui', 'ditolak']::text[])
    )
  );

drop policy if exists finance_transactions_delete on public.finance_transactions;
create policy finance_transactions_delete on public.finance_transactions
  for delete to authenticated
  using (
    public.finance_can_delete()
    and status = any(array['draft', 'ditolak']::text[])
  );

drop policy if exists superapp_role_scope on public.finance_budgets;
drop policy if exists superapp_role_access on public.finance_budgets;
drop policy if exists superapp_insert_scope on public.finance_budgets;
drop policy if exists superapp_update_scope on public.finance_budgets;
drop policy if exists superapp_delete_scope on public.finance_budgets;
drop policy if exists finance_budgets_read on public.finance_budgets;
create policy finance_budgets_read on public.finance_budgets
  for select to authenticated
  using (public.finance_can_read());

drop policy if exists finance_budgets_insert on public.finance_budgets;
create policy finance_budgets_insert on public.finance_budgets
  for insert to authenticated
  with check (
    public.finance_can_manage()
    and (created_by is null or created_by = auth.uid())
  );

drop policy if exists finance_budgets_update on public.finance_budgets;
create policy finance_budgets_update on public.finance_budgets
  for update to authenticated
  using (public.finance_can_manage())
  with check (public.finance_can_manage());

drop policy if exists finance_budgets_delete on public.finance_budgets;
create policy finance_budgets_delete on public.finance_budgets
  for delete to authenticated
  using (public.finance_can_delete());

grant select, insert, update, delete
  on public.finance_transactions, public.finance_budgets
  to authenticated;

alter table storage.objects enable row level security;

drop policy if exists superapp_finance_evidence_access on storage.objects;
drop policy if exists superapp_finance_evidence_role_scope on storage.objects;
drop policy if exists superapp_finance_evidence_insert_scope on storage.objects;
drop policy if exists superapp_finance_evidence_update_scope on storage.objects;
drop policy if exists superapp_finance_evidence_delete_scope on storage.objects;
drop policy if exists finance_evidence_read on storage.objects;
create policy finance_evidence_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'finance-evidence'
    and public.finance_can_read()
  );

drop policy if exists finance_evidence_insert on storage.objects;
create policy finance_evidence_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'finance-evidence'
    and public.finance_can_manage()
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists finance_evidence_update on storage.objects;
create policy finance_evidence_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'finance-evidence'
    and public.finance_can_manage()
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'finance-evidence'
    and public.finance_can_manage()
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists finance_evidence_delete on storage.objects;
create policy finance_evidence_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'finance-evidence'
    and public.finance_can_delete()
    and (storage.foldername(name))[1] = auth.uid()::text
  );
