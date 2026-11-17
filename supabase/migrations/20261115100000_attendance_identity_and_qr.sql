create or replace function public.get_my_attendance_identity()
returns table (
  person_type text,
  person_identifier text,
  person_name text
)
language sql
stable
security definer
set search_path = ''
as $function$
  select
    'siswa'::text,
    btrim(s.nisn)::text,
    s.full_name::text
  from public.profiles p
  join public.students s on btrim(s.nisn) = btrim(p.username)
  where p.id = auth.uid()
    and p.status = 'active'::public.account_status
    and p.role::text = 'siswa'

  union all

  select
    'guru_tendik'::text,
    btrim(t.nip)::text,
    t.full_name::text
  from public.profiles p
  join public.teachers t
    on t.profile_id = p.id
    or (
      t.profile_id is null
      and btrim(p.username) = btrim(t.nip)
      and p.role::text in ('guru', 'tendik')
    )
  where p.id = auth.uid()
    and p.status = 'active'::public.account_status
    and p.role::text in ('guru', 'tendik');
$function$;

revoke all on function public.get_my_attendance_identity() from public, anon, authenticated;
grant execute on function public.get_my_attendance_identity() to authenticated;

create or replace function public.superapp_has_active_role(_roles text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.status = 'active'::public.account_status
      and p.role::text = any(_roles)
  );
$function$;

revoke all on function public.superapp_has_active_role(text[]) from public, anon, authenticated;
grant execute on function public.superapp_has_active_role(text[]) to authenticated;

drop policy if exists attendance_insert_authorized on public.attendance_records;
create policy attendance_insert_authorized on public.attendance_records
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and (
      public.has_active_role(ARRAY[
        'super_admin'::public.app_role,
        'operator'::public.app_role
      ])
      or (
        person_type = 'guru_tendik'
        and exists (
          select 1
          from public.get_my_attendance_identity() as current_identity
          where current_identity.person_type = 'guru_tendik'
            and current_identity.person_identifier = attendance_records.person_identifier
        )
        and attendance_date = (now() at time zone 'Asia/Makassar')::date
      )
    )
  );

drop policy if exists attendance_update_authorized on public.attendance_records;
create policy attendance_update_authorized on public.attendance_records
  for update to authenticated
  using (
    public.has_active_role(ARRAY[
      'super_admin'::public.app_role,
      'operator'::public.app_role
    ])
    or (
      person_type = 'guru_tendik'
      and exists (
        select 1
        from public.get_my_attendance_identity() as current_identity
        where current_identity.person_type = 'guru_tendik'
          and current_identity.person_identifier = attendance_records.person_identifier
      )
      and attendance_date = (now() at time zone 'Asia/Makassar')::date
    )
  )
  with check (
    public.has_active_role(ARRAY[
      'super_admin'::public.app_role,
      'operator'::public.app_role
    ])
    or (
      person_type = 'guru_tendik'
      and exists (
        select 1
        from public.get_my_attendance_identity() as current_identity
        where current_identity.person_type = 'guru_tendik'
          and current_identity.person_identifier = attendance_records.person_identifier
      )
      and attendance_date = (now() at time zone 'Asia/Makassar')::date
    )
  );

create table if not exists public.attendance_qr_sessions (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  session_type text not null check (session_type in ('school_arrival', 'school_departure', 'subject')),
  subject text,
  class_name text,
  teacher_name text,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  token_expires_at timestamptz not null,
  is_active boolean not null default true
);

create table if not exists public.attendance_qr_records (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.attendance_qr_sessions(id) on delete cascade,
  attendance_date date not null,
  session_type text not null check (session_type in ('school_arrival', 'school_departure', 'subject')),
  subject text,
  teacher_name text,
  person_type text not null check (person_type = 'siswa'),
  person_identifier text not null,
  person_name text not null,
  class_name text,
  status text not null default 'hadir' check (status = 'hadir'),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint attendance_qr_records_session_person_key
    unique (session_id, person_type, person_identifier)
);

alter table public.attendance_qr_sessions
  drop constraint if exists attendance_qr_sessions_session_type_check;
alter table public.attendance_qr_sessions
  add constraint attendance_qr_sessions_session_type_check
  check (session_type in ('school_arrival', 'school_departure', 'subject'));

