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
  on public.attendance_teacher_subject_assignments
  to authenticated;

drop policy if exists attendance_teacher_subject_assignments_admin_all
  on public.attendance_teacher_subject_assignments;
create policy attendance_teacher_subject_assignments_admin_all
  on public.attendance_teacher_subject_assignments
  for all to authenticated
  using (
    public.has_active_role(array[
      'super_admin'::public.app_role,
      'operator'::public.app_role
    ])
  )
  with check (
    public.has_active_role(array[
      'super_admin'::public.app_role,
      'operator'::public.app_role
    ])
  );

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

drop function if exists public.create_attendance_qr_session(text, text, text);

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

revoke all on function public.create_attendance_qr_session(text, text, uuid)
  from public, anon;
grant execute on function public.create_attendance_qr_session(text, text, uuid)
  to authenticated;
