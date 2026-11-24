create table if not exists public.kb_teacher_referrals (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete restrict,
  reporter_profile_id uuid not null references public.profiles(id) on delete restrict,
  counselor_profile_id uuid references public.profiles(id) on delete set null,
  category text not null check (category in ('Akademik', 'Kehadiran', 'Perilaku/Kedisiplinan', 'Sosial-Emosional')),
  priority text not null default 'Sedang' check (priority in ('Rendah', 'Sedang', 'Tinggi')),
  description text not null check (length(btrim(description)) between 10 and 4000),
  status text not null default 'Menunggu Tinjauan'
    check (status in ('Menunggu Tinjauan', 'Diproses BK', 'Jadwal Konsultasi Dibuat', 'Selesai')),
  non_confidential_feedback text not null default '' check (length(non_confidential_feedback) <= 4000),
  feedback_by uuid references public.profiles(id) on delete set null,
  consultation_id uuid references public.kb_consultations(id) on delete set null,
  home_visit_id uuid references public.kb_home_visits(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists kb_teacher_referrals_reporter_created_idx
  on public.kb_teacher_referrals (reporter_profile_id, created_at desc);
create index if not exists kb_teacher_referrals_student_status_idx
  on public.kb_teacher_referrals (student_id, status, updated_at desc);
create index if not exists kb_teacher_referrals_counselor_created_idx
  on public.kb_teacher_referrals (counselor_profile_id, created_at desc);

create table if not exists public.kb_homeroom_followups (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete restrict,
  teacher_profile_id uuid not null references public.profiles(id) on delete restrict,
  intervention text not null check (length(btrim(intervention)) between 2 and 120),
  note text not null check (length(btrim(note)) between 5 and 3000),
  outcome text not null check (outcome in ('Ditangani Wali Kelas', 'Perlu Eskalasi ke BK')),
  referral_id uuid references public.kb_teacher_referrals(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.kb_teacher_referrals
  add column if not exists source_followup_id uuid
    references public.kb_homeroom_followups(id) on delete set null;

create index if not exists kb_homeroom_followups_class_created_idx
  on public.kb_homeroom_followups (class_id, created_at desc);
create index if not exists kb_homeroom_followups_student_created_idx
  on public.kb_homeroom_followups (student_id, created_at desc);

create table if not exists public.kb_teacher_appreciations (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  class_id uuid references public.classes(id) on delete set null,
  created_by uuid not null references public.profiles(id) on delete restrict,
  category text not null check (category in ('Kedisiplinan', 'Empati', 'Keaktifan', 'Prestasi Sikap')),
  note text not null check (length(btrim(note)) between 5 and 1500),
  created_at timestamptz not null default now()
);

create index if not exists kb_teacher_appreciations_student_created_idx
  on public.kb_teacher_appreciations (student_id, created_at desc);

create table if not exists public.kb_home_visit_collaborations (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete restrict,
  requester_profile_id uuid not null references public.profiles(id) on delete restrict,
  counselor_profile_id uuid references public.profiles(id) on delete set null,
  requested_date date,
  context text not null check (length(btrim(context)) between 5 and 2000),
  status text not null default 'Menunggu BK'
    check (status in ('Menunggu BK', 'Disetujui', 'Ditolak')),
  response_note text not null default '' check (length(response_note) <= 1000),
  home_visit_id uuid references public.kb_home_visits(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists kb_home_visit_collaborations_class_idx
  on public.kb_home_visit_collaborations (class_id, created_at desc);
create index if not exists kb_home_visit_collaborations_student_idx
  on public.kb_home_visit_collaborations (student_id, status);

create or replace function public.kb_teacher_student_directory(p_student_id uuid default null)
returns table (
  student_id uuid,
  nisn text,
  full_name text,
  class_id uuid,
  class_name text,
  grade_level integer,
  academic_year_id uuid,
  homeroom_teacher_profile_id uuid,
  homeroom_teacher_name text,
  counselor_profile_id uuid,
  counselor_name text
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if not public.superapp_has_active_role(array['guru']::text[]) then
    raise exception 'Akses direktori guru tidak diizinkan.' using errcode = '42501';
  end if;

  return query
  select
    student.id,
    student.nisn::text,
    student.full_name::text,
    student.class_id,
    class.name::text,
    class.grade_level::integer,
    class.academic_year_id,
    homeroom.profile_id,
    homeroom.full_name,
    assignment.counselor_profile_id,
    counselor.full_name::text
  from public.students student
  left join public.classes class on class.id = student.class_id
  left join lateral (
    select coalesce(teacher.profile_id, teacher.id) as profile_id, teacher.full_name::text
    from public.teachers teacher
    where class.homeroom_teacher_id in (teacher.id, teacher.profile_id)
    order by (teacher.profile_id = class.homeroom_teacher_id) desc nulls last
    limit 1
  ) homeroom on true
  left join public.attendance_bk_assignments assignment on assignment.student_id = student.id
  left join public.profiles counselor on counselor.id = assignment.counselor_profile_id
  where student.status::text = 'Active'
    and (p_student_id is null or student.id = p_student_id)
  order by class.grade_level nulls last, class.name nulls last, student.full_name;
end;
$function$;

create or replace function public.kb_guard_teacher_referral()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_student public.students%rowtype;
  v_counselor_id uuid;
begin
  if tg_op = 'INSERT' then
    if not public.superapp_has_active_role(array['guru']::text[]) then
      raise exception 'Hanya guru yang dapat mengirim rujukan.' using errcode = '42501';
    end if;

    select * into v_student
    from public.students student
    where student.id = new.student_id
      and student.status::text = 'Active';

    if not found then
      raise exception 'Siswa aktif tidak ditemukan.';
    end if;

    select assignment.counselor_profile_id into v_counselor_id
    from public.attendance_bk_assignments assignment
    where assignment.student_id = new.student_id;
    if v_counselor_id is null then
      raise exception 'Guru BK pengampu belum ditugaskan untuk siswa ini.';
    end if;

    new.class_id := v_student.class_id;
    new.reporter_profile_id := auth.uid();
    new.counselor_profile_id := v_counselor_id;
    new.status := 'Menunggu Tinjauan';
    new.non_confidential_feedback := '';
    new.feedback_by := null;
    new.consultation_id := null;
    new.home_visit_id := null;

    if new.source_followup_id is not null and not exists (
      select 1
      from public.kb_homeroom_followups followup
      where followup.id = new.source_followup_id
        and followup.student_id = new.student_id
        and followup.teacher_profile_id = auth.uid()
    ) then
      raise exception 'Konteks pembinaan tidak cocok dengan siswa.';
    end if;

    return new;
  end if;

  if new.consultation_id is not null and not exists (
    select 1 from public.kb_consultations consultation
    where consultation.id = new.consultation_id
      and consultation.student_id = new.student_id
  ) then
    raise exception 'Jadwal konsultasi harus milik siswa yang dirujuk.';
  end if;
  if new.home_visit_id is not null and not exists (
    select 1 from public.kb_home_visits visit
    where visit.id = new.home_visit_id
      and visit.student_id = new.student_id
  ) then
    raise exception 'Kunjungan rumah harus milik siswa yang dirujuk.';
  end if;

  if public.superapp_has_active_role(array['super_admin']::text[]) then
    new.updated_at := now();
    return new;
  end if;

  if not public.superapp_has_active_role(array['guru_bk']::text[])
    or not public.kb_bk_is_assigned(old.student_id) then
    raise exception 'Akses pembaruan rujukan tidak diizinkan.' using errcode = '42501';
  end if;

  if new.student_id is distinct from old.student_id
    or new.class_id is distinct from old.class_id
    or new.reporter_profile_id is distinct from old.reporter_profile_id
    or new.counselor_profile_id is distinct from old.counselor_profile_id
    or new.category is distinct from old.category
    or new.priority is distinct from old.priority
    or new.description is distinct from old.description
    or new.source_followup_id is distinct from old.source_followup_id then
    raise exception 'Data awal rujukan tidak dapat diubah.';
  end if;

  if new.non_confidential_feedback is distinct from old.non_confidential_feedback then
    new.feedback_by := auth.uid();
  end if;
  new.updated_at := now();
  return new;
end;
$function$;

create trigger kb_teacher_referral_guard
  before insert or update on public.kb_teacher_referrals
  for each row execute function public.kb_guard_teacher_referral();

create or replace function public.kb_guard_teacher_appreciation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_student public.students%rowtype;
begin
  if not public.superapp_has_active_role(array['guru']::text[]) then
    raise exception 'Hanya guru yang dapat mencatat apresiasi.' using errcode = '42501';
  end if;

  select * into v_student
  from public.students student
  where student.id = new.student_id
    and student.status::text = 'Active';
  if not found then
    raise exception 'Siswa aktif tidak ditemukan.';
  end if;

  new.class_id := v_student.class_id;
  new.created_by := auth.uid();
  return new;
end;
$function$;

create trigger kb_teacher_appreciation_guard
  before insert on public.kb_teacher_appreciations
  for each row execute function public.kb_guard_teacher_appreciation();

create or replace function public.kb_guard_home_visit_collaboration()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_student public.students%rowtype;
  v_counselor_id uuid;
begin
  if tg_op = 'INSERT' then
    if not public.superapp_has_active_role(array['guru']::text[]) then
      raise exception 'Hanya wali kelas yang dapat mengajukan kolaborasi.' using errcode = '42501';
    end if;

    select * into v_student
    from public.students student
    where student.id = new.student_id
      and student.status::text = 'Active';
    if not found or v_student.class_id is null
      or not public.attendance_teacher_owns_class(v_student.class_id) then
      raise exception 'Siswa tidak berada dalam kelas perwalian Anda.' using errcode = '42501';
    end if;

    select assignment.counselor_profile_id into v_counselor_id
    from public.attendance_bk_assignments assignment
    where assignment.student_id = new.student_id;
    if v_counselor_id is null then
      raise exception 'Guru BK pengampu belum ditugaskan untuk siswa ini.';
    end if;

    new.class_id := v_student.class_id;
    new.requester_profile_id := auth.uid();
    new.counselor_profile_id := v_counselor_id;
    new.status := 'Menunggu BK';
    new.response_note := '';
    new.home_visit_id := null;
    return new;
  end if;

  if new.home_visit_id is not null and not exists (
    select 1 from public.kb_home_visits visit
    where visit.id = new.home_visit_id
      and visit.student_id = new.student_id
  ) then
    raise exception 'Jadwal kunjungan harus milik siswa yang sama.';
  end if;

  if public.superapp_has_active_role(array['super_admin']::text[]) then
    new.updated_at := now();
    return new;
  end if;

  if not public.superapp_has_active_role(array['guru_bk']::text[])
    or not public.kb_bk_is_assigned(old.student_id) then
    raise exception 'Akses pembaruan usulan kunjungan tidak diizinkan.' using errcode = '42501';
  end if;

  if new.student_id is distinct from old.student_id
    or new.class_id is distinct from old.class_id
    or new.requester_profile_id is distinct from old.requester_profile_id
    or new.counselor_profile_id is distinct from old.counselor_profile_id
    or new.requested_date is distinct from old.requested_date
    or new.context is distinct from old.context then
    raise exception 'Data awal usulan tidak dapat diubah.';
  end if;
  new.updated_at := now();
  return new;
end;
$function$;

create trigger kb_home_visit_collaboration_guard
  before insert or update on public.kb_home_visit_collaborations
  for each row execute function public.kb_guard_home_visit_collaboration();

alter table public.kb_teacher_referrals enable row level security;
alter table public.kb_homeroom_followups enable row level security;
alter table public.kb_teacher_appreciations enable row level security;
alter table public.kb_home_visit_collaborations enable row level security;

revoke all on public.kb_teacher_referrals,
  public.kb_homeroom_followups,
  public.kb_teacher_appreciations,
  public.kb_home_visit_collaborations
  from public, anon, authenticated;
grant select, insert, update on public.kb_teacher_referrals to authenticated;
grant select on public.kb_homeroom_followups to authenticated;
grant select, insert on public.kb_teacher_appreciations to authenticated;
grant select, insert, update on public.kb_home_visit_collaborations to authenticated;

create policy kb_teacher_referrals_read_scope
  on public.kb_teacher_referrals for select to authenticated
  using (
    public.superapp_has_active_role(array['super_admin']::text[])
    or (
      public.superapp_has_active_role(array['guru']::text[])
      and reporter_profile_id = auth.uid()
    )
    or (
      public.superapp_has_active_role(array['guru_bk']::text[])
      and public.kb_bk_is_assigned(student_id)
    )
  );
create policy kb_teacher_referrals_insert_teacher
  on public.kb_teacher_referrals for insert to authenticated
  with check (
    public.superapp_has_active_role(array['guru']::text[])
    and reporter_profile_id = auth.uid()
  );
create policy kb_teacher_referrals_update_counselor
  on public.kb_teacher_referrals for update to authenticated
  using (
    public.superapp_has_active_role(array['super_admin']::text[])
    or (
      public.superapp_has_active_role(array['guru_bk']::text[])
      and public.kb_bk_is_assigned(student_id)
    )
  )
  with check (
    public.superapp_has_active_role(array['super_admin']::text[])
    or (
      public.superapp_has_active_role(array['guru_bk']::text[])
      and public.kb_bk_is_assigned(student_id)
    )
  );

create policy kb_homeroom_followups_read_scope
  on public.kb_homeroom_followups for select to authenticated
  using (
    public.superapp_has_active_role(array['super_admin']::text[])
    or (
      public.superapp_has_active_role(array['guru']::text[])
      and teacher_profile_id = auth.uid()
      and public.attendance_teacher_owns_class(class_id)
    )
    or (
      public.superapp_has_active_role(array['guru_bk']::text[])
      and public.kb_bk_is_assigned(student_id)
    )
  );

create policy kb_teacher_appreciations_read_scope
  on public.kb_teacher_appreciations for select to authenticated
  using (
    public.superapp_has_active_role(array['super_admin']::text[])
    or (
      public.superapp_has_active_role(array['siswa']::text[])
      and exists (
        select 1 from public.students student
        where student.id = student_id and student.profile_id = auth.uid()
      )
    )
    or (
      public.superapp_has_active_role(array['guru']::text[])
      and (
        created_by = auth.uid()
        or (class_id is not null and public.attendance_teacher_owns_class(class_id))
      )
    )
    or (
      public.superapp_has_active_role(array['guru_bk']::text[])
      and public.kb_bk_is_assigned(student_id)
    )
  );
create policy kb_teacher_appreciations_insert_teacher
  on public.kb_teacher_appreciations for insert to authenticated
  with check (
    public.superapp_has_active_role(array['guru']::text[])
    and created_by = auth.uid()
  );

create policy kb_home_visit_collaborations_read_scope
  on public.kb_home_visit_collaborations for select to authenticated
  using (
    public.superapp_has_active_role(array['super_admin']::text[])
    or (
      public.superapp_has_active_role(array['guru']::text[])
      and public.attendance_teacher_owns_class(class_id)
    )
    or (
      public.superapp_has_active_role(array['guru_bk']::text[])
      and public.kb_bk_is_assigned(student_id)
    )
  );
create policy kb_home_visit_collaborations_insert_teacher
  on public.kb_home_visit_collaborations for insert to authenticated
  with check (
    public.superapp_has_active_role(array['guru']::text[])
    and requester_profile_id = auth.uid()
  );
create policy kb_home_visit_collaborations_update_counselor
  on public.kb_home_visit_collaborations for update to authenticated
  using (
    public.superapp_has_active_role(array['super_admin']::text[])
    or (
      public.superapp_has_active_role(array['guru_bk']::text[])
      and public.kb_bk_is_assigned(student_id)
    )
  )
  with check (
    public.superapp_has_active_role(array['super_admin']::text[])
    or (
      public.superapp_has_active_role(array['guru_bk']::text[])
      and public.kb_bk_is_assigned(student_id)
    )
  );

create or replace function public.kb_create_homeroom_followup(
  p_student_id uuid,
  p_intervention text,
  p_note text,
  p_category text,
  p_priority text,
  p_escalate boolean
)
returns table (followup_id uuid, referral_id uuid)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_student public.students%rowtype;
  v_followup_id uuid;
  v_referral_id uuid;
  v_sick integer;
  v_excused integer;
  v_absent integer;
  v_late integer;
  v_alert boolean;
  v_referral_description text;
begin
  if not public.superapp_has_active_role(array['guru']::text[]) then
    raise exception 'Hanya wali kelas yang dapat mencatat pembinaan.' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_intervention, ''))) not between 2 and 120
    or length(btrim(coalesce(p_note, ''))) not between 5 and 3000
    or p_category not in ('Akademik', 'Kehadiran', 'Perilaku/Kedisiplinan', 'Sosial-Emosional')
    or p_priority not in ('Rendah', 'Sedang', 'Tinggi') then
    raise exception 'Data pembinaan belum lengkap atau tidak valid.';
  end if;

  select * into v_student
  from public.students student
  where student.id = p_student_id
    and student.status::text = 'Active';
  if not found or v_student.class_id is null
    or not public.attendance_teacher_owns_class(v_student.class_id) then
    raise exception 'Siswa tidak berada dalam kelas perwalian Anda.' using errcode = '42501';
  end if;

  insert into public.kb_homeroom_followups (
    student_id, class_id, teacher_profile_id, intervention, note, outcome
  ) values (
    v_student.id, v_student.class_id, auth.uid(), btrim(p_intervention), btrim(p_note),
    case when p_escalate then 'Perlu Eskalasi ke BK' else 'Ditangani Wali Kelas' end
  ) returning id into v_followup_id;

  if p_escalate then
    select
      count(*) filter (where lower(btrim(record.status::text)) = 'sakit')::integer,
      count(*) filter (where lower(btrim(record.status::text)) = 'izin')::integer,
      count(*) filter (where lower(btrim(record.status::text)) = 'alpa')::integer,
      count(*) filter (where lower(btrim(record.status::text)) = 'terlambat')::integer
    into v_sick, v_excused, v_absent, v_late
    from public.attendance_records record
    where record.person_type = 'siswa'
      and record.attendance_date >= current_date - 30
      and btrim(record.person_identifier) = btrim(v_student.nisn::text);

    select exists (
      select 1 from public.attendance_bk_alerts alert
      where alert.student_id = v_student.id
        and alert.attendance_date >= current_date - 30
    ) into v_alert;

    v_referral_description := btrim(p_note) || E'\n\nRingkasan absensi 30 hari terakhir: '
      || 'Sakit ' || coalesce(v_sick, 0)::text
      || ', Izin ' || coalesce(v_excused, 0)::text
      || ', Alpa ' || coalesce(v_absent, 0)::text
      || ', Terlambat ' || coalesce(v_late, 0)::text
      || '. Peringatan dini BK: ' || case when v_alert then 'ada.' else 'tidak ada.' end;

    insert into public.kb_teacher_referrals (
      student_id, class_id, reporter_profile_id, category, priority, description, source_followup_id
    ) values (
      v_student.id, v_student.class_id, auth.uid(), p_category, p_priority,
      v_referral_description, v_followup_id
    ) returning id into v_referral_id;

    update public.kb_homeroom_followups
    set referral_id = v_referral_id
    where id = v_followup_id;
  end if;

  return query select v_followup_id, v_referral_id;
end;
$function$;

create or replace function public.kb_homeroom_attendance_summary()
returns table (
  student_id uuid,
  class_id uuid,
  full_name text,
  nisn text,
  class_name text,
  sakit_count bigint,
  izin_count bigint,
  alpa_count bigint,
  terlambat_count bigint,
  has_bk_alert boolean,
  latest_referral_status text,
  early_warning text
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if not public.superapp_has_active_role(array['guru']::text[]) then
    raise exception 'Ringkasan hanya tersedia bagi wali kelas.' using errcode = '42501';
  end if;

  return query
  with homeroom_students as (
    select student.id, student.class_id, student.full_name, student.nisn, class.name as class_name
    from public.students student
    join public.classes class on class.id = student.class_id
    where student.status::text = 'Active'
      and public.attendance_teacher_owns_class(class.id)
  ),
  attendance as (
    select
      student.id,
      count(*) filter (where lower(btrim(record.status::text)) = 'sakit') as sakit_count,
      count(*) filter (where lower(btrim(record.status::text)) = 'izin') as izin_count,
      count(*) filter (where lower(btrim(record.status::text)) = 'alpa') as alpa_count,
      count(*) filter (where lower(btrim(record.status::text)) = 'terlambat') as terlambat_count
    from homeroom_students student
    left join public.attendance_records record
      on record.person_type = 'siswa'
      and btrim(record.person_identifier) = btrim(student.nisn::text)
      and record.attendance_date >= current_date - 30
    group by student.id
  )
  select
    student.id,
    student.class_id,
    student.full_name::text,
    student.nisn::text,
    student.class_name::text,
    coalesce(attendance.sakit_count, 0),
    coalesce(attendance.izin_count, 0),
    coalesce(attendance.alpa_count, 0),
    coalesce(attendance.terlambat_count, 0),
    exists (
      select 1 from public.attendance_bk_alerts alert
      where alert.student_id = student.id
        and alert.attendance_date >= current_date - 30
    ),
    (
      select referral.status
      from public.kb_teacher_referrals referral
      where referral.student_id = student.id
      order by referral.updated_at desc
      limit 1
    ),
    case
      when exists (
        select 1 from public.attendance_bk_alerts alert
        where alert.student_id = student.id
          and alert.attendance_date >= current_date - 30
      ) then 'Ada peringatan BK'
      when coalesce(attendance.alpa_count, 0) > 0 then 'Perlu pantauan'
      else 'Stabil'
    end
  from homeroom_students student
  left join attendance on attendance.id = student.id
  order by student.class_name, student.full_name;
end;
$function$;

create or replace function public.kb_homeroom_schedule_summary()
returns table (
  student_id uuid,
  student_name text,
  class_name text,
  event_type text,
  event_date date,
  event_time text,
  status text
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if not public.superapp_has_active_role(array['guru']::text[]) then
    raise exception 'Ringkasan jadwal hanya tersedia bagi wali kelas.' using errcode = '42501';
  end if;

  return query
  with homeroom_students as (
    select student.id, student.full_name, class.name as class_name
    from public.students student
    join public.classes class on class.id = student.class_id
    where student.status::text = 'Active'
      and public.attendance_teacher_owns_class(class.id)
  )
  select student.id, student.full_name::text, student.class_name::text,
    'Konsultasi BK'::text, consultation.scheduled_date::date,
    consultation.start_time::text, consultation.status::text
  from homeroom_students student
  join public.kb_consultations consultation on consultation.student_id = student.id
  where consultation.scheduled_date is not null
  union all
  select student.id, student.full_name::text, student.class_name::text,
    'Kunjungan Rumah'::text, visit.visit_date::date,
    visit.visit_time::text, 'Terjadwal'::text
  from homeroom_students student
  join public.kb_home_visits visit on visit.student_id = student.id
  where visit.visit_date is not null
  union all
  select student.id, student.full_name::text, student.class_name::text,
    'Usulan Kunjungan Disetujui'::text, proposal.requested_date::date,
    null::text, proposal.status::text
  from homeroom_students student
  join public.kb_home_visit_collaborations proposal on proposal.student_id = student.id
  where proposal.status = 'Disetujui'
    and proposal.requested_date is not null
  order by 5 desc nulls last, 2;
end;
$function$;

create or replace function public.kb_student_support_schedule()
returns table (
  event_type text,
  event_date date,
  event_time text,
  status text
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_student_id uuid;
begin
  if not public.superapp_has_active_role(array['siswa']::text[]) then
    raise exception 'Jadwal hanya tersedia bagi siswa pemilik.' using errcode = '42501';
  end if;

  select student.id into v_student_id
  from public.students student
  where student.profile_id = auth.uid();
  if v_student_id is null then
    raise exception 'Profil siswa tidak ditemukan.';
  end if;

  return query
  select 'Konsultasi BK'::text, consultation.scheduled_date::date,
    consultation.start_time::text, consultation.status::text
  from public.kb_consultations consultation
  where consultation.student_id = v_student_id
    and consultation.scheduled_date is not null
  union all
  select 'Kunjungan Rumah'::text, visit.visit_date::date,
    visit.visit_time::text, 'Terjadwal'::text
  from public.kb_home_visits visit
  where visit.student_id = v_student_id
    and visit.visit_date is not null
  order by 2 desc nulls last;
end;
$function$;

create or replace function public.kb_homeroom_akpd_summary()
returns table (
  area text,
  respondent_count bigint,
  need_count bigint,
  answered_count bigint,
  percentage numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if not public.superapp_has_active_role(array['guru']::text[]) then
    raise exception 'Ringkasan AKPD hanya tersedia bagi wali kelas.' using errcode = '42501';
  end if;

  return query
  with homeroom_students as (
    select student.id, class.grade_level, class.academic_year_id
    from public.students student
    join public.classes class on class.id = student.class_id
    where student.status::text = 'Active'
      and public.attendance_teacher_owns_class(class.id)
  ),
  eligible_forms as (
    select distinct form.id, form.questions
    from public.kb_akpd_forms form
    join homeroom_students student
      on student.academic_year_id = form.academic_year_id
      and (
        form.target_grade = 'Semua'
        or form.target_grade = student.grade_level::text
      )
  ),
  questions as (
    select form.id as form_id,
      question.item ->> 'id' as question_id,
      coalesce(question.item ->> 'area', 'Lainnya') as area
    from eligible_forms form
    cross join lateral jsonb_array_elements(form.questions) as question(item)
  ),
  answers as (
    select response.form_id, response.student_id, question.question_id, question.area,
      response.answers ->> question.question_id as answer
    from public.kb_akpd_responses response
    join homeroom_students student on student.id = response.student_id
    join questions question on question.form_id = response.form_id
  )
  select
    answer.area,
    count(distinct answer.student_id),
    count(*) filter (
      where answer.answer is not null
        and answer.answer !~* '\mtidak\M'
        and answer.answer ~* '(\m(sangat\s+)?membutuhkan\M|\mya\M)'
    ),
    count(*) filter (where nullif(btrim(answer.answer), '') is not null),
    round(
      100.0 * count(*) filter (
        where answer.answer is not null
          and answer.answer !~* '\mtidak\M'
          and answer.answer ~* '(\m(sangat\s+)?membutuhkan\M|\mya\M)'
      ) / nullif(count(*) filter (where nullif(btrim(answer.answer), '') is not null), 0),
      1
    )
  from answers answer
  group by answer.area
  order by 5 desc nulls last, 1;
end;
$function$;

create or replace function public.kb_akpd_aggregate_summary(p_form_id uuid default null)
returns table (
  form_id uuid,
  question_id text,
  area text,
  question_text text,
  respondent_count bigint,
  need_count bigint,
  answered_count bigint,
  percentage numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if not public.superapp_has_active_role(array['guru_bk', 'super_admin', 'operator']::text[]) then
    raise exception 'Ringkasan agregat AKPD tidak diizinkan.' using errcode = '42501';
  end if;

  return query
  with questions as (
    select form.id as form_id,
      question.item ->> 'id' as question_id,
      coalesce(question.item ->> 'area', 'Lainnya') as area,
      coalesce(question.item ->> 'text', question.item ->> 'question', '') as question_text
    from public.kb_akpd_forms form
    cross join lateral jsonb_array_elements(form.questions) as question(item)
    where p_form_id is null or form.id = p_form_id
  ),
  answers as (
    select question.form_id, question.question_id, response.student_id,
      response.answers ->> question.question_id as answer
    from questions question
    left join public.kb_akpd_responses response on response.form_id = question.form_id
  )
  select
    question.form_id,
    question.question_id,
    question.area,
    question.question_text,
    count(distinct answer.student_id),
    count(*) filter (
      where answer.answer is not null
        and answer.answer !~* '\mtidak\M'
        and answer.answer ~* '(\m(sangat\s+)?membutuhkan\M|\mya\M)'
    ),
    count(*) filter (where nullif(btrim(answer.answer), '') is not null),
    round(
      100.0 * count(*) filter (
        where answer.answer is not null
          and answer.answer !~* '\mtidak\M'
          and answer.answer ~* '(\m(sangat\s+)?membutuhkan\M|\mya\M)'
      ) / nullif(count(*) filter (where nullif(btrim(answer.answer), '') is not null), 0),
      1
    )
  from questions question
  left join answers answer
    on answer.form_id = question.form_id
    and answer.question_id = question.question_id
  group by question.form_id, question.question_id, question.area, question.question_text
  order by question.form_id, question.area, question.question_text;
end;
$function$;

drop policy if exists kb_akpd_responses_read_scope on public.kb_akpd_responses;
create policy kb_akpd_responses_read_scope
  on public.kb_akpd_responses for select to authenticated
  using (
    public.superapp_has_active_role(array['guru_bk', 'super_admin']::text[])
    or exists (
      select 1 from public.students student
      where student.id = student_id and student.profile_id = auth.uid()
    )
  );

drop policy if exists kb_curhat_threads_read_scope on public.kb_curhat_threads;
create policy kb_curhat_threads_read_scope
  on public.kb_curhat_threads for select to authenticated
  using (
    public.superapp_has_active_role(array['super_admin']::text[])
    or (
      public.superapp_has_active_role(array['siswa']::text[])
      and exists (
        select 1 from public.students student
        where student.id = student_id and student.profile_id = auth.uid()
      )
    )
    or (
      public.superapp_has_active_role(array['guru_bk']::text[])
      and counselor_profile_id = auth.uid()
      and public.kb_bk_is_assigned(student_id)
    )
  );

drop policy if exists kb_curhat_messages_read_scope on public.kb_curhat_messages;
create policy kb_curhat_messages_read_scope
  on public.kb_curhat_messages for select to authenticated
  using (
    public.superapp_has_active_role(array['super_admin']::text[])
    or exists (
      select 1
      from public.kb_curhat_threads thread
      where thread.id = thread_id
        and (
          (
            public.superapp_has_active_role(array['siswa']::text[])
            and exists (
              select 1 from public.students student
              where student.id = thread.student_id and student.profile_id = auth.uid()
            )
          )
          or (
            public.superapp_has_active_role(array['guru_bk']::text[])
            and thread.counselor_profile_id = auth.uid()
            and public.kb_bk_is_assigned(thread.student_id)
          )
        )
    )
  );

revoke all on function public.kb_teacher_student_directory(uuid) from public, anon;
revoke all on function public.kb_create_homeroom_followup(uuid, text, text, text, text, boolean) from public, anon;
revoke all on function public.kb_homeroom_attendance_summary() from public, anon;
revoke all on function public.kb_homeroom_schedule_summary() from public, anon;
revoke all on function public.kb_student_support_schedule() from public, anon;
revoke all on function public.kb_homeroom_akpd_summary() from public, anon;
revoke all on function public.kb_akpd_aggregate_summary(uuid) from public, anon;
grant execute on function public.kb_teacher_student_directory(uuid) to authenticated;
grant execute on function public.kb_create_homeroom_followup(uuid, text, text, text, text, boolean) to authenticated;
grant execute on function public.kb_homeroom_attendance_summary() to authenticated;
grant execute on function public.kb_homeroom_schedule_summary() to authenticated;
grant execute on function public.kb_student_support_schedule() to authenticated;
grant execute on function public.kb_homeroom_akpd_summary() to authenticated;
grant execute on function public.kb_akpd_aggregate_summary(uuid) to authenticated;

revoke all on function public.kb_guard_teacher_referral() from public, anon, authenticated;
revoke all on function public.kb_guard_teacher_appreciation() from public, anon, authenticated;
revoke all on function public.kb_guard_home_visit_collaboration() from public, anon, authenticated;
