update public.students student
set profile_id = candidate.profile_id
from (
  select student.id as student_id, profile.id as profile_id
  from public.students student
  join public.profiles profile
    on btrim(profile.username::text) = btrim(student.nisn::text)
   and profile.role::text = 'siswa'
   and profile.status::text = 'active'
  where student.profile_id is null
    and nullif(btrim(student.nisn::text), '') is not null
    and (
      select count(*)
      from public.students duplicate
      where btrim(duplicate.nisn::text) = btrim(student.nisn::text)
    ) = 1
    and (
      select count(*)
      from public.profiles duplicate
      where btrim(duplicate.username::text) = btrim(profile.username::text)
        and duplicate.role::text = 'siswa'
        and duplicate.status::text = 'active'
    ) = 1
    and not exists (
      select 1
      from public.students linked
      where linked.profile_id = profile.id
    )
) candidate
where student.id = candidate.student_id
  and student.profile_id is null;

drop function if exists public.kb_student_self_context();
create function public.kb_student_self_context()
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
    select student.id::uuid,
      student.profile_id::uuid,
      student.nisn::text,
      student.full_name::text,
      student.status::text,
      student.birth_date::date,
      student.gender::text,
      student.parent_phone::text,
      class.id::uuid,
      class.name::text,
      class.grade_level::integer,
      class.academic_year_id::uuid,
      year.name::text,
      assignment.counselor_profile_id::uuid,
      coalesce(teacher.full_name::text, profile.full_name::text, profile.username::text)::text
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

drop function if exists public.kb_student_service_summary();
create function public.kb_student_service_summary()
returns table (
  curhat_count integer,
  unread_curhat_count integer,
  akpd_completed_count integer,
  consultation_count integer,
  pending_consultation_count integer
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if not public.superapp_has_active_role(array['siswa']::text[]) then
    raise exception 'Akses ringkasan layanan siswa tidak diizinkan.'
      using errcode = '42501';
  end if;

  return query
    select
      (select count(*)::integer
       from public.kb_curhat_threads thread
       where thread.student_id = student.id),
      (select count(*)::integer
       from public.kb_curhat_threads thread
       where thread.student_id = student.id and thread.unread_by_student),
      (select count(distinct response.form_id)::integer
       from public.kb_akpd_responses response
       where response.student_id = student.id),
      (select count(*)::integer
       from public.kb_consultations consultation
       where consultation.student_id = student.id),
      (select count(*)::integer
       from public.kb_consultations consultation
       where consultation.student_id = student.id
         and consultation.status::text in ('Menunggu', 'Terjadwal'))
    from public.students student
    where student.profile_id = auth.uid()
    limit 1;
end;
$function$;
revoke all on function public.kb_student_service_summary() from public, anon;
grant execute on function public.kb_student_service_summary() to authenticated;

drop function if exists public.kb_case_summary();
create function public.kb_case_summary()
returns table (status_kasus text, jumlah bigint)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if not public.superapp_has_active_role(array['super_admin', 'kepala_sekolah']::text[]) then
    raise exception 'Akses ringkasan kasus tidak diizinkan.'
      using errcode = '42501';
  end if;
  return query
    select note.status_kasus::text, count(*)::bigint
    from public.kb_catatan_bk note
    group by note.status_kasus;
end;
$function$;
revoke all on function public.kb_case_summary() from public, anon;
grant execute on function public.kb_case_summary() to authenticated;

drop function if exists public.kb_student_attendance_history(uuid);
create function public.kb_student_attendance_history(p_student_id uuid)
returns table (
  id uuid,
  attendance_date date,
  session_type text,
  subject text,
  status text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_student_nisn text;
begin
  if not (
    public.superapp_has_active_role(array['super_admin', 'operator', 'kepala_sekolah']::text[])
    or (
      public.superapp_has_active_role(array['guru_bk']::text[])
      and exists (
        select 1
        from public.attendance_bk_assignments assignment
        where assignment.student_id = p_student_id
          and assignment.counselor_profile_id = auth.uid()
      )
    )
  ) then
    raise exception 'Akses riwayat absensi siswa tidak diizinkan.'
      using errcode = '42501';
  end if;

  select btrim(student.nisn::text)
  into v_student_nisn
  from public.students student
  where student.id = p_student_id;

  if v_student_nisn is null then
    raise exception 'Siswa tidak ditemukan.';
  end if;

  return query
    select record.id::uuid,
      record.attendance_date::date,
      record.session_type::text,
      record.subject::text,
      record.status::text,
      record.created_at::timestamptz
    from public.attendance_qr_records record
    where btrim(record.person_identifier::text) = v_student_nisn
    order by record.attendance_date desc, record.created_at desc
    limit 100;
end;
$function$;
revoke all on function public.kb_student_attendance_history(uuid) from public, anon;
grant execute on function public.kb_student_attendance_history(uuid) to authenticated;

do $migration$
declare
  existing_policy record;
begin
  for existing_policy in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'attendance_bk_assignments'
  loop
    execute format('drop policy %I on public.attendance_bk_assignments', existing_policy.policyname);
  end loop;
end
$migration$;

create policy attendance_bk_assignments_read_scope
  on public.attendance_bk_assignments
  for select to authenticated
  using (public.superapp_has_active_role(array['super_admin', 'operator', 'guru_bk']::text[]));

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
        and counselor.status::text = 'active'
        and counselor.role::text = 'guru_bk'
    )
  );

do $migration$
declare
  existing_policy record;
begin
  if to_regclass('public.kb_jadwal_bk') is null then
    return;
  end if;

  alter table public.kb_jadwal_bk enable row level security;
  revoke all on public.kb_jadwal_bk from public, anon, authenticated;
  grant select, insert, update, delete on public.kb_jadwal_bk to authenticated;

  for existing_policy in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'kb_jadwal_bk'
  loop
    execute format('drop policy %I on public.kb_jadwal_bk', existing_policy.policyname);
  end loop;

  create policy kb_jadwal_bk_staff_scope
    on public.kb_jadwal_bk
    for all to authenticated
    using (
      public.superapp_has_active_role(array['super_admin', 'operator']::text[])
      or (
        public.superapp_has_active_role(array['guru_bk']::text[])
        and (
          (student_id is not null and public.kb_bk_is_assigned(student_id))
          or (student_id is null and created_by = auth.uid())
        )
      )
    )
    with check (
      public.superapp_has_active_role(array['super_admin', 'operator']::text[])
      or (
        public.superapp_has_active_role(array['guru_bk']::text[])
        and (
          (student_id is not null and public.kb_bk_is_assigned(student_id))
          or (student_id is null and created_by = auth.uid())
        )
      )
    );
end
$migration$;
