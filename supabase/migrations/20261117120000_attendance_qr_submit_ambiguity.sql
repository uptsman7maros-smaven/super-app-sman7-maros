create or replace function public.submit_attendance_qr(p_token text)
returns table (
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
#variable_conflict use_column
declare
  v_session public.attendance_qr_sessions%rowtype;
  v_settings public.attendance_schedule_settings%rowtype;
  v_nisn text;
  v_person_name text;
  v_student_class_name text;
  v_attendance_date date;
  v_local_time time;
  v_record_id uuid;
  v_already_recorded boolean;
  v_attendance_status text := 'hadir';
  v_note text;
begin
  if auth.uid() is null
    or not public.superapp_has_active_role(array['siswa']::text[]) then
    raise exception 'Hanya siswa dengan akun aktif yang dapat mengirim absensi QR.';
  end if;

  v_attendance_date := (now() at time zone 'Asia/Makassar')::date;
  v_local_time := (now() at time zone 'Asia/Makassar')::time;

  if not public.attendance_is_school_day(v_attendance_date) then
    raise exception 'Absensi QR tidak tersedia pada tanggal libur atau bukan hari sekolah.';
  end if;

  select *
    into strict v_settings
  from public.attendance_schedule_settings
  where id = 1;

  select s.*
    into v_session
  from public.attendance_qr_sessions s
  where s.token = btrim(p_token)
    and s.is_active
    and (s.expires_at is null or s.expires_at > now())
    and s.token_expires_at > now()
    and s.attendance_date = v_attendance_date;

  if not found then
    raise exception 'QR tidak valid, belum berlaku, atau sudah kedaluwarsa. Minta QR terbaru kepada petugas/guru.';
  end if;

  if v_session.session_type = 'school_arrival' then
    if v_local_time < v_settings.arrival_start_time then
      raise exception 'QR kedatangan baru dapat dipindai mulai pukul % WITA.', to_char(v_settings.arrival_start_time, 'HH24:MI');
    end if;
    if v_local_time > v_settings.arrival_absent_at then
      raise exception 'Batas pemindaian kedatangan telah lewat pukul % WITA.', to_char(v_settings.arrival_absent_at, 'HH24:MI');
    end if;
    if v_local_time > v_settings.arrival_ontime_until then
      v_attendance_status := 'terlambat';
      v_note := 'Kehadiran dicatat melalui QR kedatangan setelah batas waktu hadir.';
    else
      v_note := 'Kehadiran dicatat melalui QR kedatangan sekolah.';
    end if;
  elsif v_session.session_type = 'school_departure' then
    if v_local_time < v_settings.departure_scan_from then
      raise exception 'QR kepulangan baru dapat dipindai mulai pukul % WITA.', to_char(v_settings.departure_scan_from, 'HH24:MI');
    end if;
  end if;

  select btrim(st.nisn)::text, st.full_name::text, c.name::text
    into v_nisn, v_person_name, v_student_class_name
  from public.profiles p
  join public.students st on btrim(st.nisn) = btrim(p.username)
  left join public.classes c on c.id = st.class_id
  where p.id = auth.uid()
    and p.status = 'active'::public.account_status
    and p.role::text = 'siswa'
    and st.status = 'Active'
  limit 1;

  if v_nisn is null or btrim(v_nisn) = '' then
    raise exception 'Data siswa aktif untuk akun ini tidak ditemukan di Data Induk.';
  end if;

  if v_session.session_type = 'subject'
    and lower(btrim(coalesce(v_student_class_name, ''))) <> lower(btrim(coalesce(v_session.class_name, ''))) then
    raise exception 'QR ini hanya berlaku untuk kelas %.', v_session.class_name;
  end if;

  insert into public.attendance_qr_records (
    session_id,
    attendance_date,
    session_type,
    subject,
    teacher_name,
    person_type,
    person_identifier,
    person_name,
    class_name,
    status,
    created_by
  )
  values (
    v_session.id,
    v_attendance_date,
    v_session.session_type,
    v_session.subject,
    v_session.teacher_name,
    'siswa',
    v_nisn,
    v_person_name,
    v_student_class_name,
    case when v_session.session_type = 'school_arrival' then v_attendance_status else 'hadir' end,
    auth.uid()
  )
  on conflict (session_id, person_type, person_identifier) do nothing
  returning id into v_record_id;
  v_already_recorded := v_record_id is null;

  if v_already_recorded then
    select r.id
      into v_record_id
    from public.attendance_qr_records r
    where r.session_id = v_session.id
      and r.person_type = 'siswa'
      and r.person_identifier = v_nisn;
  end if;

  if v_session.session_type = 'school_arrival' then
    if not v_already_recorded then
      insert into public.attendance_records (
        attendance_date,
        person_type,
        person_identifier,
        person_name,
        class_name,
        status,
        note,
        created_by
      )
      values (
        v_attendance_date,
        'siswa',
        v_nisn,
        v_person_name,
        v_student_class_name,
        v_attendance_status,
        v_note,
        auth.uid()
      )
      on conflict (attendance_date, person_type, person_identifier)
        do update set
          status = case
            when public.attendance_records.status in ('hadir', 'terlambat', 'alpa')
              then excluded.status
            else public.attendance_records.status
          end,
          note = case
            when public.attendance_records.status in ('hadir', 'terlambat', 'alpa')
              then excluded.note
            else public.attendance_records.note
          end;
    end if;
  end if;

  return query
    select v_session.session_type, v_session.subject, v_session.class_name,
      case
        when v_session.session_type = 'school_departure' then 'pulang'
        when v_session.session_type = 'school_arrival' then v_attendance_status
        else 'hadir'
      end,
      v_attendance_date, v_already_recorded, v_record_id;
end;
$function$;
