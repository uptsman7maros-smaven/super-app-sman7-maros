create or replace function public.eosis_admin_access(
  p_username text,
  p_password text
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  return exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.status = 'active'::public.account_status
      and p.role = any(array[
        'super_admin'::public.app_role,
        'kepala_sekolah'::public.app_role,
        'operator'::public.app_role
      ])
  );
end;
$function$;

revoke all on function public.eosis_admin_access(text, text) from public, anon, authenticated;
grant execute on function public.eosis_admin_call(text, text) to authenticated;
grant execute on function public.eosis_is_admin(text, text) to authenticated;
grant execute on function public.admin_login(text, text) to authenticated;
