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
  on conflict on constraint attendance_records_unique_person_day
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

notify pgrst, 'reload schema';
