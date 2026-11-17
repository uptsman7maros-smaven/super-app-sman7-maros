begin;

revoke all on function public.admin_login(text, text) from public, anon, authenticated;
grant execute on function public.admin_login(text, text) to authenticated;

revoke all on function public.eosis_admin_call(text, text) from public, anon, authenticated;
grant execute on function public.eosis_admin_call(text, text) to authenticated;

revoke all on function public.eosis_is_admin(text, text) from public, anon, authenticated;
grant execute on function public.eosis_is_admin(text, text) to authenticated;

revoke all on function public.get_dashboard_stats(text, text) from public, anon, authenticated;
grant execute on function public.get_dashboard_stats(text, text) to authenticated;

revoke all on function public.get_voting_results(text, text) from public, anon, authenticated;
grant execute on function public.get_voting_results(text, text) to authenticated;

revoke all on function public.get_class_stats(text, text) from public, anon, authenticated;
grant execute on function public.get_class_stats(text, text) to authenticated;

revoke all on function public.get_classes_v3(text, text) from public, anon, authenticated;
grant execute on function public.get_classes_v3(text, text) to authenticated;

revoke all on function public.get_voter_registry_v3(text, text) from public, anon, authenticated;
grant execute on function public.get_voter_registry_v3(text, text) to authenticated;

revoke all on function public.get_system_sync_status_v3(text, text) from public, anon, authenticated;
grant execute on function public.get_system_sync_status_v3(text, text) to authenticated;

revoke all on function public.set_voting_status(text, text, boolean) from public, anon, authenticated;
grant execute on function public.set_voting_status(text, text, boolean) to authenticated;

revoke all on function public.reset_voting_results(text, text) from public, anon, authenticated;
grant execute on function public.reset_voting_results(text, text) to authenticated;

revoke all on function public.save_candidate(text, text, bigint, integer, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.save_candidate(text, text, bigint, integer, text, text, text, text, text, text) to authenticated;

revoke all on function public.delete_candidate(text, text, bigint) from public, anon, authenticated;
grant execute on function public.delete_candidate(text, text, bigint) to authenticated;

revoke all on function public.save_school_settings_v3(
  text, text, text, text, text, text, text, text, date, date,
  text, date, text, text, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.save_school_settings_v3(
  text, text, text, text, text, text, text, text, date, date,
  text, date, text, text, text, text, text, text
) to authenticated;

revoke all on function public.add_class(text, text, text) from public, anon, authenticated;
grant execute on function public.add_class(text, text, text) to authenticated;

revoke all on function public.delete_class_v3(text, text, bigint) from public, anon, authenticated;
grant execute on function public.delete_class_v3(text, text, bigint) to authenticated;

revoke all on function public.import_students(text, text, jsonb) from public, anon, authenticated;
grant execute on function public.import_students(text, text, jsonb) to authenticated;

revoke all on function public.eosis_sync_voters_from_datainduk() from public, anon, authenticated;
grant execute on function public.eosis_sync_voters_from_datainduk() to authenticated;

do $$
declare
  v_signature text;
  v_function regprocedure;
begin
  foreach v_signature in array array[
    'public.update_admin_credentials_v3(text, text, text, text)',
    'public.add_admin_v4(text, text, text, text)',
    'public.get_admins_v4(text, text)',
    'public.delete_admin_v4(text, text, bigint)'
  ] loop
    v_function := to_regprocedure(v_signature);
    if v_function is null then
      raise notice 'Optional eOSIS RPC is not installed: %', v_signature;
      continue;
    end if;

    execute format(
      'revoke all on function %s from public, anon, authenticated',
      v_function
    );
    execute format(
      'grant execute on function %s to authenticated',
      v_function
    );
  end loop;
end;
$$;

notify pgrst, 'reload schema';

commit;
