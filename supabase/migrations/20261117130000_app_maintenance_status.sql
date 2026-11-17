create table if not exists public.app_maintenance_status (
  id smallint primary key default 1 check (id = 1),
  is_active boolean not null default false,
  message text not null default 'Aplikasi sedang dalam pemeliharaan. Silakan coba kembali beberapa saat lagi.',
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

insert into public.app_maintenance_status (id)
values (1)
on conflict (id) do nothing;

alter table public.app_maintenance_status enable row level security;

drop policy if exists app_maintenance_status_public_read
  on public.app_maintenance_status;
create policy app_maintenance_status_public_read
  on public.app_maintenance_status
  for select
  to anon, authenticated
  using (true);

drop policy if exists app_maintenance_status_super_admin_update
  on public.app_maintenance_status;
create policy app_maintenance_status_super_admin_update
  on public.app_maintenance_status
  for update
  to authenticated
  using (public.superapp_has_active_role(array['super_admin']::text[]))
  with check (public.superapp_has_active_role(array['super_admin']::text[]));

grant select on public.app_maintenance_status to anon, authenticated;
grant update on public.app_maintenance_status to authenticated;

do $migration$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'app_maintenance_status'
    )
  then
    alter publication supabase_realtime add table public.app_maintenance_status;
  end if;
end
$migration$;
