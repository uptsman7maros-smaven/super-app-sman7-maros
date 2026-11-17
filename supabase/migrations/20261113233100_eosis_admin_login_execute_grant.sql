begin;

revoke all on function public.admin_login(text, text) from public, anon;
grant execute on function public.admin_login(text, text) to authenticated;

do $$
begin
  if not has_function_privilege(
    'authenticated',
    'public.admin_login(text, text)',
    'EXECUTE'
  ) then
    raise exception 'authenticated must be able to execute public.admin_login(text, text)';
  end if;

  if has_function_privilege(
    'anon',
    'public.admin_login(text, text)',
    'EXECUTE'
  ) then
    raise exception 'anon must not be able to execute public.admin_login(text, text)';
  end if;
end;
$$;

notify pgrst, 'reload schema';

commit;
