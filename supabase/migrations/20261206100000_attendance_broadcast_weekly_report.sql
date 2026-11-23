alter table public.attendance_qr_sessions
  add column if not exists is_admin_broadcast boolean not null default false;

create index if not exists attendance_qr_sessions_admin_broadcast_active_idx
  on public.attendance_qr_sessions (attendance_date, expires_at desc)
  where is_admin_broadcast and is_active;

create or replace function public.create_attendance_arrival_broadcast(
  p_duration_minutes integer
)
returns table(session_id uuid, token text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_local_date date := (now() at time zone 'Asia/Makassar')::date;
  v_expires_at timestamptz;
  v_token text;
  v_session_id uuid;
begin
  if auth.uid() is null
    or not public.superapp_has_active_role(array['super_admin', 'operator']::text[]) then
    raise exception 'Hanya administrator atau operator aktif yang dapat mengirim QR kedatangan.';
  end if;
  if p_duration_minutes is null or p_duration_minutes not between 1 and 480 then
    raise exception 'Durasi QR harus antara 1 dan 480 menit.';
  end if;
  if not public.attendance_is_school_day(v_local_date) then
    raise exception 'QR kedatangan hanya dapat diaktifkan pada hari sekolah.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('attendance-arrival-broadcast', 0));
  update public.attendance_qr_sessions session
  set is_active = false
  where session.is_admin_broadcast
    and session.is_active;

  v_expires_at := least(
    now() + make_interval(mins => p_duration_minutes),
    ((v_local_date + 1)::timestamp at time zone 'Asia/Makassar')
  );
  if v_expires_at <= now() then
    raise exception 'Batas waktu QR kedatangan untuk hari ini telah terlewati.';
  end if;
  v_token := gen_random_uuid()::text;

  insert into public.attendance_qr_sessions (
    token,
    session_type,
    created_by,
    expires_at,
    token_expires_at,
    attendance_date,
    is_admin_broadcast
  )
  values (
    v_token,
    'school_arrival',
    auth.uid(),
    v_expires_at,
    v_expires_at,
    v_local_date,
    true
  )
  returning id into v_session_id;

  return query select v_session_id, v_token, v_expires_at;
end;
$function$;

create or replace function public.get_active_attendance_arrival_broadcast()
returns table(session_id uuid, token text, expires_at timestamptz, server_now timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_user_role text;
  v_session public.attendance_qr_sessions%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Sesi login tidak tersedia.';
  end if;

  select profile.role::text
  into v_user_role
  from public.profiles profile
  where profile.id = auth.uid()
    and profile.status = 'active'::public.account_status;

  if v_user_role in ('super_admin', 'operator') then
    null;
  elsif v_user_role is distinct from 'siswa' or not exists (
      select 1
      from public.students student
      join public.profiles profile on btrim(profile.username) = btrim(student.nisn)
      where profile.id = auth.uid()
        and profile.status = 'active'::public.account_status
        and student.status = 'Active'
    ) then
    raise exception 'QR Kedatangan hanya tersedia untuk siswa dan administrator aktif.';
  end if;

  select session.*
  into v_session
  from public.attendance_qr_sessions session
  where session.is_admin_broadcast
    and session.session_type = 'school_arrival'
    and session.is_active
    and session.attendance_date = (now() at time zone 'Asia/Makassar')::date
    and session.expires_at > now()
    and session.token_expires_at > now()
  order by session.created_at desc
  limit 1;

  if found then
    return query select v_session.id, v_session.token, v_session.expires_at, now();
  else
    return query select null::uuid, null::text, null::timestamptz, now();
  end if;
  return;

end;
$function$;

create or replace function public.close_attendance_arrival_broadcast(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if auth.uid() is null
    or not public.superapp_has_active_role(array['super_admin', 'operator']::text[]) then
    raise exception 'Hanya administrator atau operator aktif yang dapat mengakhiri QR kedatangan.';
  end if;

  update public.attendance_qr_sessions session
  set is_active = false
  where session.id = p_session_id
    and session.is_admin_broadcast
    and session.session_type = 'school_arrival'
    and session.is_active;
  if not found then
    raise exception 'Sesi QR Kedatangan tidak ditemukan atau sudah berakhir.';
  end if;
end;
$function$;

create or replace function public.create_attendance_departure_broadcast(
  p_duration_minutes integer
)
returns table(session_id uuid, token text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_local_date date := (now() at time zone 'Asia/Makassar')::date;
  v_settings public.attendance_schedule_settings%rowtype;
  v_scan_start timestamptz;
  v_expires_at timestamptz;
  v_token text;
  v_session_id uuid;
begin
  if auth.uid() is null
    or not public.superapp_has_active_role(array['super_admin', 'operator']::text[]) then
    raise exception 'Hanya administrator atau operator aktif yang dapat mengirim QR kepulangan.';
  end if;
  if p_duration_minutes is null or p_duration_minutes not between 1 and 480 then
    raise exception 'Durasi QR harus antara 1 dan 480 menit.';
  end if;
  if not public.attendance_is_school_day(v_local_date) then
    raise exception 'QR kepulangan hanya dapat diaktifkan pada hari sekolah.';
  end if;

  select * into strict v_settings
  from public.attendance_schedule_settings
  where id = 1;
  v_scan_start := (v_local_date + v_settings.departure_scan_from) at time zone 'Asia/Makassar';
  if now() < v_scan_start then
    raise exception 'QR kepulangan baru dapat diaktifkan mulai pukul % WITA.',
      to_char(v_settings.departure_scan_from, 'HH24:MI');
  end if;

  perform pg_advisory_xact_lock(hashtextextended('attendance-departure-broadcast', 0));
  update public.attendance_qr_sessions session
  set is_active = false
  where session.is_admin_broadcast
    and session.session_type = 'school_departure'
    and session.is_active;

  v_expires_at := least(
    now() + make_interval(mins => p_duration_minutes),
    v_scan_start + make_interval(mins => v_settings.departure_qr_duration_minutes::integer),
    ((v_local_date + 1)::timestamp at time zone 'Asia/Makassar')
  );
  if v_expires_at <= now() then
    raise exception 'Batas waktu QR kepulangan untuk hari ini telah terlewati.';
  end if;
  v_token := gen_random_uuid()::text;

  insert into public.attendance_qr_sessions (
    token,
    session_type,
    created_by,
    expires_at,
    token_expires_at,
    attendance_date,
    is_admin_broadcast
  )
  values (
    v_token,
    'school_departure',
    auth.uid(),
    v_expires_at,
    v_expires_at,
    v_local_date,
    true
  )
  returning id into v_session_id;

  return query select v_session_id, v_token, v_expires_at;
end;
$function$;

create or replace function public.get_active_attendance_departure_broadcast()
returns table(session_id uuid, token text, expires_at timestamptz, server_now timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_user_role text;
  v_session public.attendance_qr_sessions%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Sesi login tidak tersedia.';
  end if;

  select profile.role::text
  into v_user_role
  from public.profiles profile
  where profile.id = auth.uid()
    and profile.status = 'active'::public.account_status;

  if v_user_role in ('super_admin', 'operator') then
    null;
  elsif v_user_role is distinct from 'siswa' or not exists (
      select 1
      from public.students student
      join public.profiles profile on btrim(profile.username) = btrim(student.nisn)
      where profile.id = auth.uid()
        and profile.status = 'active'::public.account_status
        and student.status = 'Active'
    ) then
    raise exception 'QR Kepulangan hanya tersedia untuk siswa dan administrator aktif.';
  end if;

  select session.*
  into v_session
  from public.attendance_qr_sessions session
  where session.is_admin_broadcast
    and session.session_type = 'school_departure'
    and session.is_active
    and session.attendance_date = (now() at time zone 'Asia/Makassar')::date
    and session.expires_at > now()
    and session.token_expires_at > now()
  order by session.created_at desc
  limit 1;

  if found then
    return query select v_session.id, v_session.token, v_session.expires_at, now();
  else
    return query select null::uuid, null::text, null::timestamptz, now();
  end if;
  return;
end;
$function$;

create or replace function public.close_attendance_departure_broadcast(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if auth.uid() is null
    or not public.superapp_has_active_role(array['super_admin', 'operator']::text[]) then
    raise exception 'Hanya administrator atau operator aktif yang dapat mengakhiri QR kepulangan.';
  end if;

  update public.attendance_qr_sessions session
  set is_active = false
  where session.id = p_session_id
    and session.is_admin_broadcast
    and session.session_type = 'school_departure'
    and session.is_active;
  if not found then
    raise exception 'Sesi QR Kepulangan tidak ditemukan atau sudah berakhir.';
  end if;
end;
$function$;

create or replace function public.submit_attendance_arrival_broadcast(
  p_token text,
  p_status text default 'hadir',
  p_note text default null
)
returns table(
  session_type text,
  subject text,
  class_name text,
  attendance_status text,
  attendance_date date,
  already_recorded boolean,
  qr_record_id uuid
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_session public.attendance_qr_sessions%rowtype;
  v_settings public.attendance_schedule_settings%rowtype;
  v_student_id uuid;
  v_nisn text;
  v_student_name text;
  v_class_id uuid;
  v_class_name text;
  v_attendance_date date := (now() at time zone 'Asia/Makassar')::date;
  v_local_time time := (now() at time zone 'Asia/Makassar')::time;
  v_status text;
  v_qr_record_id uuid;
  v_already_recorded boolean := false;
begin
  if auth.uid() is null
    or not public.superapp_has_active_role(array['siswa']::text[]) then
    raise exception 'Hanya siswa aktif yang dapat menggunakan QR Kedatangan Administrator.';
  end if;
  if p_status is distinct from 'hadir' or nullif(btrim(coalesce(p_note, '')), '') is not null then
    raise exception 'QR Kedatangan Administrator hanya menerima status hadir otomatis.';
  end if;

  select session.*
  into v_session
  from public.attendance_qr_sessions session
  where session.token = btrim(p_token)
    and session.is_admin_broadcast
    and session.session_type = 'school_arrival'
    and session.is_active
    and session.attendance_date = v_attendance_date
    and session.expires_at > now()
    and session.token_expires_at > now()
  for update;
  if not found then
    raise exception 'QR Kedatangan Administrator tidak valid atau telah kedaluwarsa.';
  end if;
  if not public.attendance_is_school_day(v_attendance_date) then
    raise exception 'Absensi kedatangan tidak tersedia pada hari libur atau bukan hari sekolah.';
  end if;

  select student.id, btrim(student.nisn), student.full_name, student.class_id, class.name
  into v_student_id, v_nisn, v_student_name, v_class_id, v_class_name
  from public.profiles profile
  join public.students student on btrim(student.nisn) = btrim(profile.username)
  left join public.classes class on class.id = student.class_id
  where profile.id = auth.uid()
    and profile.status = 'active'::public.account_status
    and profile.role::text = 'siswa'
    and student.status = 'Active'
  limit 1;
  if v_student_id is null or nullif(v_nisn, '') is null then
    raise exception 'Data siswa aktif untuk akun ini tidak ditemukan di Data Induk.';
  end if;

  select * into strict v_settings
  from public.attendance_schedule_settings
  where id = 1;
  v_status := case
    when v_local_time > v_settings.arrival_ontime_until then 'terlambat'
    else 'hadir'
  end;

  insert into public.attendance_qr_records (
    session_id, attendance_date, session_type, person_type, person_identifier,
    person_name, class_name, status, note, created_by, student_id, class_id
  )
  values (
    v_session.id, v_attendance_date, 'school_arrival', 'siswa', v_nisn,
    v_student_name, v_class_name, v_status,
    'Kehadiran dicatat melalui QR Kedatangan Administrator.', auth.uid(), v_student_id, v_class_id
  )
  on conflict (session_id, person_type, person_identifier) do nothing
  returning id into v_qr_record_id;

  if v_qr_record_id is null then
    v_already_recorded := true;
    select record.id, record.status
    into v_qr_record_id, v_status
    from public.attendance_qr_records record
    where record.session_id = v_session.id
      and record.person_type = 'siswa'
      and record.person_identifier = v_nisn;
  end if;

  insert into public.attendance_records (
    attendance_date, person_type, person_identifier, person_name, class_name,
    status, note, created_by, student_id, class_id
  )
  values (
    v_attendance_date, 'siswa', v_nisn, v_student_name, v_class_name,
    v_status, 'Kehadiran dicatat melalui QR Kedatangan Administrator.',
    auth.uid(), v_student_id, v_class_id
  )
  on conflict (attendance_date, person_type, person_identifier)
  do update set
    person_name = excluded.person_name,
    class_name = excluded.class_name,
    status = excluded.status,
    note = excluded.note,
    student_id = excluded.student_id,
    class_id = excluded.class_id,
    updated_at = now();

  return query
    select 'school_arrival'::text, null::text, v_class_name, v_status,
      v_attendance_date, v_already_recorded, v_qr_record_id;
end;
$function$;

create or replace function public.get_my_attendance_weekly_report(p_week_start date)
returns table(
  class_id uuid,
  class_name text,
  grade_level integer,
  attendance_date date,
  student_id uuid,
  person_identifier text,
  person_name text,
  gender text,
  status text,
  note text,
  recorded_at timestamptz,
  is_effective_day boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_today date := (now() at time zone 'Asia/Makassar')::date;
  v_local_time time := (now() at time zone 'Asia/Makassar')::time;
  v_settings public.attendance_schedule_settings%rowtype;
begin
  if auth.uid() is null
    or not public.superapp_has_active_role(array['guru', 'guru_bk']::text[]) then
    raise exception 'Rekap mingguan hanya tersedia untuk Guru, Guru BK, dan akun pengajar aktif.';
  end if;
  if p_week_start is null
    or extract(isodow from p_week_start) <> 1
    or p_week_start > v_today then
    raise exception 'Periode rekap harus dimulai pada hari Senin dan bukan tanggal mendatang.';
  end if;

  select * into strict v_settings
  from public.attendance_schedule_settings
  where id = 1;

  return query
  with my_teacher as (
    select teacher.id
    from public.profiles profile
    join public.teachers teacher
      on teacher.profile_id = profile.id
      or (
        teacher.profile_id is null
        and btrim(teacher.nip) = btrim(profile.username)
      )
    where profile.id = auth.uid()
      and profile.status = 'active'::public.account_status
    order by (teacher.profile_id = profile.id) desc nulls last
    limit 1
  ),
  authorized_classes as (
    select class.id
    from public.classes class
    where public.attendance_teacher_owns_class(class.id)
    union
    select assignment.class_id
    from public.attendance_teacher_subject_assignments assignment
    join my_teacher teacher on teacher.id = assignment.teacher_id
    where public.superapp_has_active_role(array['guru']::text[])
    union
    select student.class_id
    from public.attendance_bk_assignments assignment
    join public.students student on student.id = assignment.student_id
    where assignment.counselor_profile_id = auth.uid()
      and student.status = 'Active'
      and student.class_id is not null
      and public.superapp_has_active_role(array['guru_bk']::text[])
  ),
  report_days as (
    select generated.day_value::date as school_date,
      public.attendance_is_school_day(generated.day_value::date) as is_school_day,
      (
        generated.day_value::date <= v_today
        and public.attendance_is_school_day(generated.day_value::date)
      ) as is_effective_day
    from generate_series(p_week_start, p_week_start + 4, interval '1 day') generated(day_value)
  )
  select class.id,
    class.name::text,
    class.grade_level,
    report_days.school_date,
    student.id,
    coalesce(btrim(student.nisn), '')::text,
    student.full_name::text,
    case
      when lower(btrim(coalesce(student.gender::text, ''))) in ('l', 'laki-laki', 'laki laki', 'male') then 'L'
      when lower(btrim(coalesce(student.gender::text, ''))) in ('p', 'perempuan', 'female') then 'P'
      else null
    end,
    case
      when not report_days.is_school_day then 'belum_tercatat'
      else coalesce(
        attendance.status::text,
        case
          when report_days.school_date < v_today
            or (report_days.school_date = v_today and v_local_time >= v_settings.arrival_absent_at)
            then 'alpa'
          else 'belum_tercatat'
        end
      )
    end,
    case when not report_days.is_school_day then 'Libur sekolah' else attendance.note::text end,
    case
      when attendance.status::text in ('hadir', 'terlambat')
        then coalesce(arrival_qr.created_at, attendance.created_at)
      else arrival_qr.created_at
    end,
    report_days.is_effective_day
  from authorized_classes authorized
  join public.classes class on class.id = authorized.id
  join public.students student
    on student.class_id = class.id
   and student.status = 'Active'
  cross join report_days
  left join lateral (
    select record.status, record.note, record.created_at
    from public.attendance_records record
    where record.attendance_date = report_days.school_date
      and record.person_type = 'siswa'
      and record.person_identifier = btrim(student.nisn)
      and (
        record.class_id = class.id
        or (
          record.class_id is null
          and lower(btrim(record.class_name)) = lower(btrim(class.name))
        )
      )
    order by record.created_at desc
    limit 1
  ) attendance on true
  left join lateral (
    select record.created_at
    from public.attendance_qr_records record
    where record.attendance_date = report_days.school_date
      and record.person_type = 'siswa'
      and record.person_identifier = btrim(student.nisn)
      and record.session_type = 'school_arrival'
      and not record.is_voided
      and (
        record.class_id = class.id
        or (
          record.class_id is null
          and lower(btrim(record.class_name)) = lower(btrim(class.name))
        )
      )
    order by record.created_at desc
    limit 1
  ) arrival_qr on true
  order by class.name, student.full_name, report_days.school_date;
end;
$function$;

revoke all on function public.create_attendance_arrival_broadcast(integer)
  from public, anon;
revoke all on function public.get_active_attendance_arrival_broadcast()
  from public, anon;
revoke all on function public.create_attendance_departure_broadcast(integer)
  from public, anon;
revoke all on function public.get_active_attendance_departure_broadcast()
  from public, anon;
revoke all on function public.close_attendance_departure_broadcast(uuid)
  from public, anon;
revoke all on function public.close_attendance_arrival_broadcast(uuid)
  from public, anon;
revoke all on function public.submit_attendance_arrival_broadcast(text, text, text)
  from public, anon;
revoke all on function public.get_my_attendance_weekly_report(date)
  from public, anon;
grant execute on function public.create_attendance_arrival_broadcast(integer)
  to authenticated;
grant execute on function public.get_active_attendance_arrival_broadcast()
  to authenticated;
grant execute on function public.create_attendance_departure_broadcast(integer)
  to authenticated;
grant execute on function public.get_active_attendance_departure_broadcast()
  to authenticated;
grant execute on function public.close_attendance_departure_broadcast(uuid)
  to authenticated;
grant execute on function public.close_attendance_arrival_broadcast(uuid)
  to authenticated;
grant execute on function public.submit_attendance_arrival_broadcast(text, text, text)
  to authenticated;
grant execute on function public.get_my_attendance_weekly_report(date)
  to authenticated;

notify pgrst, 'reload schema';
