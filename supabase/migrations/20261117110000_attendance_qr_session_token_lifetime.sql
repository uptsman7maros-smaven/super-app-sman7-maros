create or replace function public.attendance_set_qr_token_expiry()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  new.token_expires_at := coalesce(
    new.expires_at,
    ((new.attendance_date + 1)::timestamp without time zone at time zone 'Asia/Makassar')
  );
  return new;
end;
$function$;

drop trigger if exists attendance_qr_sessions_set_token_expiry
  on public.attendance_qr_sessions;
create trigger attendance_qr_sessions_set_token_expiry
  before insert or update of attendance_date, session_type, expires_at, token_expires_at
  on public.attendance_qr_sessions
  for each row
  execute function public.attendance_set_qr_token_expiry();

update public.attendance_qr_sessions
set token_expires_at = coalesce(
  expires_at,
  ((attendance_date + 1)::timestamp without time zone at time zone 'Asia/Makassar')
);

create or replace function public.refresh_attendance_qr_session(p_session_id uuid)
returns table (token text, expires_at timestamptz, token_expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_today date := (now() at time zone 'Asia/Makassar')::date;
begin
  return query
    select s.token, s.expires_at, s.token_expires_at
    from public.attendance_qr_sessions s
    where s.id = p_session_id
      and s.created_by = auth.uid()
      and s.is_active
      and (s.expires_at is null or s.expires_at > now())
      and s.token_expires_at > now()
      and s.attendance_date >= v_today
      and public.attendance_is_school_day(s.attendance_date);

  if not found then
    raise exception 'Sesi QR sudah berakhir atau tidak dapat diakses.';
  end if;
end;
$function$;
