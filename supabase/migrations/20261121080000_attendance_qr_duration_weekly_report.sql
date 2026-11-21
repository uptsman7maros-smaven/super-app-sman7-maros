alter table public.attendance_schedule_settings
  add column if not exists arrival_qr_duration_minutes smallint not null default 240,
  add column if not exists departure_qr_duration_minutes smallint not null default 120;

alter table public.attendance_schedule_settings
  drop constraint if exists attendance_schedule_settings_arrival_qr_duration_check,
  drop constraint if exists attendance_schedule_settings_departure_qr_duration_check;

alter table public.attendance_schedule_settings
  add constraint attendance_schedule_settings_arrival_qr_duration_check
    check (arrival_qr_duration_minutes between 1 and 480),
  add constraint attendance_schedule_settings_departure_qr_duration_check
    check (departure_qr_duration_minutes between 1 and 480);

alter table public.attendance_qr_records
  add column if not exists note text,
  add column if not exists is_voided boolean not null default false;

alter table public.attendance_qr_records
  drop constraint if exists attendance_qr_records_status_check;

alter table public.attendance_qr_records
  add constraint attendance_qr_records_status_check
    check (status in ('hadir', 'terlambat', 'izin', 'sakit'));

create index if not exists attendance_records_student_created_retention_idx
  on public.attendance_records (created_at)
  where person_type = 'siswa';

create index if not exists attendance_qr_records_student_created_retention_idx
  on public.attendance_qr_records (created_at)
  where person_type = 'siswa';

drop function if exists public.submit_attendance_qr(text);

create or replace function public.submit_attendance_qr(
  p_token text,
  p_status text default 'hadir',
  p_note text default null
)
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
declare
  v_session public.attendance_qr_sessions%rowtype;
  v_settings public.attendance_schedule_settings%rowtype;
  v_nisn text;
  v_person_name text;
  v_student_class_name text;
  v_attendance_date date;
  v_local_time time;
  v_record_id uuid;
  v_existing_record_id uuid;
  v_already_recorded boolean := false;
  v_attendance_status text := 'hadir';
  v_existing_status text;
  v_note text;
