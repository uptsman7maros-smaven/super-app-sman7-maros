drop function if exists public.create_attendance_qr_session(text, text, uuid);

create function public.create_attendance_qr_session(
  p_session_type text,
  p_subject text default null,
  p_class_id uuid default null
)
returns table (
  session_id uuid,
  token text,
  session_type text,
  subject text,
  class_name text,
  teacher_name text,
  attendance_date date,
  expires_at timestamptz,
  token_expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_teacher_id uuid;
  v_teacher_name text;
  v_class_id uuid;
  v_class_name text;
  v_subject text;
  v_token text;
  v_expires_at timestamptz;
  v_token_expires_at timestamptz;
  v_session_id uuid;
  v_settings public.attendance_schedule_settings%rowtype;
  v_now_local timestamp without time zone;
  v_session_date date;
begin
  if auth.uid() is null then
    raise exception 'Sesi login tidak tersedia.';
  end if;

  select *
    into strict v_settings
  from public.attendance_schedule_settings
  where id = 1;

  v_now_local := now() at time zone 'Asia/Makassar';

  if p_session_type in ('school_arrival', 'school_departure') then
    if not public.superapp_has_active_role(array['super_admin', 'operator']::text[]) then
      raise exception 'Hanya admin atau operator aktif yang dapat membuat QR kedatangan/kepulangan sekolah.';
    end if;

    if p_session_type = 'school_arrival' then
      v_session_date := case
        when public.attendance_is_school_day(v_now_local::date)
          and v_now_local::time < v_settings.arrival_absent_at
          then v_now_local::date
        else public.attendance_next_school_day(v_now_local::date + 1)
      end;
      v_expires_at := (v_session_date + v_settings.arrival_absent_at) at time zone 'Asia/Makassar';
    else
      v_session_date := case
        when public.attendance_is_school_day(v_now_local::date) then v_now_local::date
        else public.attendance_next_school_day(v_now_local::date + 1)
      end;
      v_expires_at := null;
    end if;

    update public.attendance_qr_sessions s
      set is_active = false
      where s.session_type = p_session_type
        and s.attendance_date <= v_session_date
        and s.is_active;
  elsif p_session_type = 'subject' then
    if not public.superapp_has_active_role(array['guru']::text[]) then
      raise exception 'QR mata pelajaran hanya dapat dibuat oleh akun guru aktif.';
    end if;

    if not public.attendance_is_school_day(v_now_local::date) then
      raise exception 'QR mata pelajaran hanya dapat dibuat pada hari sekolah.';
    end if;

    v_session_date := v_now_local::date;
    v_subject := nullif(btrim(p_subject), '');
    if v_subject is null or length(v_subject) > 120 then
      raise exception 'Nama mata pelajaran wajib diisi (maksimal 120 karakter).';
    end if;

    select class.id, class.name
      into v_class_id, v_class_name
    from public.classes class
    where class.id = p_class_id
    order by class.name
    limit 1;

    if v_class_id is null then
      raise exception 'Kelas tidak ditemukan. Gunakan kelas yang ditugaskan kepada Anda.';
    end if;

    select teacher.id, teacher.full_name
      into v_teacher_id, v_teacher_name
    from public.profiles profile
    join public.teachers teacher
      on teacher.profile_id = profile.id
      or (
        teacher.profile_id is null
        and btrim(teacher.nip) = btrim(profile.username)
      )
    where profile.id = auth.uid()
      and profile.status = 'active'::public.account_status
      and profile.role::text = 'guru'
    order by (teacher.profile_id = profile.id) desc nulls last
    limit 1;

    if v_teacher_id is null then
      raise exception 'Akun guru belum tertaut ke Data Induk.';
    end if;

    if not exists (
      select 1
      from public.attendance_teacher_subject_assignments assignment
      where assignment.teacher_id = v_teacher_id
        and assignment.class_id = v_class_id
        and lower(btrim(assignment.subject)) = lower(v_subject)
    ) then
      raise exception 'Mata pelajaran dan kelas tersebut belum ditugaskan kepada Anda. Hubungi admin/operator Data Induk.';
    end if;

    v_expires_at := now() + interval '90 minutes';
  else
    raise exception 'Jenis sesi QR tidak valid.';
  end if;

  v_token := gen_random_uuid()::text;
  v_token_expires_at := now() + interval '90 seconds';

  insert into public.attendance_qr_sessions (
    token,
    session_type,
    subject,
    class_name,
    teacher_name,
    created_by,
    expires_at,
    token_expires_at,
    attendance_date
  )
  values (
    v_token,
    p_session_type,
    v_subject,
    v_class_name,
    v_teacher_name,
    auth.uid(),
    v_expires_at,
    v_token_expires_at,
    v_session_date
  )
  returning id into v_session_id;

  return query
    select v_session_id, v_token, p_session_type, v_subject, v_class_name,
      v_teacher_name, v_session_date, v_expires_at, v_token_expires_at;
end;
$function$;

revoke all on function public.create_attendance_qr_session(text, text, uuid)
  from public, anon;
grant execute on function public.create_attendance_qr_session(text, text, uuid)
  to authenticated;
