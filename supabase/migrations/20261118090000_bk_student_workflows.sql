create or replace function public.kb_bk_is_assigned(p_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.attendance_bk_assignments assignment
    where assignment.student_id = p_student_id
      and assignment.counselor_profile_id = auth.uid()
  );
$function$;

revoke all on function public.kb_bk_is_assigned(uuid) from public, anon;
grant execute on function public.kb_bk_is_assigned(uuid) to authenticated;

create or replace function public.kb_student_self_context()
returns table (
  id uuid,
  profile_id uuid,
  nisn text,
  full_name text,
  status text,
  birth_date date,
  gender text,
  parent_phone text,
  class_id uuid,
  class_name text,
  grade_level integer,
  academic_year_id uuid,
  academic_year text,
  counselor_profile_id uuid,
  counselor_name text
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if not public.superapp_has_active_role(array['siswa']::text[]) then
    raise exception 'Akses identitas siswa tidak diizinkan.'
      using errcode = '42501';
  end if;

  return query
    select student.id,
      student.profile_id,
      student.nisn,
      student.full_name,
      student.status::text,
      student.birth_date,
      student.gender,
      student.parent_phone,
      class.id,
      class.name,
      class.grade_level,
      class.academic_year_id,
      year.name,
      assignment.counselor_profile_id,
      coalesce(teacher.full_name, profile.full_name, profile.username)
    from public.students student
    left join public.classes class on class.id = student.class_id
    left join public.academic_years year on year.id = class.academic_year_id
    left join public.attendance_bk_assignments assignment on assignment.student_id = student.id
    left join public.teachers teacher on teacher.profile_id = assignment.counselor_profile_id
    left join public.profiles profile on profile.id = assignment.counselor_profile_id
    where student.profile_id = auth.uid()
    limit 1;
end;
$function$;

revoke all on function public.kb_student_self_context() from public, anon;
grant execute on function public.kb_student_self_context() to authenticated;

create table if not exists public.kb_student_profiles (
  student_id uuid primary key references public.students(id) on delete cascade,
  home_address text not null default '',
  guardian_name text not null default '',
  guardian_occupation text not null default '',
  talents text not null default '',
  career_plan text not null default '',
  health_notes text not null default '',
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.kb_student_profiles enable row level security;
revoke all on public.kb_student_profiles from public, anon, authenticated;
grant select, insert, update on public.kb_student_profiles to authenticated;

drop policy if exists kb_student_profiles_read_scope on public.kb_student_profiles;
create policy kb_student_profiles_read_scope
  on public.kb_student_profiles
  for select to authenticated
  using (
    public.superapp_has_active_role(array['super_admin']::text[])
    or (
      public.superapp_has_active_role(array['guru_bk']::text[])
      and public.kb_bk_is_assigned(student_id)
    )
  );

drop policy if exists kb_student_profiles_write_scope on public.kb_student_profiles;
create policy kb_student_profiles_write_scope
  on public.kb_student_profiles
  for all to authenticated
  using (
    public.superapp_has_active_role(array['super_admin']::text[])
    or (
      public.superapp_has_active_role(array['guru_bk']::text[])
      and public.kb_bk_is_assigned(student_id)
    )
  )
  with check (
    (
      public.superapp_has_active_role(array['super_admin']::text[])
      or (
        public.superapp_has_active_role(array['guru_bk']::text[])
        and public.kb_bk_is_assigned(student_id)
      )
    )
    and (updated_by is null or updated_by = auth.uid())
  );

create table if not exists public.kb_curhat_threads (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  counselor_profile_id uuid not null references public.profiles(id) on delete restrict,
  subject text not null check (length(btrim(subject)) between 1 and 150),
  category text not null check (category in ('Pribadi', 'Pertemanan/Bullying', 'Belajar', 'Keluarga', 'Lainnya')),
  urgency text not null default 'Normal' check (urgency in ('Normal', 'Perlu segera', 'Darurat')),
  status text not null default 'Baru' check (status in ('Baru', 'Dibaca', 'Ditindaklanjuti', 'Selesai')),
  request_consultation boolean not null default false,
  unread_by_counselor boolean not null default true,
  unread_by_student boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.kb_curhat_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.kb_curhat_threads(id) on delete cascade,
  author_profile_id uuid not null default auth.uid() references public.profiles(id) on delete restrict,
  message text not null check (length(btrim(message)) between 1 and 10000),
  created_at timestamptz not null default now()
);

create index if not exists kb_curhat_threads_counselor_unread_idx
  on public.kb_curhat_threads (counselor_profile_id, unread_by_counselor, created_at desc);
create index if not exists kb_curhat_threads_student_idx
  on public.kb_curhat_threads (student_id, created_at desc);
create index if not exists kb_curhat_messages_thread_created_idx
  on public.kb_curhat_messages (thread_id, created_at);

alter table public.kb_curhat_threads enable row level security;
alter table public.kb_curhat_messages enable row level security;
revoke all on public.kb_curhat_threads, public.kb_curhat_messages from public, anon, authenticated;
grant select, insert, update on public.kb_curhat_threads to authenticated;
grant select, insert on public.kb_curhat_messages to authenticated;

create or replace function public.kb_create_curhat_thread(
  p_student_id uuid,
  p_counselor_profile_id uuid,
  p_subject text,
  p_category text,
  p_urgency text,
  p_body text,
  p_request_consultation boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_thread_id uuid;
begin
  if not public.superapp_has_active_role(array['siswa']::text[])
     or not exists (
       select 1 from public.students student
       where student.id = p_student_id and student.profile_id = auth.uid()
     )
     or p_counselor_profile_id is distinct from public.kb_assigned_counselor_id(p_student_id)
  then
    raise exception 'Curhat hanya dapat dikirim kepada Guru BK pengasuh Anda.'
      using errcode = '42501';
  end if;

  insert into public.kb_curhat_threads (
    student_id, counselor_profile_id, subject, category, urgency, request_consultation
  )
  values (
    p_student_id, p_counselor_profile_id, btrim(p_subject), p_category, p_urgency,
    coalesce(p_request_consultation, false)
  )
  returning id into v_thread_id;

  insert into public.kb_curhat_messages (thread_id, author_profile_id, message)
  values (v_thread_id, auth.uid(), btrim(p_body));

  if coalesce(p_request_consultation, false) then
    insert into public.kb_consultations (
      student_id, class_id, requester_profile_id, requester_name, topic,
      counselor_profile_id, status, source_curhat_thread_id, created_by
    )
    select student.id, student.class_id, auth.uid(), student.full_name,
      'Konsultasi dari curhat: ' || btrim(p_subject), p_counselor_profile_id,
      'Menunggu', v_thread_id, auth.uid()
    from public.students student
    where student.id = p_student_id;
  end if;

  return v_thread_id;
end;
$function$;

revoke all on function public.kb_create_curhat_thread(uuid, uuid, text, text, text, text, boolean) from public, anon;
grant execute on function public.kb_create_curhat_thread(uuid, uuid, text, text, text, text, boolean) to authenticated;

create or replace function public.kb_assigned_counselor_id(p_student_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_counselor_id uuid;
begin
  if auth.uid() is null then
    return null;
  end if;
  if public.superapp_has_active_role(array['guru_bk', 'super_admin', 'operator']::text[])
     or exists (
       select 1 from public.students student
       where student.id = p_student_id and student.profile_id = auth.uid()
     )
  then
    select assignment.counselor_profile_id
    into v_counselor_id
    from public.attendance_bk_assignments assignment
    where assignment.student_id = p_student_id;
  end if;
  return v_counselor_id;
end;
$function$;

revoke all on function public.kb_assigned_counselor_id(uuid) from public, anon;
grant execute on function public.kb_assigned_counselor_id(uuid) to authenticated;

drop policy if exists kb_curhat_threads_read_scope on public.kb_curhat_threads;
create policy kb_curhat_threads_read_scope
  on public.kb_curhat_threads
  for select to authenticated
  using (
    (
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

drop policy if exists kb_curhat_threads_insert_student on public.kb_curhat_threads;
create policy kb_curhat_threads_insert_student
  on public.kb_curhat_threads
  for insert to authenticated
  with check (
    public.superapp_has_active_role(array['siswa']::text[])
    and exists (
      select 1 from public.students student
      where student.id = student_id and student.profile_id = auth.uid()
    )
    and counselor_profile_id = public.kb_assigned_counselor_id(student_id)
  );

drop policy if exists kb_curhat_threads_update_scope on public.kb_curhat_threads;
create policy kb_curhat_threads_update_scope
  on public.kb_curhat_threads
  for update to authenticated
  using (
    (
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
  )
  with check (
    (
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

create or replace function public.kb_guard_curhat_thread_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  if pg_trigger_depth() > 1 then
    return new;
  end if;

  if new.student_id is distinct from old.student_id
     or new.counselor_profile_id is distinct from old.counselor_profile_id
     or new.subject is distinct from old.subject
     or new.category is distinct from old.category
     or new.urgency is distinct from old.urgency
     or new.request_consultation is distinct from old.request_consultation
  then
    raise exception 'Identitas dan isi awal curhat tidak dapat diubah.'
      using errcode = '42501';
  end if;

  if public.superapp_has_active_role(array['siswa']::text[])
     and (new.status is distinct from old.status
       or new.unread_by_counselor is distinct from old.unread_by_counselor)
  then
    raise exception 'Siswa hanya dapat memperbarui status baca sendiri.'
      using errcode = '42501';
  end if;

  if public.superapp_has_active_role(array['guru_bk']::text[])
     and new.unread_by_student is distinct from old.unread_by_student
  then
    raise exception 'Guru BK tidak dapat mengubah status baca siswa.'
      using errcode = '42501';
  end if;

  new.updated_at := now();
  return new;
end;
$function$;

drop trigger if exists kb_curhat_thread_update_guard on public.kb_curhat_threads;
create trigger kb_curhat_thread_update_guard
  before update on public.kb_curhat_threads
  for each row execute function public.kb_guard_curhat_thread_update();

drop policy if exists kb_curhat_messages_read_scope on public.kb_curhat_messages;
create policy kb_curhat_messages_read_scope
  on public.kb_curhat_messages
  for select to authenticated
  using (
    exists (
      select 1 from public.kb_curhat_threads thread
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

drop policy if exists kb_curhat_messages_insert_scope on public.kb_curhat_messages;
create policy kb_curhat_messages_insert_scope
  on public.kb_curhat_messages
  for insert to authenticated
  with check (
    author_profile_id = auth.uid()
    and exists (
      select 1 from public.kb_curhat_threads thread
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

create or replace function public.kb_curhat_message_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_thread public.kb_curhat_threads%rowtype;
begin
  select * into v_thread
  from public.kb_curhat_threads thread
  where thread.id = new.thread_id;

  if exists (
    select 1
    from public.students student
    where student.id = v_thread.student_id
      and student.profile_id = new.author_profile_id
  ) then
    update public.kb_curhat_threads
      set unread_by_counselor = true, status = case when status = 'Selesai' then status else 'Baru' end
      where id = new.thread_id;
  else
    update public.kb_curhat_threads set unread_by_student = true where id = new.thread_id;
  end if;
  return new;
end;
$function$;

drop trigger if exists kb_curhat_message_notify_trigger on public.kb_curhat_messages;
create trigger kb_curhat_message_notify_trigger
  after insert on public.kb_curhat_messages
  for each row execute function public.kb_curhat_message_notify();

create table if not exists public.kb_consultations (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  class_id uuid references public.classes(id) on delete set null,
  requester_profile_id uuid references public.profiles(id) on delete set null,
  requester_name text not null default '',
  topic text not null,
  scheduled_date date,
  start_time time,
  end_time time,
  counselor_profile_id uuid not null references public.profiles(id) on delete restrict,
  status text not null default 'Menunggu' check (status in ('Menunggu', 'Terjadwal', 'Selesai')),
  outcome_summary text,
  follow_up text,
  source_curhat_thread_id uuid references public.kb_curhat_threads(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint kb_consultations_curhat_source_key unique (source_curhat_thread_id)
);

create index if not exists kb_consultations_counselor_date_idx
  on public.kb_consultations (counselor_profile_id, scheduled_date desc);
create index if not exists kb_consultations_student_date_idx
  on public.kb_consultations (student_id, created_at desc);

alter table public.kb_consultations enable row level security;
revoke all on public.kb_consultations from public, anon, authenticated;
grant select, insert, update on public.kb_consultations to authenticated;

drop policy if exists kb_consultations_read_scope on public.kb_consultations;
create policy kb_consultations_read_scope
  on public.kb_consultations
  for select to authenticated
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

drop policy if exists kb_consultations_insert_scope on public.kb_consultations;
create policy kb_consultations_insert_scope
  on public.kb_consultations
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and (
      (
        public.superapp_has_active_role(array['siswa']::text[])
        and exists (
          select 1 from public.students student
          where student.id = student_id
            and student.profile_id = auth.uid()
            and counselor_profile_id = public.kb_assigned_counselor_id(student_id)
        )
        and requester_profile_id = auth.uid()
        and status = 'Menunggu'
        and outcome_summary is null
        and follow_up is null
      )
      or (
        public.superapp_has_active_role(array['guru_bk']::text[])
        and counselor_profile_id = auth.uid()
        and public.kb_bk_is_assigned(student_id)
      )
      or public.superapp_has_active_role(array['super_admin']::text[])
    )
  );

drop policy if exists kb_consultations_update_scope on public.kb_consultations;
create policy kb_consultations_update_scope
  on public.kb_consultations
  for update to authenticated
  using (
    public.superapp_has_active_role(array['super_admin']::text[])
    or (
      public.superapp_has_active_role(array['guru_bk']::text[])
      and counselor_profile_id = auth.uid()
      and public.kb_bk_is_assigned(student_id)
    )
  )
  with check (
    public.superapp_has_active_role(array['super_admin']::text[])
    or (
      public.superapp_has_active_role(array['guru_bk']::text[])
      and counselor_profile_id = auth.uid()
      and public.kb_bk_is_assigned(student_id)
    )
  );

create table if not exists public.kb_home_visits (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  class_id uuid references public.classes(id) on delete set null,
  academic_year_id uuid references public.academic_years(id) on delete set null,
  semester smallint check (semester is null or semester in (1, 2)),
  visit_date date not null,
  visit_time time,
  address text not null,
  people_met text not null check (people_met in ('Ayah', 'Ibu', 'Wali')),
  counselor_profile_id uuid not null references public.profiles(id) on delete restrict,
  purpose text not null,
  observations text not null default '',
  agreement_follow_up text not null default '',
  auto_agenda boolean not null default true,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists kb_home_visits_student_date_idx
  on public.kb_home_visits (student_id, visit_date desc);
create index if not exists kb_home_visits_counselor_date_idx
  on public.kb_home_visits (counselor_profile_id, visit_date desc);

alter table public.kb_home_visits enable row level security;
revoke all on public.kb_home_visits from public, anon, authenticated;
grant select, insert, update on public.kb_home_visits to authenticated;

drop policy if exists kb_home_visits_read_scope on public.kb_home_visits;
create policy kb_home_visits_read_scope
  on public.kb_home_visits
  for select to authenticated
  using (
    public.superapp_has_active_role(array['super_admin']::text[])
    or (
      public.superapp_has_active_role(array['guru_bk']::text[])
      and counselor_profile_id = auth.uid()
      and public.kb_bk_is_assigned(student_id)
    )
  );

drop policy if exists kb_home_visits_insert_scope on public.kb_home_visits;
create policy kb_home_visits_insert_scope
  on public.kb_home_visits
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and (
      public.superapp_has_active_role(array['super_admin']::text[])
      or (
        public.superapp_has_active_role(array['guru_bk']::text[])
        and counselor_profile_id = auth.uid()
        and public.kb_bk_is_assigned(student_id)
      )
    )
  );

drop policy if exists kb_home_visits_update_scope on public.kb_home_visits;
create policy kb_home_visits_update_scope
  on public.kb_home_visits
  for update to authenticated
  using (
    public.superapp_has_active_role(array['super_admin']::text[])
    or (
      public.superapp_has_active_role(array['guru_bk']::text[])
      and counselor_profile_id = auth.uid()
      and public.kb_bk_is_assigned(student_id)
    )
  )
  with check (
    public.superapp_has_active_role(array['super_admin']::text[])
    or (
      public.superapp_has_active_role(array['guru_bk']::text[])
      and counselor_profile_id = auth.uid()
      and public.kb_bk_is_assigned(student_id)
    )
  );

create table if not exists public.kb_rpl (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  academic_year_id uuid references public.academic_years(id) on delete set null,
  target_class text not null default '',
  service_area text not null check (service_area in ('Pribadi', 'Sosial', 'Belajar', 'Karir')),
  content jsonb not null default '{}'::jsonb check (jsonb_typeof(content) = 'object'),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.kb_rpl enable row level security;
revoke all on public.kb_rpl from public, anon, authenticated;
grant select, insert, update on public.kb_rpl to authenticated;

drop policy if exists kb_rpl_staff_scope on public.kb_rpl;
create policy kb_rpl_staff_scope
  on public.kb_rpl
  for all to authenticated
  using (public.superapp_has_active_role(array['guru_bk', 'super_admin', 'operator']::text[]))
  with check (
    public.superapp_has_active_role(array['guru_bk', 'super_admin', 'operator']::text[])
  );

create table if not exists public.kb_akpd_forms (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  academic_year_id uuid not null references public.academic_years(id) on delete restrict,
  target_grade text not null check (target_grade in ('10', '11', '12', 'Semua')),
  questions jsonb not null default '[]'::jsonb check (jsonb_typeof(questions) = 'array'),
  is_active boolean not null default false,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.kb_akpd_responses (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references public.kb_akpd_forms(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  answers jsonb not null default '{}'::jsonb check (jsonb_typeof(answers) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint kb_akpd_responses_form_student_key unique (form_id, student_id)
);

create index if not exists kb_akpd_forms_active_year_idx
  on public.kb_akpd_forms (is_active, academic_year_id, target_grade);
create index if not exists kb_akpd_responses_form_idx
  on public.kb_akpd_responses (form_id, created_at desc);

alter table public.kb_akpd_forms enable row level security;
alter table public.kb_akpd_responses enable row level security;
revoke all on public.kb_akpd_forms, public.kb_akpd_responses from public, anon, authenticated;
grant select, insert, update on public.kb_akpd_forms to authenticated;
grant select, insert, update on public.kb_akpd_responses to authenticated;

create or replace function public.kb_student_akpd_target(p_form_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.kb_akpd_forms form
    join public.students student on student.profile_id = auth.uid()
    left join public.classes class on class.id = student.class_id
    where form.id = p_form_id
      and form.is_active
      and form.academic_year_id = class.academic_year_id
      and (
        form.target_grade = 'Semua'
        or form.target_grade = class.grade_level::text
      )
      and public.superapp_has_active_role(array['siswa']::text[])
  );
$function$;

revoke all on function public.kb_student_akpd_target(uuid) from public, anon;
grant execute on function public.kb_student_akpd_target(uuid) to authenticated;

drop policy if exists kb_akpd_forms_read_scope on public.kb_akpd_forms;
create policy kb_akpd_forms_read_scope
  on public.kb_akpd_forms
  for select to authenticated
  using (
    public.superapp_has_active_role(array['guru_bk', 'super_admin', 'operator']::text[])
    or public.kb_student_akpd_target(id)
  );

drop policy if exists kb_akpd_forms_write_scope on public.kb_akpd_forms;
create policy kb_akpd_forms_write_scope
  on public.kb_akpd_forms
  for insert to authenticated
  with check (
    public.superapp_has_active_role(array['guru_bk', 'super_admin', 'operator']::text[])
    and (created_by is null or created_by = auth.uid())
  );
drop policy if exists kb_akpd_forms_update_scope on public.kb_akpd_forms;
create policy kb_akpd_forms_update_scope
  on public.kb_akpd_forms
  for update to authenticated
  using (public.superapp_has_active_role(array['guru_bk', 'super_admin', 'operator']::text[]))
  with check (public.superapp_has_active_role(array['guru_bk', 'super_admin', 'operator']::text[]));

drop policy if exists kb_akpd_responses_read_scope on public.kb_akpd_responses;
create policy kb_akpd_responses_read_scope
  on public.kb_akpd_responses
  for select to authenticated
  using (
    public.superapp_has_active_role(array['guru_bk', 'super_admin', 'operator']::text[])
    or exists (
      select 1 from public.students student
      where student.id = student_id and student.profile_id = auth.uid()
    )
  );

drop policy if exists kb_akpd_responses_insert_scope on public.kb_akpd_responses;
create policy kb_akpd_responses_insert_scope
  on public.kb_akpd_responses
  for insert to authenticated
  with check (
    exists (
      select 1 from public.students student
      where student.id = student_id and student.profile_id = auth.uid()
    )
    and public.kb_student_akpd_target(form_id)
  );

drop policy if exists kb_akpd_responses_update_scope on public.kb_akpd_responses;
create policy kb_akpd_responses_update_scope
  on public.kb_akpd_responses
  for update to authenticated
  using (
    exists (
      select 1 from public.students student
      where student.id = student_id and student.profile_id = auth.uid()
    )
    and public.kb_student_akpd_target(form_id)
  )
  with check (
    exists (
      select 1 from public.students student
      where student.id = student_id and student.profile_id = auth.uid()
    )
    and public.kb_student_akpd_target(form_id)
  );

create or replace function public.kb_sync_consultation_to_agenda()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_student public.students%rowtype;
begin
  if new.status <> 'Selesai' then
    return new;
  end if;

  select * into v_student from public.students student where student.id = new.student_id;
  if not found then
    raise exception 'Siswa konsultasi tidak ditemukan.';
  end if;

  insert into public.kb_catatan_bk (
    student_id, class_id, counselor_profile_id, academic_year_id, semester,
    tanggal, waktu_mulai, waktu_selesai, target_type, sasaran, bidang_layanan,
    jenis_layanan, ringkasan, hasil_dicapai, tindak_lanjut, status_kasus,
    source_consultation_id, created_by, nama_siswa, kelas
  )
  select
    new.student_id, new.class_id, new.counselor_profile_id, class.academic_year_id,
    case when extract(month from new.scheduled_date) >= 7 then 1 else 2 end,
    coalesce(new.scheduled_date, current_date), new.start_time, new.end_time,
    'Siswa', v_student.full_name, 'Pribadi', 'Konsultasi', new.topic,
    new.outcome_summary, new.follow_up, 'Selesai', new.id, coalesce(new.created_by, auth.uid()),
    v_student.full_name, class.name
  from (select 1) singleton
  left join public.classes class on class.id = v_student.class_id
  on conflict (source_consultation_id) where source_consultation_id is not null
  do update set
    tanggal = excluded.tanggal,
    waktu_mulai = excluded.waktu_mulai,
    waktu_selesai = excluded.waktu_selesai,
    ringkasan = excluded.ringkasan,
    hasil_dicapai = excluded.hasil_dicapai,
    tindak_lanjut = excluded.tindak_lanjut,
    status_kasus = 'Selesai',
    updated_at = now();

  return new;
end;
$function$;

create or replace function public.kb_sync_home_visit_to_agenda()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_student public.students%rowtype;
begin
  if not new.auto_agenda then
    return new;
  end if;

  select * into v_student from public.students student where student.id = new.student_id;
  if not found then
    raise exception 'Siswa kunjungan rumah tidak ditemukan.';
  end if;

  insert into public.kb_catatan_bk (
    student_id, class_id, counselor_profile_id, academic_year_id, semester, tanggal, waktu_mulai,
    target_type, sasaran, bidang_layanan, jenis_layanan, ringkasan,
    hasil_dicapai, tindak_lanjut, status_kasus, source_home_visit_id,
    created_by, nama_siswa, kelas
  )
  select
    new.student_id, new.class_id, new.counselor_profile_id, new.academic_year_id, new.semester, new.visit_date,
    new.visit_time, 'Siswa', v_student.full_name, 'Sosial', 'Kunjungan Rumah',
    new.purpose, new.observations,
    concat_ws(E'\n', nullif(new.agreement_follow_up, ''), 'Pihak ditemui: ' || new.people_met),
    'Terbuka', new.id, coalesce(new.created_by, auth.uid()), v_student.full_name, class.name
  from (select 1) singleton
  left join public.classes class on class.id = v_student.class_id
  on conflict (source_home_visit_id) where source_home_visit_id is not null
  do update set
    tanggal = excluded.tanggal,
    waktu_mulai = excluded.waktu_mulai,
    ringkasan = excluded.ringkasan,
    hasil_dicapai = excluded.hasil_dicapai,
    tindak_lanjut = excluded.tindak_lanjut,
    updated_at = now();

  return new;
end;
$function$;

alter table public.kb_catatan_bk
  add column if not exists target_type text not null default 'Siswa',
  add column if not exists sasaran text not null default '',
  add column if not exists waktu_mulai time,
  add column if not exists waktu_selesai time,
  add column if not exists hasil_dicapai text,
  add column if not exists catatan_rahasia text,
  add column if not exists source_consultation_id uuid references public.kb_consultations(id) on delete set null,
  add column if not exists source_home_visit_id uuid references public.kb_home_visits(id) on delete set null;

drop index if exists public.kb_catatan_bk_source_consultation_uidx;
create unique index kb_catatan_bk_source_consultation_uidx
  on public.kb_catatan_bk (source_consultation_id)
  where source_consultation_id is not null;
drop index if exists public.kb_catatan_bk_source_home_visit_uidx;
create unique index kb_catatan_bk_source_home_visit_uidx
  on public.kb_catatan_bk (source_home_visit_id)
  where source_home_visit_id is not null;

alter table public.kb_catatan_bk
  drop constraint if exists kb_catatan_bk_jenis_layanan_check,
  drop constraint if exists kb_catatan_bk_status_kasus_check,
  drop constraint if exists kb_catatan_bk_target_type_check;
alter table public.kb_catatan_bk
  add constraint kb_catatan_bk_jenis_layanan_check
    check (jenis_layanan is null or jenis_layanan in (
      'Konseling Individu', 'Konseling Kelompok', 'Bimbingan Klasikal',
      'Bimbingan Kelompok', 'Konsultasi', 'Mediasi', 'Kunjungan Rumah',
      'Alih Tangan Kasus', 'Layanan Informasi', 'Home Visit',
      'Konferensi Kasus', 'Panggilan Orang Tua', 'Pemanggilan Orang Tua'
    )) not valid,
  add constraint kb_catatan_bk_status_kasus_check
    check (status_kasus is null or status_kasus in ('Terbuka', 'Dalam Proses', 'Dalam Pendampingan', 'Selesai')) not valid,
  add constraint kb_catatan_bk_target_type_check
    check (target_type in ('Siswa', 'Kelas', 'Orang Tua / Wali', 'Umum')) not valid;

alter table public.kb_catatan_bk enable row level security;
revoke all on public.kb_catatan_bk from public, anon, authenticated;
grant select, insert, update, delete on public.kb_catatan_bk to authenticated;

do $migration$
declare
  existing_policy record;
begin
  for existing_policy in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'kb_catatan_bk'
  loop
    execute format('drop policy %I on public.kb_catatan_bk', existing_policy.policyname);
  end loop;
end
$migration$;

create policy kb_catatan_bk_read_private
  on public.kb_catatan_bk
  for select to authenticated
  using (
    public.superapp_has_active_role(array['super_admin']::text[])
    or (
      public.superapp_has_active_role(array['guru_bk']::text[])
      and (
        (student_id is not null and public.kb_bk_is_assigned(student_id))
        or (student_id is null and created_by = auth.uid())
      )
    )
  );

create policy kb_catatan_bk_insert_private
  on public.kb_catatan_bk
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and (
      public.superapp_has_active_role(array['super_admin']::text[])
      or (
        public.superapp_has_active_role(array['guru_bk']::text[])
        and (
          (student_id is not null and public.kb_bk_is_assigned(student_id))
          or (student_id is null and created_by = auth.uid())
        )
      )
    )
  );

create policy kb_catatan_bk_update_private
  on public.kb_catatan_bk
  for update to authenticated
  using (
    public.superapp_has_active_role(array['super_admin']::text[])
    or (
      public.superapp_has_active_role(array['guru_bk']::text[])
      and (
        (student_id is not null and public.kb_bk_is_assigned(student_id))
        or (student_id is null and created_by = auth.uid())
      )
    )
  )
  with check (
    public.superapp_has_active_role(array['super_admin']::text[])
    or (
      public.superapp_has_active_role(array['guru_bk']::text[])
      and (
        (student_id is not null and public.kb_bk_is_assigned(student_id))
        or (student_id is null and created_by = auth.uid())
      )
    )
  );

create policy kb_catatan_bk_delete_private
  on public.kb_catatan_bk
  for delete to authenticated
  using (
    public.superapp_has_active_role(array['super_admin']::text[])
    or (
      public.superapp_has_active_role(array['guru_bk']::text[])
      and (
        (student_id is not null and public.kb_bk_is_assigned(student_id))
        or (student_id is null and created_by = auth.uid())
      )
    )
  );

drop trigger if exists kb_consultation_agenda_sync on public.kb_consultations;
create trigger kb_consultation_agenda_sync
  after insert or update of status, scheduled_date, start_time, end_time, outcome_summary, follow_up
  on public.kb_consultations
  for each row execute function public.kb_sync_consultation_to_agenda();

drop trigger if exists kb_home_visit_agenda_sync on public.kb_home_visits;
create trigger kb_home_visit_agenda_sync
  after insert or update of auto_agenda, visit_date, visit_time, purpose, observations, agreement_follow_up
  on public.kb_home_visits
  for each row execute function public.kb_sync_home_visit_to_agenda();

revoke all on function public.kb_sync_consultation_to_agenda() from public, anon, authenticated;
revoke all on function public.kb_sync_home_visit_to_agenda() from public, anon, authenticated;
revoke all on function public.kb_guard_curhat_thread_update() from public, anon, authenticated;
revoke all on function public.kb_curhat_message_notify() from public, anon, authenticated;