begin
  if auth.uid() is null
    or not public.superapp_has_active_role(array['siswa']::text[]) then
    raise exception 'Hanya siswa dengan akun aktif yang dapat mengirim absensi QR.';
  end if;

  if p_status is null or p_status not in ('hadir', 'izin', 'sakit') then
    raise exception 'Status QR mata pelajaran harus Hadir, Izin, atau Sakit.';
  end if;
  if p_status in ('izin', 'sakit')
    and nullif(btrim(coalesce(p_note, '')), '') is null then
    raise exception 'Keterangan wajib diisi untuk status Izin atau Sakit.';
  end if;
  if length(coalesce(p_note, '')) > 240 then
    raise exception 'Keterangan absensi maksimal 240 karakter.';
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
    and s.attendance_date = v_attendance_date
  for update;

  if not found then
    raise exception 'QR tidak valid, belum berlaku, atau sudah kedaluwarsa. Minta QR terbaru kepada petugas/guru.';
  end if;

  if v_session.session_type <> 'subject' then
    raise exception 'QR kedatangan/kepulangan sekolah harus berupa QR pribadi siswa yang dipindai petugas.';
  end if;

  if v_session.session_type in ('school_arrival', 'school_departure') then
    if not exists (
      select 1
      from public.profiles creator
      where creator.id = v_session.created_by
        and creator.status = 'active'::public.account_status
        and creator.role::text in ('super_admin', 'operator')
    ) then
      raise exception 'QR pribadi siswa harus dipindai oleh petugas.';
    end if;
  elsif v_session.session_type = 'subject' then
    if not exists (
      select 1
      from public.profiles creator
      where creator.id = v_session.created_by
        and creator.status = 'active'::public.account_status
        and creator.role::text = 'guru'
    ) then
      raise exception 'Sesi QR mata pelajaran tidak lagi dimiliki guru aktif.';
    end if;
  else
    raise exception 'Jenis sesi QR tidak valid.';
  end if;

  if v_session.session_type = 'school_arrival' then
    if p_status <> 'hadir' then
      raise exception 'QR kedatangan hanya mencatat status Hadir atau Terlambat.';
    end if;
    if v_local_time < v_settings.arrival_start_time then
      raise exception 'QR kedatangan baru dapat dipindai mulai pukul % WITA.', to_char(v_settings.arrival_start_time, 'HH24:MI');
    end if;
    if v_local_time >= v_settings.arrival_absent_at
      or v_local_time >= v_settings.arrival_start_time
        + make_interval(mins => v_settings.arrival_qr_duration_minutes::integer) then
      raise exception 'Durasi QR kedatangan telah berakhir.';
    end if;
    if v_local_time > v_settings.arrival_ontime_until then
      v_attendance_status := 'terlambat';
      v_note := 'Kehadiran dicatat melalui QR kedatangan setelah batas waktu hadir.';
    else
      v_note := 'Kehadiran dicatat melalui QR kedatangan sekolah.';
    end if;
  elsif v_session.session_type = 'school_departure' then
    if p_status <> 'hadir' then
      raise exception 'QR kepulangan tidak menerima status Izin atau Sakit.';
    end if;
    if v_local_time < v_settings.departure_scan_from then
      raise exception 'QR kepulangan baru dapat dipindai mulai pukul % WITA.', to_char(v_settings.departure_scan_from, 'HH24:MI');
    end if;
    if v_local_time >= v_settings.departure_scan_from
      + make_interval(mins => v_settings.departure_qr_duration_minutes::integer) then
      raise exception 'Durasi QR kepulangan telah berakhir.';
    end if;
    v_note := 'Kepulangan dicatat melalui QR sekolah.';
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

  perform pg_advisory_xact_lock(hashtextextended(v_nisn || ':' || v_attendance_date::text, 0));
  select attendance.status::text
    into v_existing_status
  from public.attendance_records attendance
  where attendance.attendance_date = v_attendance_date
    and attendance.person_type = 'siswa'
    and attendance.person_identifier = v_nisn
  for update;

  if v_session.session_type = 'school_arrival'
    and v_existing_status in ('izin', 'sakit') then
    raise exception 'Absensi hari ini sudah berstatus %. QR kedatangan ditolak.', upper(v_existing_status);
  end if;
  if v_session.session_type = 'subject'
    and v_existing_status in ('izin', 'sakit')
    and p_status <> v_existing_status then
    raise exception 'Absensi hari ini sudah berstatus %. Status hadir tidak dapat menggantikannya.', upper(v_existing_status);
  end if;

  select record.id
    into v_existing_record_id
  from public.attendance_qr_records record
  where record.session_id = v_session.id
    and record.person_type = 'siswa'
    and record.person_identifier = v_nisn
  for update;
  v_already_recorded := found;

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
    note,
    is_voided,
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
    case
      when v_session.session_type = 'school_arrival' then v_attendance_status
      when v_session.session_type = 'subject' then p_status
      else 'hadir'
    end,
    case when v_session.session_type = 'subject'
      then nullif(btrim(coalesce(p_note, '')), '')
      else v_note
    end,
    false,
    auth.uid()
  )
  on conflict (session_id, person_type, person_identifier)
  do update set
    status = excluded.status,
    note = excluded.note,
    is_voided = false
  returning id into v_record_id;

  if v_session.session_type = 'school_arrival' then
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
      person_name = excluded.person_name,
      class_name = excluded.class_name,
      status = excluded.status,
      note = excluded.note;
  elsif v_session.session_type = 'subject' then
    if p_status in ('izin', 'sakit') then
      update public.attendance_qr_records arrival
      set status = p_status,
          note = nullif(btrim(coalesce(p_note, '')), ''),
          is_voided = true
      where arrival.attendance_date = v_attendance_date
        and arrival.person_type = 'siswa'
        and arrival.person_identifier = v_nisn
        and arrival.session_type = 'school_arrival'
        and not arrival.is_voided;
    end if;

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
      p_status,
      coalesce(
        nullif(btrim(coalesce(p_note, '')), ''),
        'QR mata pelajaran: ' || coalesce(v_session.subject, '—')
      ),
      auth.uid()
    )
    on conflict (attendance_date, person_type, person_identifier)
    do update set
      person_name = excluded.person_name,
      class_name = excluded.class_name,
      status = excluded.status,
      note = excluded.note;
  end if;

  return query
    select v_session.session_type, v_session.subject, v_session.class_name,
      case
        when v_session.session_type = 'school_departure' then 'pulang'
        when v_session.session_type = 'school_arrival' then v_attendance_status
        else p_status
      end,
      v_attendance_date, v_already_recorded, v_record_id;
