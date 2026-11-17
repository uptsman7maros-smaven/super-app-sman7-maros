do $migration$
begin
  if not exists (
    select 1
    from pg_publication
    where pubname = 'supabase_realtime'
  ) then
    raise exception 'Publikasi supabase_realtime tidak ditemukan.';
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'library_loan_requests'
  ) then
    execute 'alter publication supabase_realtime add table public.library_loan_requests';
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'library_digital_access'
  ) then
    execute 'alter publication supabase_realtime add table public.library_digital_access';
  end if;
end;
$migration$;
