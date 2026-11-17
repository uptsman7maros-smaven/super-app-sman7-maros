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
  return public.has_active_role(ARRAY[
    'super_admin'::public.app_role,
    'kepala_sekolah'::public.app_role,
    'operator'::public.app_role
  ]);
end;
$function$;

create or replace function public.eosis_admin_call(p_username text, p_password text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select public.eosis_admin_access(p_username, p_password);
$function$;

create or replace function public.eosis_is_admin(p_username text, p_password text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select public.eosis_admin_access(p_username, p_password);
$function$;

create or replace function public.admin_login(p_username text, p_password text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select public.eosis_admin_access(p_username, p_password);
$function$;

revoke all on function public.eosis_admin_access(text, text) from public, anon, authenticated;
revoke all on function public.eosis_admin_call(text, text) from public, anon, authenticated;
revoke all on function public.eosis_is_admin(text, text) from public, anon, authenticated;
revoke all on function public.admin_login(text, text) from public, anon, authenticated;

grant execute on function public.eosis_admin_call(text, text) to authenticated;
grant execute on function public.eosis_is_admin(text, text) to authenticated;
grant execute on function public.admin_login(text, text) to authenticated;