alter table public.attendance_qr_records
  drop constraint if exists attendance_qr_records_session_type_check;
alter table public.attendance_qr_records
  add constraint attendance_qr_records_session_type_check
  check (session_type in ('school_arrival', 'school_departure', 'subject'));

create index if not exists attendance_qr_records_date_idx
  on public.attendance_qr_records (attendance_date, created_at desc);

create table if not exists public.attendance_qr_whatsapp_logs (
  id uuid primary key default gen_random_uuid(),
  attendance_qr_record_id uuid not null unique
    references public.attendance_qr_records(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  attendance_date date not null,
  event_type text not null check (event_type in ('school_arrival', 'school_departure')),
  phone text not null,
  message text not null,
  status text not null check (status in ('sent', 'failed')),
  provider_response jsonb,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  constraint attendance_qr_whatsapp_logs_student_event_key
    unique (student_id, attendance_date, event_type)
);

do $migration$
begin
  if to_regclass('public.attendance_notification_settings') is not null then
    execute $sql$
      alter table public.attendance_notification_settings
        alter column message_template set default
        'Assalamu’alaikum Bapak/Ibu,

Kami informasikan bahwa putra/putri Bapak/Ibu, *{nama}*, tercatat *{status}* pada *{tanggal} pukul {jam}*.

Terima kasih atas perhatian Bapak/Ibu.'
    $sql$;

    execute $sql$
      update public.attendance_notification_settings
      set message_template = 'Assalamu’alaikum Bapak/Ibu,

Kami informasikan bahwa putra/putri Bapak/Ibu, *{nama}*, tercatat *{status}* pada *{tanggal} pukul {jam}*.

Terima kasih atas perhatian Bapak/Ibu.'
      where message_template = 'Assalamualaikum, putra/putri Anda {nama} tercatat {status} pada {tanggal}.'
    $sql$;
  end if;
end;
$migration$;

alter table public.attendance_qr_whatsapp_logs enable row level security;
revoke all on public.attendance_qr_whatsapp_logs from public, anon, authenticated;
grant all on public.attendance_qr_whatsapp_logs to service_role;

alter table public.attendance_qr_sessions enable row level security;
alter table public.attendance_qr_records enable row level security;
revoke all on public.attendance_qr_sessions from public, anon, authenticated;
revoke all on public.attendance_qr_records from public, anon, authenticated;
grant select on public.attendance_qr_records to authenticated;
grant select on public.attendance_qr_records to service_role;

create or replace function public.attendance_qr_session_is_owned(_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.attendance_qr_sessions s
    where s.id = _session_id
      and s.created_by = auth.uid()
  );
$function$;

revoke all on function public.attendance_qr_session_is_owned(uuid) from public, anon;
grant execute on function public.attendance_qr_session_is_owned(uuid) to authenticated;

drop policy if exists attendance_qr_records_read on public.attendance_qr_records;
create policy attendance_qr_records_read
  on public.attendance_qr_records
  for select
  to authenticated
  using (
    created_by = auth.uid()
    or public.attendance_qr_session_is_owned(session_id)
    or public.superapp_has_active_role(
      array[
        'super_admin',
        'operator',
        'kepala_sekolah',
        'kepala_tata_usaha',
        'staff_tata_usaha'
      ]::text[]
    )
  );

create or replace function public.create_attendance_qr_session(
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
begin
  if auth.uid() is null then
    raise exception 'Sesi login tidak tersedia.';
  end if;

  if p_session_type in ('school_arrival', 'school_departure') then
    if not public.superapp_has_active_role(array['super_admin', 'operator']::text[]) then
      raise exception 'Hanya admin atau operator aktif yang dapat membuat QR kedatangan/kepulangan sekolah.';
    end if;
  elsif p_session_type = 'subject' then
    if not public.superapp_has_active_role(array['guru']::text[]) then
      raise exception 'QR mata pelajaran hanya dapat dibuat oleh akun guru aktif.';
    end if;

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
  else
    raise exception 'Jenis sesi QR tidak valid.';
  end if;

  v_token := gen_random_uuid()::text;
  v_token_expires_at := now() + interval '90 seconds';
  v_expires_at := now() + case
    when p_session_type in ('school_arrival', 'school_departure') then interval '12 hours'
    else interval '90 minutes'
  end;

  insert into public.attendance_qr_sessions (
    token,
    session_type,
    subject,
    class_name,
    teacher_name,
    created_by,
    expires_at,
    token_expires_at
  )
  values (
    v_token,
    p_session_type,
    v_subject,
    v_class_name,
    v_teacher_name,
    auth.uid(),
    v_expires_at,
    v_token_expires_at
  )
  returning id into v_session_id;

  return query
    select v_session_id, v_token, p_session_type, v_subject, v_class_name,
      v_teacher_name, v_expires_at, v_token_expires_at;
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
begin
  v_token := gen_random_uuid()::text;
  v_token_expires_at := now() + interval '90 seconds';

  update public.attendance_qr_sessions s
    set token = v_token,
        token_expires_at = v_token_expires_at
    where s.id = p_session_id
      and s.created_by = auth.uid()
      and s.is_active
      and s.expires_at > now()
  returning s.expires_at into v_expires_at;

  if not found then
    raise exception 'Sesi QR sudah berakhir atau tidak dapat diakses.';
  end if;

  return query select v_token, v_expires_at, v_token_expires_at;
end;
$function$;

create or replace function public.close_attendance_qr_session(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  update public.attendance_qr_sessions s
    set is_active = false
    where s.id = p_session_id
      and s.created_by = auth.uid()
      and s.is_active;

  if not found then
    raise exception 'Sesi QR sudah berakhir atau tidak dapat diakses.';
  end if;
end;
$function$;

drop function if exists public.submit_attendance_qr(text);
create function public.submit_attendance_qr(p_token text)
returns table (
  session_type text,
  subject text,
  class_name text,
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
  v_nisn text;
  v_person_name text;
  v_student_class_name text;
  v_attendance_date date;
  v_record_id uuid;
  v_already_recorded boolean;
begin
  if auth.uid() is null
    or not public.superapp_has_active_role(array['siswa']::text[]) then
    raise exception 'Hanya siswa dengan akun aktif yang dapat mengirim absensi QR.';
  end if;

  select s.*
    into v_session
  from public.attendance_qr_sessions s
  where s.token = btrim(p_token)
    and s.is_active
    and s.expires_at > now()
    and s.token_expires_at > now();

  if not found then
    raise exception 'QR tidak valid atau sudah kedaluwarsa. Minta QR terbaru kepada petugas/guru.';
  end if;

  select btrim(st.nisn)::text, st.full_name::text, c.name::text
    into v_nisn, v_person_name, v_student_class_name
  from public.profiles p
  join public.students st on btrim(st.nisn) = btrim(p.username)
  left join public.classes c on c.id = st.class_id
  where p.id = auth.uid()
    and p.status = 'active'::public.account_status
    and p.role::text = 'siswa'
  limit 1;

  if v_nisn is null or btrim(v_nisn) = '' then
    raise exception 'Data siswa akun ini belum tertaut ke Data Induk.';
  end if;

  if v_session.session_type = 'subject'
    and lower(btrim(coalesce(v_student_class_name, ''))) <> lower(btrim(coalesce(v_session.class_name, ''))) then
    raise exception 'QR ini hanya berlaku untuk kelas %.', v_session.class_name;
  end if;

  v_attendance_date := (now() at time zone 'Asia/Makassar')::date;

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
      'hadir',
      'Kehadiran dicatat melalui QR kedatangan sekolah.',
      auth.uid()
    )
    on conflict (attendance_date, person_type, person_identifier) do nothing;
  end if;

  return query
    select v_session.session_type, v_session.subject, v_session.class_name,
      v_attendance_date, v_already_recorded, v_record_id;
end;
$function$;

revoke all on function public.create_attendance_qr_session(text, text, text) from public, anon;
revoke all on function public.refresh_attendance_qr_session(uuid) from public, anon;
revoke all on function public.close_attendance_qr_session(uuid) from public, anon;
revoke all on function public.submit_attendance_qr(text) from public, anon;
grant execute on function public.create_attendance_qr_session(text, text, text) to authenticated;
grant execute on function public.refresh_attendance_qr_session(uuid) to authenticated;
grant execute on function public.close_attendance_qr_session(uuid) to authenticated;
grant execute on function public.submit_attendance_qr(text) to authenticated;

notify pgrst, 'reload schema';
