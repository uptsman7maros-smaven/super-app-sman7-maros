create table if not exists public.attendance_schedule_settings (
  id smallint primary key default 1 check (id = 1),
  automation_enabled boolean not null default false,
  arrival_start_time time not null default '06:00',
  arrival_ontime_until time not null default '07:30',
  arrival_absent_at time not null default '10:00',
  departure_scan_from time not null default '15:40',
  bk_alert_at time not null default '16:00',
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  constraint attendance_schedule_settings_arrival_order
    check (arrival_start_time < arrival_ontime_until and arrival_ontime_until < arrival_absent_at),
  constraint attendance_schedule_settings_alert_order
    check (bk_alert_at >= arrival_absent_at and bk_alert_at >= departure_scan_from)
);

insert into public.attendance_schedule_settings (id)
values (1)
on conflict (id) do nothing;

create table if not exists public.attendance_school_closures (
  school_date date primary key,
  description text not null default '',
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

create table if not exists public.attendance_bk_assignments (
  student_id uuid primary key references public.students(id) on delete cascade,
  counselor_profile_id uuid not null references public.profiles(id) on delete restrict,
  assigned_at timestamptz not null default now(),
  assigned_by uuid references auth.users(id) on delete set null
);

create table if not exists public.attendance_bk_alerts (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  counselor_profile_id uuid not null references public.profiles(id) on delete cascade,
  attendance_date date not null,
  student_name text not null,
  student_identifier text not null,
  class_name text,
  title text not null,
  body text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now(),
  constraint attendance_bk_alerts_student_date_key unique (student_id, attendance_date)
);

create index if not exists attendance_bk_alerts_counselor_date_idx
  on public.attendance_bk_alerts (counselor_profile_id, attendance_date desc);

alter table public.attendance_qr_sessions
  add column if not exists attendance_date date;

update public.attendance_qr_sessions
set attendance_date = (created_at at time zone 'Asia/Makassar')::date
where attendance_date is null;

alter table public.attendance_qr_sessions
  alter column attendance_date set not null,
  alter column expires_at drop not null;

alter table public.attendance_qr_records
  drop constraint if exists attendance_qr_records_status_check;

alter table public.attendance_qr_records
  add constraint attendance_qr_records_status_check
  check (status in ('hadir', 'terlambat'));

alter table public.attendance_records
  alter column created_by drop not null;

update public.attendance_qr_sessions
set is_active = false
where is_active
  and session_type in ('school_arrival', 'school_departure');

alter table public.attendance_schedule_settings enable row level security;
alter table public.attendance_school_closures enable row level security;
alter table public.attendance_bk_assignments enable row level security;
alter table public.attendance_bk_alerts enable row level security;

revoke all on public.attendance_schedule_settings from public, anon, authenticated;
revoke all on public.attendance_school_closures from public, anon, authenticated;
revoke all on public.attendance_bk_assignments from public, anon, authenticated;
revoke all on public.attendance_bk_alerts from public, anon, authenticated;

grant select, insert, update on public.attendance_schedule_settings to authenticated;
grant select, insert, delete on public.attendance_school_closures to authenticated;
grant select, insert, update, delete on public.attendance_bk_assignments to authenticated;
grant select on public.attendance_bk_alerts to authenticated;
grant update (is_read) on public.attendance_bk_alerts to authenticated;
grant all on public.attendance_schedule_settings to service_role;
grant all on public.attendance_school_closures to service_role;
grant all on public.attendance_bk_assignments to service_role;
grant all on public.attendance_bk_alerts to service_role;

drop policy if exists attendance_schedule_settings_admin_access on public.attendance_schedule_settings;
create policy attendance_schedule_settings_admin_access
  on public.attendance_schedule_settings
  for all to authenticated
  using (public.superapp_has_active_role(array['super_admin', 'operator']::text[]))
  with check (public.superapp_has_active_role(array['super_admin', 'operator']::text[]));

drop policy if exists attendance_school_closures_admin_access on public.attendance_school_closures;
create policy attendance_school_closures_admin_access
  on public.attendance_school_closures
  for all to authenticated
  using (public.superapp_has_active_role(array['super_admin', 'operator']::text[]))
  with check (public.superapp_has_active_role(array['super_admin', 'operator']::text[]));

drop policy if exists attendance_bk_assignments_read_scope on public.attendance_bk_assignments;
create policy attendance_bk_assignments_read_scope
  on public.attendance_bk_assignments
  for select to authenticated
  using (
    public.superapp_has_active_role(array['super_admin', 'operator']::text[])
    or (
      counselor_profile_id = auth.uid()
      and public.superapp_has_active_role(array['guru_bk']::text[])
    )
  );

drop policy if exists attendance_bk_assignments_admin_write on public.attendance_bk_assignments;
create policy attendance_bk_assignments_admin_write
  on public.attendance_bk_assignments
  for all to authenticated
  using (public.superapp_has_active_role(array['super_admin', 'operator']::text[]))
  with check (
    public.superapp_has_active_role(array['super_admin', 'operator']::text[])
    and exists (
      select 1
      from public.profiles counselor
      where counselor.id = counselor_profile_id
        and counselor.status = 'active'::public.account_status
        and counselor.role::text = 'guru_bk'
    )
  );

drop policy if exists attendance_bk_alerts_read_scope on public.attendance_bk_alerts;
create policy attendance_bk_alerts_read_scope
  on public.attendance_bk_alerts
  for select to authenticated
  using (
    public.superapp_has_active_role(array['super_admin', 'operator']::text[])
    or (
      counselor_profile_id = auth.uid()
      and public.superapp_has_active_role(array['guru_bk']::text[])
    )
  );

drop policy if exists attendance_bk_alerts_update_scope on public.attendance_bk_alerts;
create policy attendance_bk_alerts_update_scope
  on public.attendance_bk_alerts
  for update to authenticated
  using (
    public.superapp_has_active_role(array['super_admin', 'operator']::text[])
    or (
      counselor_profile_id = auth.uid()
      and public.superapp_has_active_role(array['guru_bk']::text[])
    )
  )
  with check (
    public.superapp_has_active_role(array['super_admin', 'operator']::text[])
    or (
      counselor_profile_id = auth.uid()
      and public.superapp_has_active_role(array['guru_bk']::text[])
    )
  );

create or replace function public.attendance_is_school_day(p_school_date date)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select extract(isodow from p_school_date) between 1 and 5
    and not exists (
      select 1
      from public.attendance_school_closures closure
      where closure.school_date = p_school_date
    );
$function$;

create or replace function public.attendance_next_school_day(p_start_date date)
returns date
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_day date;
  v_offset integer;
begin
  for v_offset in 0..30 loop
    v_day := p_start_date + v_offset;
    if public.attendance_is_school_day(v_day) then
      return v_day;
    end if;
  end loop;

  raise exception 'Tidak ditemukan hari sekolah dalam 30 hari setelah tanggal %.', p_start_date;
end;
$function$;

create or replace function public.attendance_sync_active_arrival_expiry()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  update public.attendance_qr_sessions
    set expires_at = (attendance_date + new.arrival_absent_at) at time zone 'Asia/Makassar'
    where session_type = 'school_arrival'
      and is_active
      and attendance_date >= (now() at time zone 'Asia/Makassar')::date;
  return new;
end;
$function$;

drop trigger if exists attendance_sync_active_arrival_expiry
  on public.attendance_schedule_settings;
create trigger attendance_sync_active_arrival_expiry
  after update of arrival_absent_at on public.attendance_schedule_settings
  for each row
  when (old.arrival_absent_at is distinct from new.arrival_absent_at)
  execute function public.attendance_sync_active_arrival_expiry();

create or replace function public.attendance_cleanup_school_closure()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  update public.attendance_qr_sessions
    set is_active = false
    where attendance_date = new.school_date
      and is_active;

  delete from public.attendance_records
  where attendance_date = new.school_date
    and person_type = 'siswa'
    and created_by is null
    and note like 'Alpa otomatis:%';

  delete from public.attendance_bk_alerts
  where attendance_date = new.school_date;

  return new;
end;
$function$;

drop trigger if exists attendance_cleanup_school_closure
  on public.attendance_school_closures;
create trigger attendance_cleanup_school_closure
  after insert on public.attendance_school_closures
  for each row
  execute function public.attendance_cleanup_school_closure();

drop function if exists public.create_attendance_qr_session(text, text, text);
create function public.create_attendance_qr_session(
  p_session_type text,
  p_subject text default null,
  p_class_name text default null
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
  v_teacher_name text;
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

    select c.name
      into v_class_name
    from public.classes c
    where lower(btrim(c.name)) = lower(btrim(coalesce(p_class_name, '')))
    order by c.name
    limit 1;

    if v_class_name is null then
      raise exception 'Kelas tidak ditemukan. Gunakan nama kelas yang terdaftar di Data Induk.';
    end if;

    select t.full_name
      into v_teacher_name
    from public.profiles p
    join public.teachers t
      on t.profile_id = p.id
      or (
        t.profile_id is null
        and btrim(t.nip) = btrim(p.username)
      )
    where p.id = auth.uid()
      and p.status = 'active'::public.account_status
      and p.role::text = 'guru'
    order by (t.profile_id = p.id) desc nulls last
    limit 1;

    if v_teacher_name is null then
      raise exception 'Akun guru belum tertaut ke Data Induk.';
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

create or replace function public.refresh_attendance_qr_session(p_session_id uuid)
returns table (token text, expires_at timestamptz, token_expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_token text;
  v_expires_at timestamptz;
  v_token_expires_at timestamptz;
  v_today date := (now() at time zone 'Asia/Makassar')::date;
begin
  v_token := gen_random_uuid()::text;
  v_token_expires_at := now() + interval '90 seconds';

  update public.attendance_qr_sessions s
    set token = v_token,
        token_expires_at = v_token_expires_at
    where s.id = p_session_id
      and s.created_by = auth.uid()
      and s.is_active
      and (s.expires_at is null or s.expires_at > now())
      and s.attendance_date >= v_today
      and public.attendance_is_school_day(s.attendance_date)
  returning s.expires_at into v_expires_at;

  if not found then
    raise exception 'Sesi QR sudah berakhir atau tidak dapat diakses.';
  end if;

  return query select v_token, v_expires_at, v_token_expires_at;
end;
$function$;

drop function if exists public.submit_attendance_qr(text);
create function public.submit_attendance_qr(p_token text)
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

create or replace function public.process_attendance_daily_automation()
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_settings public.attendance_schedule_settings%rowtype;
  v_local_now timestamp without time zone := now() at time zone 'Asia/Makassar';
  v_attendance_date date := (now() at time zone 'Asia/Makassar')::date;
begin
  select *
    into v_settings
  from public.attendance_schedule_settings
  where id = 1;

  if not found or not v_settings.automation_enabled
    or not public.attendance_is_school_day(v_attendance_date) then
    return;
  end if;

  if v_local_now::time >= v_settings.arrival_absent_at then
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
    select
      v_attendance_date,
      'siswa',
      btrim(st.nisn),
      st.full_name,
      class.name,
      'alpa',
      'Alpa otomatis: QR kedatangan tidak dipindai sampai batas ' ||
        to_char(v_settings.arrival_absent_at, 'HH24:MI') || ' WITA.',
      null
    from public.students st
    left join public.classes class on class.id = st.class_id
    where st.status = 'Active'
      and not exists (
        select 1
        from public.attendance_records attendance
        where attendance.attendance_date = v_attendance_date
          and attendance.person_type = 'siswa'
          and attendance.person_identifier = btrim(st.nisn)
      )
    on conflict (attendance_date, person_type, person_identifier) do nothing;
  end if;

  if v_local_now::time >= v_settings.bk_alert_at then
    insert into public.attendance_bk_alerts (
      student_id,
      counselor_profile_id,
      attendance_date,
      student_name,
      student_identifier,
      class_name,
      title,
      body
    )
    select
      st.id,
      assignment.counselor_profile_id,
      v_attendance_date,
      st.full_name,
      btrim(st.nisn),
      class.name,
      'Peringatan absensi harian',
      st.full_name || ' (NISN ' || btrim(st.nisn) || ')' ||
        case when class.name is not null then ' dari kelas ' || class.name else '' end ||
        ' tidak memiliki catatan QR kedatangan, kepulangan, maupun mata pelajaran pada ' ||
        to_char(v_attendance_date, 'DD Mon YYYY') || '.'
    from public.students st
    join public.attendance_bk_assignments assignment on assignment.student_id = st.id
    join public.profiles counselor
      on counselor.id = assignment.counselor_profile_id
      and counselor.status = 'active'::public.account_status
      and counselor.role::text = 'guru_bk'
    left join public.classes class on class.id = st.class_id
    where st.status = 'Active'
      and not exists (
        select 1
        from public.attendance_qr_records qr_record
        where qr_record.attendance_date = v_attendance_date
          and qr_record.person_type = 'siswa'
          and qr_record.person_identifier = btrim(st.nisn)
          and qr_record.session_type in ('school_arrival', 'school_departure', 'subject')
      )
    on conflict (student_id, attendance_date)
      do update set
        counselor_profile_id = excluded.counselor_profile_id,
        is_read = false
      where public.attendance_bk_alerts.counselor_profile_id
        is distinct from excluded.counselor_profile_id;
  end if;
end;
$function$;

revoke all on function public.attendance_is_school_day(date) from public, anon;
revoke all on function public.attendance_next_school_day(date) from public, anon;
revoke all on function public.process_attendance_daily_automation() from public, anon, authenticated;
grant execute on function public.attendance_is_school_day(date) to authenticated, service_role;
grant execute on function public.attendance_next_school_day(date) to authenticated, service_role;
grant execute on function public.process_attendance_daily_automation() to service_role;
grant execute on function public.create_attendance_qr_session(text, text, text) to authenticated;
grant execute on function public.refresh_attendance_qr_session(uuid) to authenticated;
grant execute on function public.submit_attendance_qr(text) to authenticated;

create extension if not exists pg_cron with schema pg_catalog;

do $cron$
declare
  v_job_id bigint;
begin
  select jobid
    into v_job_id
  from cron.job
  where jobname = 'attendance-daily-automation';

  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;

  perform cron.schedule(
    'attendance-daily-automation',
    '* * * * *',
    'select public.process_attendance_daily_automation();'
  );
end;
$cron$;

notify pgrst, 'reload schema';
