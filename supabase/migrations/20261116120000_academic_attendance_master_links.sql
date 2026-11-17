create table if not exists public.attendance_teacher_subject_assignments (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teachers(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  subject text not null check (length(btrim(subject)) between 1 and 120),
  created_at timestamptz not null default now()
);

create unique index if not exists attendance_teacher_subject_assignments_unique
  on public.attendance_teacher_subject_assignments (
    teacher_id,
    class_id,
    lower(btrim(subject))
  );

create index if not exists attendance_teacher_subject_assignments_teacher_idx
  on public.attendance_teacher_subject_assignments (teacher_id, subject);

alter table public.attendance_teacher_subject_assignments enable row level security;
grant select, insert, update, delete
  on public.attendance_teacher_subject_assignments to authenticated;

drop policy if exists attendance_teacher_subject_assignments_admin_all
  on public.attendance_teacher_subject_assignments;
create policy attendance_teacher_subject_assignments_admin_all
  on public.attendance_teacher_subject_assignments
  for all to authenticated
  using (public.has_active_role(array[
    'super_admin'::public.app_role,
    'operator'::public.app_role
  ]))
  with check (public.has_active_role(array[
    'super_admin'::public.app_role,
    'operator'::public.app_role
  ]));

drop policy if exists attendance_teacher_subject_assignments_teacher_read
  on public.attendance_teacher_subject_assignments;
create policy attendance_teacher_subject_assignments_teacher_read
  on public.attendance_teacher_subject_assignments
  for select to authenticated
  using (
    exists (
      select 1
      from public.teachers teacher
      join public.profiles profile
        on profile.id = auth.uid()
       and profile.status = 'active'::public.account_status
       and profile.role::text = 'guru'
      where teacher.id = attendance_teacher_subject_assignments.teacher_id
        and (
          teacher.profile_id = profile.id
          or (
            teacher.profile_id is null
            and btrim(teacher.nip) = btrim(profile.username)
          )
        )
    )
  );

create or replace function public.get_my_attendance_subject_assignments()
returns table (
  assignment_id uuid,
  subject text,
  class_id uuid,
  class_name text,
  grade_level integer
)
language sql
stable
security definer
set search_path = ''
as $function$
  select
    assignment.id,
    assignment.subject,
    class.id,
    class.name,
    class.grade_level
  from public.profiles profile
  join public.teachers teacher
    on teacher.profile_id = profile.id
    or (
      teacher.profile_id is null
      and btrim(teacher.nip) = btrim(profile.username)
    )
  join public.attendance_teacher_subject_assignments assignment
    on assignment.teacher_id = teacher.id
  join public.classes class
    on class.id = assignment.class_id
  where profile.id = auth.uid()
    and profile.status = 'active'::public.account_status
    and profile.role::text = 'guru'
  order by assignment.subject, class.grade_level, class.name;
$function$;

revoke all on function public.get_my_attendance_subject_assignments()
  from public, anon, authenticated;
grant execute on function public.get_my_attendance_subject_assignments()
  to authenticated;

alter table if exists public.attendance_records
  add column if not exists student_id uuid references public.students(id) on delete set null,
  add column if not exists teacher_id uuid references public.teachers(id) on delete set null,
  add column if not exists class_id uuid references public.classes(id) on delete set null,
  add column if not exists academic_year_id uuid references public.academic_years(id) on delete set null;

alter table if exists public.attendance_qr_records
  add column if not exists student_id uuid references public.students(id) on delete set null,
  add column if not exists teacher_id uuid references public.teachers(id) on delete set null,
  add column if not exists class_id uuid references public.classes(id) on delete set null,
  add column if not exists academic_year_id uuid references public.academic_years(id) on delete set null;

alter table if exists public.academic_records
  add column if not exists academic_year_id uuid references public.academic_years(id) on delete set null,
  add column if not exists class_id uuid references public.classes(id) on delete set null,
  add column if not exists teacher_id uuid references public.teachers(id) on delete set null,
  add column if not exists subject text;

create index if not exists attendance_records_student_date_idx
  on public.attendance_records (student_id, attendance_date desc)
  where student_id is not null;
create index if not exists attendance_records_teacher_date_idx
  on public.attendance_records (teacher_id, attendance_date desc)
  where teacher_id is not null;
create index if not exists attendance_qr_records_student_date_idx
  on public.attendance_qr_records (student_id, attendance_date desc)
  where student_id is not null;
create index if not exists academic_records_class_year_created_idx
  on public.academic_records (class_id, academic_year_id, created_at desc);

create or replace function public.attendance_sync_master_links()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_student_id uuid;
  v_teacher_id uuid;
  v_class_id uuid;
  v_academic_year_id uuid;
  v_match_count integer;
begin
  if new.person_type = 'siswa' then
    select count(*)
      into v_match_count
    from public.students student
    where btrim(student.nisn) = btrim(new.person_identifier);

    if v_match_count = 1 then
      select student.id
        into v_student_id
      from public.students student
      where btrim(student.nisn) = btrim(new.person_identifier);

      select class.id, class.academic_year_id
        into v_class_id, v_academic_year_id
      from public.students student
      join public.classes class on class.id = student.class_id
      join public.academic_years year on year.id = class.academic_year_id
      where student.id = v_student_id
        and lower(btrim(class.name)) = lower(btrim(coalesce(new.class_name, '')))
        and year.start_date::date <= new.attendance_date
        and (year.end_date is null or year.end_date::date >= new.attendance_date)
      order by year.start_date desc
      limit 1;

      new.student_id := v_student_id;
      new.teacher_id := null;
      new.class_id := v_class_id;
      new.academic_year_id := v_academic_year_id;
    end if;
  elsif new.person_type = 'guru_tendik' then
    select count(*)
      into v_match_count
    from public.teachers teacher
    where btrim(coalesce(teacher.nip, '')) = btrim(new.person_identifier);

    if v_match_count = 1 then
      select teacher.id
        into v_teacher_id
      from public.teachers teacher
      where btrim(coalesce(teacher.nip, '')) = btrim(new.person_identifier);

      new.student_id := null;
      new.teacher_id := v_teacher_id;
      new.class_id := null;
      new.academic_year_id := null;
    end if;
  end if;

  return new;
end;
$function$;

drop trigger if exists attendance_records_master_links on public.attendance_records;
create trigger attendance_records_master_links
  before insert or update of person_type, person_identifier
  on public.attendance_records
  for each row execute function public.attendance_sync_master_links();

drop trigger if exists attendance_qr_records_master_links on public.attendance_qr_records;
create trigger attendance_qr_records_master_links
  before insert or update of person_type, person_identifier
  on public.attendance_qr_records
  for each row execute function public.attendance_sync_master_links();

with unique_students as (
  select btrim(nisn) as identifier, min(id::text)::uuid as student_id
  from public.students
  group by btrim(nisn)
  having count(*) = 1
)
update public.attendance_records attendance
set student_id = master.student_id
from unique_students master
where attendance.person_type = 'siswa'
  and attendance.student_id is null
  and btrim(attendance.person_identifier) = master.identifier;

with unique_teachers as (
  select btrim(nip) as identifier, min(id::text)::uuid as teacher_id
  from public.teachers
  where nullif(btrim(nip), '') is not null
  group by btrim(nip)
  having count(*) = 1
)
update public.attendance_records attendance
set teacher_id = master.teacher_id
from unique_teachers master
where attendance.person_type = 'guru_tendik'
  and attendance.teacher_id is null
  and btrim(attendance.person_identifier) = master.identifier;

with unique_students as (
  select btrim(nisn) as identifier, min(id::text)::uuid as student_id
  from public.students
  group by btrim(nisn)
  having count(*) = 1
)
update public.attendance_qr_records attendance
set student_id = master.student_id
from unique_students master
where attendance.person_type = 'siswa'
  and attendance.student_id is null
  and btrim(attendance.person_identifier) = master.identifier;

with unique_classes as (
  select
    lower(btrim(class.name)) as class_name,
    class.id as class_id,
    class.academic_year_id,
    year.start_date,
    year.end_date
  from public.classes class
  join public.academic_years year on year.id = class.academic_year_id
),
attendance_matches as (
  select
    attendance.id,
    (array_agg(class.class_id))[1] as class_id,
    (array_agg(class.academic_year_id))[1] as academic_year_id,
    count(*) as match_count
  from public.attendance_records attendance
  join unique_classes class
    on class.class_name = lower(btrim(attendance.class_name))
   and class.start_date::date <= attendance.attendance_date
   and (class.end_date is null or class.end_date::date >= attendance.attendance_date)
  where attendance.class_id is null
    and attendance.class_name is not null
  group by attendance.id
)
update public.attendance_records attendance
set class_id = matches.class_id,
    academic_year_id = matches.academic_year_id
from attendance_matches matches
where attendance.id = matches.id
  and matches.match_count = 1;

with unique_classes as (
  select
    lower(btrim(class.name)) as class_name,
    class.id as class_id,
    class.academic_year_id,
    year.start_date,
    year.end_date
  from public.classes class
  join public.academic_years year on year.id = class.academic_year_id
),
attendance_matches as (
  select
    attendance.id,
    (array_agg(class.class_id))[1] as class_id,
    (array_agg(class.academic_year_id))[1] as academic_year_id,
    count(*) as match_count
  from public.attendance_qr_records attendance
  join unique_classes class
    on class.class_name = lower(btrim(attendance.class_name))
   and class.start_date::date <= attendance.attendance_date
   and (class.end_date is null or class.end_date::date >= attendance.attendance_date)
  where attendance.class_id is null
    and attendance.class_name is not null
  group by attendance.id
)
update public.attendance_qr_records attendance
set class_id = matches.class_id,
    academic_year_id = matches.academic_year_id
from attendance_matches matches
where attendance.id = matches.id
  and matches.match_count = 1;

create or replace function public.attendance_student_has_permission(
  p_student_id uuid,
  p_attendance_date date
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
    left join public.classes class on class.id = student.class_id
    join public.kb_perizinan permission
      on permission.tanggal = p_attendance_date
     and coalesce(permission.status_tindak_lanjut, '') <> 'Ditolak'
     and (
       permission.student_id = student.id
       or (
         permission.student_id is null
         and lower(btrim(coalesce(permission.nama_siswa, ''))) = lower(btrim(student.full_name))
         and (
           nullif(btrim(coalesce(permission.kelas, '')), '') is null
           or lower(btrim(permission.kelas)) = lower(btrim(coalesce(class.name, '')))
         )
       )
     )
    where student.id = p_student_id
  );
$function$;

create or replace function public.sync_kb_permission_to_attendance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_student_id uuid;
  v_old_student_id uuid;
  v_student_name text;
  v_nisn text;
  v_class_id uuid;
  v_class_name text;
  v_academic_year_id uuid;
  v_permission_status text;
  v_attendance_status text;
  v_old_permission_removed boolean;
begin
  if tg_op <> 'INSERT' then
    if old.student_id is not null then
      v_old_student_id := old.student_id;
    else
      select min(student.id::text)::uuid
        into v_old_student_id
      from public.students student
      left join public.classes class on class.id = student.class_id
      where lower(btrim(student.full_name)) = lower(btrim(coalesce(old.nama_siswa, '')))
        and (
          nullif(btrim(coalesce(old.kelas, '')), '') is null
          or lower(btrim(class.name)) = lower(btrim(old.kelas))
        )
      having count(*) = 1;
    end if;

    v_old_permission_removed := tg_op = 'DELETE';
    if tg_op = 'UPDATE' then
      v_old_permission_removed :=
        old.student_id is distinct from new.student_id
        or old.tanggal is distinct from new.tanggal
        or coalesce(new.status_tindak_lanjut, '') = 'Ditolak';
    end if;

    if v_old_student_id is not null
      and v_old_permission_removed
      and not public.attendance_student_has_permission(v_old_student_id, old.tanggal) then
      select student.full_name, btrim(student.nisn), class.name
        into v_student_name, v_nisn, v_class_name
      from public.students student
      left join public.classes class on class.id = student.class_id
      where student.id = v_old_student_id;

      update public.attendance_records attendance
      set status = 'alpa',
          note = 'Izin ditolak atau dihapus; status absensi perlu diverifikasi.'
      where attendance.student_id = v_old_student_id
        and attendance.attendance_date = old.tanggal
        and attendance.status in ('izin', 'sakit')
        and attendance.note = 'Sinkronisasi otomatis dari perizinan Kesiswaan.';

      update public.attendance_bk_alerts alert
      set title = 'Peringatan absensi harian',
          body = v_student_name || ' (NISN ' || v_nisn || ')' ||
            case when v_class_name is not null then ' dari kelas ' || v_class_name else '' end ||
            ' tidak memiliki catatan izin aktif pada ' ||
            to_char(old.tanggal, 'DD Mon YYYY') || '.',
          is_read = false
      where alert.student_id = v_old_student_id
        and alert.attendance_date = old.tanggal;
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  if coalesce(new.status_tindak_lanjut, '') = 'Ditolak' then
    return new;
  end if;

  if new.student_id is not null then
    v_student_id := new.student_id;
  else
    select min(student.id::text)::uuid
      into v_student_id
    from public.students student
    left join public.classes class on class.id = student.class_id
    where lower(btrim(student.full_name)) = lower(btrim(coalesce(new.nama_siswa, '')))
      and (
        nullif(btrim(coalesce(new.kelas, '')), '') is null
        or lower(btrim(class.name)) = lower(btrim(new.kelas))
      )
    having count(*) = 1;
  end if;

  if v_student_id is null then
    return new;
  end if;

  select
    student.full_name,
    btrim(student.nisn),
    student.class_id,
    class.name,
    class.academic_year_id
  into
    v_student_name,
    v_nisn,
    v_class_id,
    v_class_name,
    v_academic_year_id
  from public.students student
  left join public.classes class on class.id = student.class_id
  where student.id = v_student_id;

  v_permission_status := lower(coalesce(new.alasan, ''));
  v_attendance_status := case
    when v_permission_status like '%sakit%' then 'sakit'
    else 'izin'
  end;

  insert into public.attendance_records (
    attendance_date,
    person_type,
    person_identifier,
    person_name,
    class_name,
    student_id,
    class_id,
    academic_year_id,
    status,
    note,
    created_by
  )
  values (
    new.tanggal,
    'siswa',
    v_nisn,
    v_student_name,
    v_class_name,
    v_student_id,
    v_class_id,
    v_academic_year_id,
    v_attendance_status,
    'Sinkronisasi otomatis dari perizinan Kesiswaan.',
    auth.uid()
  )
  on conflict (attendance_date, person_type, person_identifier)
  do update set
    student_id = excluded.student_id,
    class_id = excluded.class_id,
    academic_year_id = excluded.academic_year_id,
    class_name = excluded.class_name,
    status = excluded.status,
    note = excluded.note
  where public.attendance_records.status = 'alpa'
     or public.attendance_records.note = 'Sinkronisasi otomatis dari perizinan Kesiswaan.';

  update public.attendance_bk_alerts alert
  set title = 'Sudah Ada Izin',
      body = v_student_name || ' sudah memiliki catatan perizinan pada ' ||
        to_char(new.tanggal, 'DD Mon YYYY') || '.',
      is_read = true
  where alert.student_id = v_student_id
    and alert.attendance_date = new.tanggal;

  return new;
end;
$function$;

drop trigger if exists kb_perizinan_sync_attendance on public.kb_perizinan;
create trigger kb_perizinan_sync_attendance
  after insert or update or delete
  on public.kb_perizinan
  for each row execute function public.sync_kb_permission_to_attendance();

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
      btrim(student.nisn),
      student.full_name,
      class.name,
      'alpa',
      'Alpa otomatis: QR kedatangan tidak dipindai sampai batas ' ||
        to_char(v_settings.arrival_absent_at, 'HH24:MI') || ' WITA.',
      null
    from public.students student
    left join public.classes class on class.id = student.class_id
    where student.status = 'Active'
      and not public.attendance_student_has_permission(student.id, v_attendance_date)
      and not exists (
        select 1
        from public.attendance_records attendance
        where attendance.attendance_date = v_attendance_date
          and attendance.person_type = 'siswa'
          and attendance.person_identifier = btrim(student.nisn)
      )
    on conflict (attendance_date, person_type, person_identifier) do nothing;
  end if;

  update public.attendance_bk_alerts alert
  set title = 'Sudah Ada Izin',
      body = student.full_name || ' sudah memiliki catatan perizinan pada ' ||
        to_char(v_attendance_date, 'DD Mon YYYY') || '.',
      is_read = true
  from public.students student
  where alert.student_id = student.id
    and alert.attendance_date = v_attendance_date
    and public.attendance_student_has_permission(student.id, v_attendance_date);

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
      student.id,
      assignment.counselor_profile_id,
      v_attendance_date,
      student.full_name,
      btrim(student.nisn),
      class.name,
      'Peringatan absensi harian',
      student.full_name || ' (NISN ' || btrim(student.nisn) || ')' ||
        case when class.name is not null then ' dari kelas ' || class.name else '' end ||
        ' tidak memiliki catatan QR kedatangan, kepulangan, maupun mata pelajaran pada ' ||
        to_char(v_attendance_date, 'DD Mon YYYY') || '.'
    from public.students student
    join public.attendance_bk_assignments assignment on assignment.student_id = student.id
    join public.profiles counselor
      on counselor.id = assignment.counselor_profile_id
      and counselor.status = 'active'::public.account_status
      and counselor.role::text = 'guru_bk'
    left join public.classes class on class.id = student.class_id
    where student.status = 'Active'
      and not public.attendance_student_has_permission(student.id, v_attendance_date)
      and not exists (
        select 1
        from public.attendance_qr_records qr_record
        where qr_record.attendance_date = v_attendance_date
          and qr_record.person_type = 'siswa'
          and qr_record.person_identifier = btrim(student.nisn)
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

create or replace function public.academic_teacher_assignment_matches(
  p_class_id uuid,
  p_subject text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.get_my_master_identity() identity
    join public.attendance_teacher_subject_assignments assignment
      on assignment.teacher_id = identity.teacher_id
    where identity.teacher_id is not null
      and assignment.class_id = p_class_id
      and lower(btrim(assignment.subject)) = lower(btrim(coalesce(p_subject, '')))
  );
$function$;

create or replace function public.academic_records_sync_master_links()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_identity record;
  v_class_year_id uuid;
begin
  if new.class_id is not null then
    select class.academic_year_id
      into v_class_year_id
    from public.classes class
    where class.id = new.class_id;

    if v_class_year_id is not null then
      new.academic_year_id := v_class_year_id;
    end if;
  elsif new.academic_year_id is null then
    select year.id
      into new.academic_year_id
    from public.academic_years year
    where year.is_active
    order by year.start_date desc nulls last, year.name
    limit 1;
  end if;

  if public.has_active_role(array['guru'::public.app_role]) then
    select *
      into v_identity
    from public.get_my_master_identity()
    limit 1;

    if v_identity.teacher_id is not null then
      new.teacher_id := v_identity.teacher_id;
    end if;
    if nullif(v_identity.full_name, '') is not null then
      new.owner := v_identity.full_name;
    end if;
  end if;

  new.subject := nullif(btrim(coalesce(new.subject, '')), '');
  return new;
end;
$function$;

drop trigger if exists academic_records_sync_master_links on public.academic_records;
create trigger academic_records_sync_master_links
  before insert or update of class_id, teacher_id, subject
  on public.academic_records
  for each row execute function public.academic_records_sync_master_links();

with unique_teachers as (
  select lower(btrim(full_name)) as full_name, min(id::text)::uuid as teacher_id
  from public.teachers
  group by lower(btrim(full_name))
  having count(*) = 1
)
update public.academic_records record
set teacher_id = teacher.teacher_id
from unique_teachers teacher
where record.teacher_id is null
  and nullif(btrim(coalesce(record.owner, '')), '') is not null
  and lower(btrim(record.owner)) = teacher.full_name;

drop policy if exists academic_records_active_role_restriction on public.academic_records;
create policy academic_records_active_role_restriction
  on public.academic_records
  as restrictive
  for all
  to authenticated
  using (
    public.has_active_role(array[
      'super_admin'::public.app_role,
      'kepala_sekolah'::public.app_role,
      'operator'::public.app_role,
      'guru'::public.app_role
    ])
    or (
      public.has_active_role(array['siswa'::public.app_role])
      and category in (
        'Jadwal Mengajar',
        'Materi Kelas',
        'Tugas Kelas',
        'Pengumuman',
        'Tautan E-learning'
      )
      and (
        class_id = (
          select identity.class_id
          from public.get_my_master_identity() identity
          limit 1
        )
        or (category = 'Pengumuman' and class_id is null)
      )
      and (
        academic_year_id is null
        or exists (
          select 1
          from public.academic_years active_year
          where active_year.id = academic_records.academic_year_id
            and active_year.is_active
        )
      )
    )
  )
  with check (public.has_active_role(array[
    'super_admin'::public.app_role,
    'operator'::public.app_role,
    'guru'::public.app_role
  ]));

drop policy if exists academic_records_insert_role_scope on public.academic_records;
create policy academic_records_insert_role_scope on public.academic_records
  as restrictive
  for insert
  to authenticated
  with check (
    public.has_active_role(array[
      'super_admin'::public.app_role,
      'operator'::public.app_role
    ])
    or (
      public.has_active_role(array['guru'::public.app_role])
      and teacher_id = (
        select identity.teacher_id
        from public.get_my_master_identity() identity
        limit 1
      )
      and (
        (category = 'Pengumuman' and class_id is null)
        or public.academic_teacher_assignment_matches(class_id, subject)
      )
    )
  );

drop policy if exists academic_records_update_role_scope on public.academic_records;
create policy academic_records_update_role_scope on public.academic_records
  as restrictive
  for update
  to authenticated
  using (
    public.has_active_role(array[
      'super_admin'::public.app_role,
      'operator'::public.app_role
    ])
    or (
      public.has_active_role(array['guru'::public.app_role])
      and teacher_id = (
        select identity.teacher_id
        from public.get_my_master_identity() identity
        limit 1
      )
      and (
        (category = 'Pengumuman' and class_id is null)
        or public.academic_teacher_assignment_matches(class_id, subject)
      )
    )
  )
  with check (
    public.has_active_role(array[
      'super_admin'::public.app_role,
      'operator'::public.app_role
    ])
    or (
      public.has_active_role(array['guru'::public.app_role])
      and teacher_id = (
        select identity.teacher_id
        from public.get_my_master_identity() identity
        limit 1
      )
      and (
        (category = 'Pengumuman' and class_id is null)
        or public.academic_teacher_assignment_matches(class_id, subject)
      )
    )
  );

revoke all on function public.attendance_sync_master_links() from public, anon, authenticated;
revoke all on function public.attendance_student_has_permission(uuid, date) from public, anon, authenticated;
revoke all on function public.sync_kb_permission_to_attendance() from public, anon, authenticated;
revoke all on function public.academic_teacher_assignment_matches(uuid, text) from public, anon;
grant execute on function public.academic_teacher_assignment_matches(uuid, text) to authenticated;
revoke all on function public.academic_records_sync_master_links() from public, anon, authenticated;

notify pgrst, 'reload schema';