end;
$function$;

revoke all on function public.submit_attendance_qr(text, text, text)
  from public, anon;
grant execute on function public.submit_attendance_qr(text, text, text)
  to authenticated;

create or replace function public.create_attendance_qr_session(
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
  v_now_local timestamp without time zone;
  v_session_date date;
begin
  if auth.uid() is null then
    raise exception 'Sesi login tidak tersedia.';
  end if;

  if p_session_type in ('school_arrival', 'school_departure') then
    raise exception 'QR sekolah bersama tidak tersedia. Gunakan QR pribadi siswa yang dipindai petugas.';
  elsif p_session_type is distinct from 'subject' then
    raise exception 'Jenis sesi QR tidak valid.';
  end if;

  v_now_local := now() at time zone 'Asia/Makassar';
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

  v_expires_at := now() + interval '10 minutes';

  v_token := gen_random_uuid()::text;
  v_token_expires_at := v_expires_at;

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

create or replace function public.get_my_attendance_student_qrs()
returns table (
  session_type text,
  token text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_student_id uuid;
  v_nisn text;
  v_session_type text;
  v_local_now timestamp without time zone;
  v_local_date date;
  v_local_time time;
  v_window_start timestamp without time zone;
  v_window_end timestamp without time zone;
  v_expires_at timestamptz;
  v_token text;
  v_settings public.attendance_schedule_settings%rowtype;
begin
  if auth.uid() is null
    or not public.superapp_has_active_role(array['siswa']::text[]) then
    raise exception 'QR sekolah pribadi hanya tersedia untuk siswa dengan akun aktif.';
  end if;

  select student.id, btrim(student.nisn)
    into v_student_id, v_nisn
  from public.profiles profile
  join public.students student on btrim(student.nisn) = btrim(profile.username)
  where profile.id = auth.uid()
    and profile.status = 'active'::public.account_status
    and profile.role::text = 'siswa'
    and student.status = 'Active'
  limit 1;
  if v_student_id is null or nullif(v_nisn, '') is null then
    raise exception 'Data siswa aktif untuk akun ini tidak ditemukan di Data Induk.';
  end if;

  v_local_now := now() at time zone 'Asia/Makassar';
  v_local_date := v_local_now::date;
  v_local_time := v_local_now::time;
  if not public.attendance_is_school_day(v_local_date) then
    return;
  end if;

  select *
    into strict v_settings
  from public.attendance_schedule_settings
  where id = 1;

  for v_session_type in
    select unnest(array['school_arrival', 'school_departure']::text[])
  loop
    if v_session_type = 'school_arrival' then
      v_window_start := v_local_date + v_settings.arrival_start_time;
      v_window_end := least(
        v_window_start + make_interval(mins => v_settings.arrival_qr_duration_minutes::integer),
        v_local_date + v_settings.arrival_absent_at
      );
    else
      v_window_start := v_local_date + v_settings.departure_scan_from;
      v_window_end := v_window_start
        + make_interval(mins => v_settings.departure_qr_duration_minutes::integer);
    end if;

    if v_local_now < v_window_start or v_local_now >= v_window_end then
      continue;
    end if;

    perform pg_advisory_xact_lock(
      hashtextextended(v_nisn || ':' || v_local_date::text || ':' || v_session_type, 0)
    );

    if v_session_type = 'school_arrival' and exists (
      select 1
      from public.attendance_records attendance
      where attendance.attendance_date = v_local_date
        and attendance.person_type = 'siswa'
        and attendance.person_identifier = v_nisn
        and attendance.status::text in ('hadir', 'terlambat', 'izin', 'sakit')
    ) then
      continue;
    end if;
    if v_session_type = 'school_departure' and exists (
      select 1
      from public.attendance_qr_records attendance
      where attendance.attendance_date = v_local_date
        and attendance.person_type = 'siswa'
        and attendance.person_identifier = v_nisn
        and attendance.session_type = 'school_departure'
        and not attendance.is_voided
    ) then
      continue;
    end if;

    select session.token, session.expires_at
      into v_token, v_expires_at
    from public.attendance_qr_sessions session
    where session.created_by = auth.uid()
      and session.session_type = v_session_type
      and session.attendance_date = v_local_date
      and session.is_active
      and session.expires_at = v_window_end at time zone 'Asia/Makassar'
      and session.expires_at > now()
      and session.token_expires_at > now()
    order by session.created_at desc
    limit 1;

    if v_token is null then
      update public.attendance_qr_sessions session
      set is_active = false
      where session.created_by = auth.uid()
        and session.session_type = v_session_type
        and session.attendance_date = v_local_date
        and session.is_active;

      v_expires_at := v_window_end at time zone 'Asia/Makassar';
      v_token := gen_random_uuid()::text;
      insert into public.attendance_qr_sessions (
        token,
        session_type,
        created_by,
        expires_at,
        token_expires_at,
        attendance_date
      )
      values (
        v_token,
        v_session_type,
        auth.uid(),
        v_expires_at,
        v_expires_at,
        v_local_date
      );
    end if;

    return query select v_session_type, v_token, v_expires_at;
  end loop;
end;
$function$;

revoke all on function public.get_my_attendance_student_qrs()
  from public, anon;
grant execute on function public.get_my_attendance_student_qrs()
  to authenticated;

create or replace function public.resolve_attendance_student_qr(p_token text)
returns table (
  person_identifier text,
  person_name text,
  class_name text,
  session_type text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if auth.uid() is null
    or not public.superapp_has_active_role(array['super_admin', 'operator']::text[]) then
    raise exception 'Hanya admin atau operator aktif yang dapat memverifikasi QR pribadi siswa.';
  end if;

  return query
    select btrim(student.nisn)::text,
      student.full_name::text,
      class.name::text,
      session.session_type::text,
      session.expires_at
    from public.attendance_qr_sessions session
    join public.profiles student_profile
      on student_profile.id = session.created_by
      and student_profile.status = 'active'::public.account_status
      and student_profile.role::text = 'siswa'
    join public.students student
      on btrim(student.nisn) = btrim(student_profile.username)
      and student.status = 'Active'
    left join public.classes class on class.id = student.class_id
    where session.token = btrim(p_token)
      and session.session_type in ('school_arrival', 'school_departure')
      and session.is_active
      and session.expires_at > now()
      and session.token_expires_at > now()
      and session.attendance_date = (now() at time zone 'Asia/Makassar')::date;

  if not found then
    raise exception 'QR pribadi tidak valid, sudah dipakai, atau kedaluwarsa.';
  end if;
end;
$function$;

revoke all on function public.resolve_attendance_student_qr(text)
  from public, anon;
grant execute on function public.resolve_attendance_student_qr(text)
  to authenticated;

create or replace function public.submit_attendance_student_qr(p_token text)
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
declare
  v_session public.attendance_qr_sessions%rowtype;
  v_settings public.attendance_schedule_settings%rowtype;
  v_student_id uuid;
  v_nisn text;
  v_person_name text;
  v_class_name text;
  v_attendance_date date;
  v_local_time time;
  v_attendance_status text;
  v_note text;
  v_record_id uuid;
begin
  if auth.uid() is null
    or not public.superapp_has_active_role(array['super_admin', 'operator']::text[]) then
    raise exception 'Hanya admin atau operator aktif yang dapat menyimpan QR pribadi siswa.';
  end if;

  v_attendance_date := (now() at time zone 'Asia/Makassar')::date;
  v_local_time := (now() at time zone 'Asia/Makassar')::time;
  if not public.attendance_is_school_day(v_attendance_date) then
    raise exception 'QR sekolah tidak berlaku pada hari libur atau akhir pekan.';
  end if;

  select *
    into strict v_settings
  from public.attendance_schedule_settings
  where id = 1;

  select session.*
    into v_session
  from public.attendance_qr_sessions session
  join public.profiles student_profile
    on student_profile.id = session.created_by
    and student_profile.status = 'active'::public.account_status
    and student_profile.role::text = 'siswa'
  where session.token = btrim(p_token)
    and session.session_type in ('school_arrival', 'school_departure')
    and session.is_active
    and session.expires_at > now()
    and session.token_expires_at > now()
    and session.attendance_date = v_attendance_date
  for update of session;
  if not found then
    raise exception 'QR pribadi tidak valid, sudah dipakai, atau kedaluwarsa.';
  end if;

  select student.id, btrim(student.nisn), student.full_name, class.name
    into v_student_id, v_nisn, v_person_name, v_class_name
  from public.profiles profile
  join public.students student on btrim(student.nisn) = btrim(profile.username)
  left join public.classes class on class.id = student.class_id
  where profile.id = v_session.created_by
    and profile.status = 'active'::public.account_status
    and profile.role::text = 'siswa'
    and student.status = 'Active'
  limit 1;
  if v_student_id is null then
    raise exception 'Data siswa pada QR ini tidak lagi aktif atau tidak ditemukan.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_nisn || ':' || v_attendance_date::text, 0));

  if v_session.session_type = 'school_arrival' then
    if v_local_time < v_settings.arrival_start_time
      or v_local_time >= v_settings.arrival_absent_at
      or v_local_time >= v_settings.arrival_start_time
        + make_interval(mins => v_settings.arrival_qr_duration_minutes::integer) then
      raise exception 'QR kedatangan berada di luar jadwal atau durasi aktif.';
    end if;
    if exists (
      select 1
      from public.attendance_records attendance
      where attendance.attendance_date = v_attendance_date
        and attendance.person_type = 'siswa'
        and attendance.person_identifier = v_nisn
        and attendance.status::text in ('izin', 'sakit')
    ) then
      raise exception 'Absensi hari ini sudah berstatus Izin atau Sakit. QR kedatangan ditolak.';
    end if;
    v_attendance_status := case
      when v_local_time > v_settings.arrival_ontime_until then 'terlambat'
      else 'hadir'
    end;
    v_note := case
      when v_attendance_status = 'terlambat'
        then 'Kehadiran dicatat melalui QR pribadi setelah batas waktu hadir.'
      else 'Kehadiran dicatat melalui QR pribadi siswa.'
    end;
  else
    if v_local_time < v_settings.departure_scan_from
      or v_local_time >= v_settings.departure_scan_from
        + make_interval(mins => v_settings.departure_qr_duration_minutes::integer) then
      raise exception 'QR kepulangan berada di luar jadwal atau durasi aktif.';
    end if;
    v_attendance_status := 'pulang';
    v_note := 'Kepulangan dicatat melalui QR pribadi siswa.';
  end if;

  update public.attendance_qr_sessions
  set is_active = false
  where id = v_session.id
    and is_active;
  if not found then
    raise exception 'QR pribadi sudah dipakai. Muat ulang halaman siswa untuk mendapatkan QR baru.';
  end if;

  insert into public.attendance_qr_records (
    session_id,
    attendance_date,
    session_type,
    person_type,
    person_identifier,
    person_name,
    class_name,
    status,
    note,
    is_voided,
    created_by
  )
  values (
    v_session.id,
    v_attendance_date,
    v_session.session_type,
    'siswa',
    v_nisn,
    v_person_name,
    v_class_name,
    case when v_session.session_type = 'school_arrival' then v_attendance_status else 'hadir' end,
    v_note,
    false,
    auth.uid()
  )
  returning id into v_record_id;

  if v_session.session_type = 'school_arrival' then
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
      v_class_name,
      v_attendance_status,
      v_note,
      auth.uid()
    )
    on conflict (attendance_date, person_type, person_identifier)
    do update set
      person_name = excluded.person_name,
      class_name = excluded.class_name,
      status = excluded.status,
      note = excluded.note;
  end if;

  return query
    select v_session.session_type, null::text, v_class_name,
      v_attendance_status, v_attendance_date, false, v_record_id;
end;
$function$;

revoke all on function public.submit_attendance_student_qr(text)
  from public, anon;
grant execute on function public.submit_attendance_student_qr(text)
  to authenticated;

create or replace function public.attendance_teacher_owns_class(p_class_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.profiles profile
    join public.teachers teacher
      on teacher.profile_id = profile.id
      or (
        teacher.profile_id is null
        and btrim(teacher.nip) = btrim(profile.username)
      )
    join public.classes class
      on class.id = p_class_id
     and class.homeroom_teacher_id is not null
     and (
       class.homeroom_teacher_id = teacher.id
       or (
         teacher.profile_id is not null
         and class.homeroom_teacher_id = teacher.profile_id
       )
     )
    where profile.id = auth.uid()
      and profile.status = 'active'::public.account_status
      and profile.role::text in ('guru', 'guru_bk')
  );
$function$;

revoke all on function public.attendance_teacher_owns_class(uuid)
  from public, anon;
grant execute on function public.attendance_teacher_owns_class(uuid)
  to authenticated;

create or replace function public.attendance_teacher_owns_student(
  p_class_id uuid,
  p_person_identifier text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.students student
    where btrim(student.nisn) = btrim(p_person_identifier)
      and public.attendance_teacher_owns_class(coalesce(p_class_id, student.class_id))
  );
$function$;

revoke all on function public.attendance_teacher_owns_student(uuid, text)
  from public, anon;
grant execute on function public.attendance_teacher_owns_student(uuid, text)
  to authenticated;

drop policy if exists students_homeroom_teacher_read on public.students;
create policy students_homeroom_teacher_read on public.students
  for select to authenticated
  using (public.attendance_teacher_owns_class(class_id));

drop policy if exists attendance_records_homeroom_teacher_read on public.attendance_records;
create policy attendance_records_homeroom_teacher_read on public.attendance_records
  for select to authenticated
  using (
    person_type = 'siswa'
    and public.attendance_teacher_owns_student(class_id, person_identifier)
  );

drop policy if exists attendance_qr_records_homeroom_teacher_read on public.attendance_qr_records;
create policy attendance_qr_records_homeroom_teacher_read on public.attendance_qr_records
  for select to authenticated
  using (
    person_type = 'siswa'
    and public.attendance_teacher_owns_student(class_id, person_identifier)
  );

create or replace function public.get_my_homeroom_weekly_attendance()
returns table (
  class_id uuid,
  class_name text,
  grade_level integer,
  attendance_date date,
  student_id uuid,
  person_identifier text,
  person_name text,
  status text,
  note text
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
    raise exception 'Rekap kelas perwalian hanya tersedia untuk guru aktif.';
  end if;

  select *
    into strict v_settings
  from public.attendance_schedule_settings
  where id = 1;

  return query
    with school_days as (
      select generated.day_value::date as school_date
      from generate_series(
        (v_today - 5)::timestamp,
        v_today::timestamp,
        interval '1 day'
      ) as generated(day_value)
      where public.attendance_is_school_day(generated.day_value::date)
    )
    select class.id,
      class.name::text,
      class.grade_level,
      school_days.school_date,
      student.id,
      btrim(student.nisn)::text,
      student.full_name::text,
      coalesce(
        attendance.status::text,
        case
          when school_days.school_date < v_today
            or v_local_time >= v_settings.arrival_absent_at
            then 'alpa'
          else 'belum_tercatat'
        end
      ),
      attendance.note::text
    from public.classes class
    join public.students student
      on student.class_id = class.id
     and student.status = 'Active'
    cross join school_days
    left join lateral (
      select record.status, record.note
      from public.attendance_records record
      where record.attendance_date = school_days.school_date
        and record.person_type = 'siswa'
        and record.person_identifier = btrim(student.nisn)
        and record.created_at >= now() - interval '6 days'
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
    where public.attendance_teacher_owns_class(class.id)
    order by class.name, school_days.school_date, student.full_name;
end;
$function$;

revoke all on function public.get_my_homeroom_weekly_attendance()
  from public, anon;
grant execute on function public.get_my_homeroom_weekly_attendance()
  to authenticated;

create table if not exists public.attendance_weekly_report_templates (
  id smallint primary key default 1 check (id = 1),
  html_template text not null,
  source_file_name text not null default 'Editor HTML',
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  constraint attendance_weekly_report_template_size_check
    check (length(html_template) <= 200000)
);

insert into public.attendance_weekly_report_templates (
  id,
  html_template,
  source_file_name
)
values (
  1,
  '<h1>Rekap Mingguan Kehadiran</h1><p>Kelas: {{nama_kelas}}</p><p>Wali kelas: {{wali_kelas}} · NIP: {{nip_wali_kelas}}</p><p>Periode: {{periode_minggu}}</p>{{tabel_kehadiran}}<p>Tanggal unduh: {{tanggal_unduh}}</p>',
  'Template bawaan'
)
on conflict (id) do nothing;

alter table public.attendance_weekly_report_templates enable row level security;
revoke all on public.attendance_weekly_report_templates from public, anon, authenticated;
grant select, insert, update on public.attendance_weekly_report_templates to authenticated;
grant all on public.attendance_weekly_report_templates to service_role;

drop policy if exists attendance_weekly_report_template_read on public.attendance_weekly_report_templates;
create policy attendance_weekly_report_template_read
  on public.attendance_weekly_report_templates
  for select to authenticated
  using (true);

drop policy if exists attendance_weekly_report_template_admin_write on public.attendance_weekly_report_templates;
create policy attendance_weekly_report_template_admin_write
  on public.attendance_weekly_report_templates
  for all to authenticated
  using (public.superapp_has_active_role(array['super_admin', 'operator']::text[]))
  with check (public.superapp_has_active_role(array['super_admin', 'operator']::text[]));

create or replace function public.prune_expired_student_attendance()
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_cutoff timestamptz := now() - interval '6 days';
begin
  delete from public.attendance_qr_records record
  where record.person_type = 'siswa'
    and record.created_at < v_cutoff;

  delete from public.attendance_records record
  where record.person_type = 'siswa'
    and record.created_at < v_cutoff;

  delete from public.attendance_qr_sessions session
  where session.created_at < v_cutoff
    and not session.is_active;
end;
$function$;

revoke all on function public.prune_expired_student_attendance()
  from public, anon, authenticated;
grant execute on function public.prune_expired_student_attendance()
  to service_role;

create extension if not exists pg_cron with schema pg_catalog;

do $migration$
declare
  v_job_id bigint;
begin
  select jobid
    into v_job_id
  from cron.job
  where jobname = 'attendance-student-history-retention';

  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;

  perform cron.schedule(
    'attendance-student-history-retention',
    '*/15 * * * *',
    'select public.prune_expired_student_attendance();'
  );
end;
$migration$;

notify pgrst, 'reload schema';
