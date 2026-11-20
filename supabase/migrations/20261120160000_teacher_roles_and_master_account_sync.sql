alter type public.app_role add value if not exists 'bendahara';

alter table public.teachers
  add column if not exists staff_category text,
  add column if not exists primary_role text,
  add column if not exists additional_roles text[] not null default '{}'::text[],
  add column if not exists bk_class_ids uuid[] not null default '{}'::uuid[];

update public.teachers teacher
set staff_category = case
      when coalesce(teacher.employment_status, '') ilike '%wakasek%'
        or coalesce(teacher.employment_status, '') ilike '%guru%'
        then 'Guru'
      else 'Tenaga Kependidikan'
    end,
    primary_role = case
      when coalesce(teacher.employment_status, '') ilike '%guru bk%'
        or coalesce(teacher.employment_status, '') ilike '%konselor%'
        then 'Guru BK'
      when coalesce(teacher.employment_status, '') ilike '%kepala sekolah%'
        then 'Kepala Sekolah'
      when coalesce(teacher.employment_status, '') ilike '%kepala tata usaha%'
        then 'Kepala Tata Usaha'
      when coalesce(teacher.employment_status, '') ilike '%staff tata usaha%'
        then 'Staff Tata Usaha'
      when coalesce(teacher.employment_status, '') ilike '%bendahara%'
        then 'Bendahara Pengeluaran'
      when coalesce(teacher.employment_status, '') ilike '%operator%'
        then 'Operator Sekolah'
      when coalesce(teacher.employment_status, '') ilike '%tendik%'
        or coalesce(teacher.employment_status, '') ilike '%tenaga kependidikan%'
        then 'Tendik Lainnya'
      else 'Guru Mata Pelajaran'
    end,
    additional_roles = case
      when coalesce(teacher.employment_status, '') ilike '%wakasek%'
        then array[teacher.employment_status]
      else '{}'::text[]
    end
where teacher.primary_role is null;

update public.teachers
set staff_category = coalesce(
      staff_category,
      case when primary_role ilike '%guru%' then 'Guru' else 'Tenaga Kependidikan' end
    ),
    primary_role = coalesce(nullif(btrim(primary_role), ''), 'Guru Mata Pelajaran'),
    additional_roles = coalesce(additional_roles, '{}'::text[]),
    bk_class_ids = coalesce(bk_class_ids, '{}'::uuid[]);

update public.teachers
set employment_status = primary_role
where nullif(btrim(employment_status), '') is null
  and primary_role is not null;

update public.students student
set profile_id = profile.id
from public.profiles profile
where student.profile_id is null
  and profile.role::text = 'siswa'
  and nullif(btrim(student.nisn::text), '') is not null
  and btrim(profile.username::text) = btrim(student.nisn::text)
  and (
    select count(*)
    from public.students duplicate
    where btrim(duplicate.nisn::text) = btrim(student.nisn::text)
  ) = 1
  and (
    select count(*)
    from public.profiles duplicate
    where duplicate.role::text = 'siswa'
      and btrim(duplicate.username::text) = btrim(student.nisn::text)
  ) = 1
  and not exists (
    select 1
    from public.students linked
    where linked.profile_id = profile.id
  );

with duplicate_homeroom_assignments as (
  select homeroom_teacher_id
  from public.classes
  where homeroom_teacher_id is not null
  group by homeroom_teacher_id
  having count(*) > 1
)
update public.classes class
set homeroom_teacher_id = null
where class.homeroom_teacher_id in (
  select duplicate.homeroom_teacher_id
  from duplicate_homeroom_assignments duplicate
);

create unique index if not exists classes_single_homeroom_teacher_idx
  on public.classes (homeroom_teacher_id)
  where homeroom_teacher_id is not null;

create or replace function public.sync_teacher_homeroom_roles()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_teacher_id uuid;
begin
  if tg_op = 'UPDATE' and old.homeroom_teacher_id is not null
    and old.homeroom_teacher_id is distinct from new.homeroom_teacher_id then
    update public.teachers teacher
    set additional_roles = array_remove(coalesce(teacher.additional_roles, '{}'::text[]), 'Wali Kelas')
    where teacher.profile_id = old.homeroom_teacher_id
      and not exists (
        select 1
        from public.classes class
        where class.homeroom_teacher_id = old.homeroom_teacher_id
          and class.id <> old.id
      );
  end if;

  if new.homeroom_teacher_id is not null
    and (tg_op = 'INSERT' or old.homeroom_teacher_id is distinct from new.homeroom_teacher_id) then
    select teacher.id
    into v_teacher_id
    from public.teachers teacher
    where teacher.profile_id = new.homeroom_teacher_id
      and teacher.staff_category = 'Guru'
      and teacher.primary_role = 'Guru Mata Pelajaran'
    limit 1;

    if v_teacher_id is null then
      raise exception 'Wali kelas harus merupakan guru mata pelajaran yang tertaut ke akun.';
    end if;

    update public.teachers teacher
    set additional_roles = array(
      select distinct role
      from unnest(coalesce(teacher.additional_roles, '{}'::text[]) || array['Wali Kelas']::text[]) as roles(role)
    )
    where teacher.id = v_teacher_id;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$function$;

revoke all on function public.sync_teacher_homeroom_roles() from public, anon, authenticated;

drop trigger if exists classes_sync_teacher_homeroom_roles on public.classes;
create trigger classes_sync_teacher_homeroom_roles
  after insert or update of homeroom_teacher_id
  on public.classes
  for each row
  execute function public.sync_teacher_homeroom_roles();

update public.teachers teacher
set additional_roles = array(
  select distinct role
  from unnest(coalesce(teacher.additional_roles, '{}'::text[]) || array['Wali Kelas']::text[]) as roles(role)
)
where exists (
  select 1
  from public.classes class
  where class.homeroom_teacher_id = teacher.profile_id
)
  and teacher.profile_id is not null;

update public.teachers teacher
set additional_roles = array_remove(coalesce(teacher.additional_roles, '{}'::text[]), 'Wali Kelas')
where teacher.profile_id is not null
  and not exists (
    select 1
    from public.classes class
    where class.homeroom_teacher_id = teacher.profile_id
  );

create or replace function public.normalize_teacher_job_roles()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if new.primary_role is null or btrim(new.primary_role) = '' then
    if coalesce(new.employment_status, '') ilike '%guru bk%'
      or coalesce(new.employment_status, '') ilike '%konselor%' then
      new.primary_role := 'Guru BK';
    elsif coalesce(new.employment_status, '') ilike '%kepala sekolah%' then
      new.primary_role := 'Kepala Sekolah';
    elsif coalesce(new.employment_status, '') ilike '%kepala tata usaha%' then
      new.primary_role := 'Kepala Tata Usaha';
    elsif coalesce(new.employment_status, '') ilike '%staff tata usaha%' then
      new.primary_role := 'Staff Tata Usaha';
    elsif coalesce(new.employment_status, '') ilike '%bendahara%' then
      new.primary_role := 'Bendahara Pengeluaran';
    elsif coalesce(new.employment_status, '') ilike '%operator%' then
      new.primary_role := 'Operator Sekolah';
    elsif coalesce(new.employment_status, '') ilike '%tendik%'
      or coalesce(new.employment_status, '') ilike '%tenaga kependidikan%' then
      new.primary_role := 'Tendik Lainnya';
    else
      new.primary_role := 'Guru Mata Pelajaran';
    end if;
  end if;

  if new.staff_category is null or btrim(new.staff_category) = '' then
    new.staff_category := case
      when new.primary_role ilike '%guru%' then 'Guru'
      else 'Tenaga Kependidikan'
    end;
  end if;

  new.additional_roles := coalesce(new.additional_roles, '{}'::text[]);
  if cardinality(new.additional_roles) = 0
    and coalesce(new.employment_status, '') ilike '%wakasek%' then
    new.additional_roles := array[btrim(new.employment_status)];
  end if;
  new.bk_class_ids := coalesce(new.bk_class_ids, '{}'::uuid[]);
  new.employment_status := new.primary_role;

  if new.primary_role <> 'Guru BK' then
    new.bk_class_ids := '{}'::uuid[];
  end if;

  return new;
end;
$function$;

drop trigger if exists teachers_normalize_job_roles on public.teachers;
create trigger teachers_normalize_job_roles
  before insert or update of staff_category, primary_role, additional_roles, bk_class_ids, employment_status
  on public.teachers
  for each row
  execute function public.normalize_teacher_job_roles();

create or replace function public.validate_teacher_bk_classes()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  v_class_id uuid;
begin
  if new.primary_role <> 'Guru BK' then
    return new;
  end if;

  for v_class_id in
    select distinct selected.class_id
    from unnest(coalesce(new.bk_class_ids, '{}'::uuid[])) as selected(class_id)
  loop
    if not exists (
      select 1
      from public.classes class
      where class.id = v_class_id
    ) then
      raise exception 'Rombel Guru BK tidak ditemukan: %', v_class_id;
    end if;

    if exists (
      select 1
      from public.teachers other_teacher
      where other_teacher.id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid)
        and other_teacher.primary_role = 'Guru BK'
        and v_class_id = any(coalesce(other_teacher.bk_class_ids, '{}'::uuid[]))
    ) then
      raise exception 'Rombel sudah ditugaskan kepada Guru BK lain.';
    end if;
  end loop;

  return new;
end;
$function$;

drop trigger if exists teachers_validate_bk_classes on public.teachers;
create trigger teachers_validate_bk_classes
  before insert or update of primary_role, bk_class_ids
  on public.teachers
  for each row
  execute function public.validate_teacher_bk_classes();

create or replace function public.sync_teacher_bk_class_assignments()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_new_class_ids uuid[] := '{}'::uuid[];
begin
  if tg_op in ('UPDATE', 'DELETE') and old.profile_id is not null then
    if tg_op = 'DELETE' then
      delete from public.attendance_bk_assignments assignment
      where assignment.counselor_profile_id = old.profile_id;

      update public.classes
      set homeroom_teacher_id = null
      where homeroom_teacher_id = old.profile_id;
    else
      delete from public.attendance_bk_assignments assignment
      using public.students student
      where assignment.student_id = student.id
        and assignment.counselor_profile_id = old.profile_id
        and student.class_id = any(coalesce(old.bk_class_ids, '{}'::uuid[]))
        and (
          new.profile_id is distinct from old.profile_id
          or new.primary_role <> 'Guru BK'
          or not (student.class_id = any(coalesce(new.bk_class_ids, '{}'::uuid[])))
        );
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  if new.profile_id is not null and new.primary_role = 'Guru BK' then
    v_new_class_ids := coalesce(new.bk_class_ids, '{}'::uuid[]);
    insert into public.attendance_bk_assignments (
      student_id,
      counselor_profile_id,
      assigned_at
    )
    select student.id, new.profile_id, now()
    from public.students student
    where student.class_id = any(v_new_class_ids)
    on conflict (student_id) do update
      set counselor_profile_id = excluded.counselor_profile_id,
          assigned_at = excluded.assigned_at;
  end if;

  return new;
end;
$function$;

revoke all on function public.sync_teacher_bk_class_assignments() from public, anon, authenticated;

drop trigger if exists teachers_sync_bk_class_assignments on public.teachers;
create trigger teachers_sync_bk_class_assignments
  after insert or update of profile_id, primary_role, bk_class_ids or delete
  on public.teachers
  for each row
  execute function public.sync_teacher_bk_class_assignments();

create or replace function public.sync_student_bk_class_assignment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_old_counselor_id uuid;
  v_new_counselor_id uuid;
begin
  if tg_op = 'UPDATE' and old.class_id is distinct from new.class_id then
    select teacher.profile_id
    into v_old_counselor_id
    from public.teachers teacher
    where teacher.primary_role = 'Guru BK'
      and old.class_id = any(coalesce(teacher.bk_class_ids, '{}'::uuid[]))
    limit 1;

    if v_old_counselor_id is not null then
      delete from public.attendance_bk_assignments assignment
      where assignment.student_id = old.id
        and assignment.counselor_profile_id = v_old_counselor_id;
    end if;
  end if;

  if new.class_id is not null then
    select teacher.profile_id
    into v_new_counselor_id
    from public.teachers teacher
    where teacher.primary_role = 'Guru BK'
      and new.class_id = any(coalesce(teacher.bk_class_ids, '{}'::uuid[]))
    limit 1;

    if v_new_counselor_id is not null then
      insert into public.attendance_bk_assignments (
        student_id,
        counselor_profile_id,
        assigned_at
      )
      values (new.id, v_new_counselor_id, now())
      on conflict (student_id) do update
        set counselor_profile_id = excluded.counselor_profile_id,
            assigned_at = excluded.assigned_at;
    end if;
  end if;

  return new;
end;
$function$;

revoke all on function public.sync_student_bk_class_assignment() from public, anon, authenticated;

drop trigger if exists students_sync_bk_class_assignment on public.students;
create trigger students_sync_bk_class_assignment
  after insert or update of class_id
  on public.students
  for each row
  execute function public.sync_student_bk_class_assignment();

create or replace function public.sync_student_profile_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_profile_id uuid;
  v_account_status public.account_status;
begin
  if tg_op = 'UPDATE'
    and new.status is not distinct from old.status
    and new.profile_id is not distinct from old.profile_id
    and new.nisn is not distinct from old.nisn then
    return new;
  end if;

  v_profile_id := new.profile_id;
  if v_profile_id is null and nullif(btrim(new.nisn), '') is not null then
    select profile.id
    into v_profile_id
    from public.profiles profile
    where btrim(profile.username::text) = btrim(new.nisn)
      and profile.role::text = 'siswa'
      and (
        select count(*)
        from public.profiles duplicate
        where btrim(duplicate.username::text) = btrim(new.nisn)
          and duplicate.role::text = 'siswa'
      ) = 1
      and (
        select count(*)
        from public.students duplicate
        where btrim(duplicate.nisn::text) = btrim(new.nisn)
      ) = 1
    limit 1;
  end if;

  if v_profile_id is null then
    return new;
  end if;

  v_account_status := case
    when lower(btrim(new.status::text)) = 'active'
      then 'active'::public.account_status
    else 'disabled'::public.account_status
  end;

  update public.profiles profile
  set status = v_account_status,
      updated_at = now()
  where profile.id = v_profile_id
    and profile.role::text = 'siswa'
    and profile.status is distinct from v_account_status;

  return new;
end;
$function$;

revoke all on function public.sync_student_profile_status() from public, anon, authenticated;

drop trigger if exists students_sync_profile_status on public.students;
create trigger students_sync_profile_status
  after insert or update
  on public.students
  for each row
  execute function public.sync_student_profile_status();

update public.profiles profile
set status = case
      when lower(btrim(student.status::text)) = 'active'
        then 'active'::public.account_status
      else 'disabled'::public.account_status
    end,
    updated_at = now()
from public.students student
where student.profile_id = profile.id
  and profile.role::text = 'siswa'
  and profile.status is distinct from case
    when lower(btrim(student.status::text)) = 'active'
      then 'active'::public.account_status
    else 'disabled'::public.account_status
  end;

create or replace function public.get_my_student_account_status()
returns text
language sql
stable
security definer
set search_path = ''
as $function$
  select student.status::text
  from public.students student
  join public.profiles profile
    on profile.id = auth.uid()
   and profile.role::text = 'siswa'
  where student.profile_id = profile.id
     or (
       student.profile_id is null
       and btrim(student.nisn::text) = btrim(profile.username::text)
       and (
         select count(*)
         from public.students duplicate
         where btrim(duplicate.nisn::text) = btrim(student.nisn::text)
       ) = 1
     )
  order by (student.profile_id = profile.id) desc nulls last
  limit 1;
$function$;

revoke all on function public.get_my_student_account_status() from public, anon;
grant execute on function public.get_my_student_account_status() to authenticated;

create or replace function public.get_my_teacher_access_profile()
returns table (
  teacher_id uuid,
  staff_category text,
  primary_role text,
  additional_roles text[]
)
language sql
stable
security definer
set search_path = ''
as $function$
  select teacher.id,
    teacher.staff_category,
    teacher.primary_role,
    coalesce(teacher.additional_roles, '{}'::text[])
  from public.profiles profile
  join public.teachers teacher
    on teacher.profile_id = profile.id
    or (
      teacher.profile_id is null
      and btrim(teacher.nip::text) = btrim(profile.username::text)
    )
  where profile.id = auth.uid()
    and profile.status::text = 'active'
    and profile.role::text in ('guru', 'guru_bk')
  order by (teacher.profile_id = profile.id) desc nulls last
  limit 1;
$function$;

revoke all on function public.get_my_teacher_access_profile() from public, anon;
grant execute on function public.get_my_teacher_access_profile() to authenticated;

create or replace function public.set_teacher_homeroom_class(
  p_teacher_id uuid,
  p_class_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_profile_id uuid;
  v_primary_role text;
  v_staff_category text;
begin
  if not public.superapp_has_active_role(array['super_admin', 'operator']::text[]) then
    raise exception 'Akses pengaturan wali kelas tidak diizinkan.'
      using errcode = '42501';
  end if;

  select teacher.profile_id, teacher.staff_category, teacher.primary_role
  into v_profile_id, v_staff_category, v_primary_role
  from public.teachers teacher
  where teacher.id = p_teacher_id;

  if not found then
    raise exception 'Data guru tidak ditemukan.';
  end if;

  if p_class_id is not null and v_profile_id is null then
    raise exception 'Tautkan akun guru sebelum menetapkan wali kelas.';
  end if;

  if p_class_id is not null
    and (v_staff_category <> 'Guru' or v_primary_role <> 'Guru Mata Pelajaran') then
    raise exception 'Wali kelas hanya dapat ditetapkan kepada guru mata pelajaran.';
  end if;

  if p_class_id is not null and not exists (
    select 1 from public.classes class where class.id = p_class_id
  ) then
    raise exception 'Kelas wali tidak ditemukan.';
  end if;

  if v_profile_id is not null then
    update public.classes class
    set homeroom_teacher_id = null
    where class.homeroom_teacher_id = v_profile_id
      and class.id is distinct from p_class_id;
  end if;

  if p_class_id is not null then
    update public.classes
    set homeroom_teacher_id = v_profile_id
    where id = p_class_id;
  end if;
end;
$function$;

revoke all on function public.set_teacher_homeroom_class(uuid, uuid) from public, anon;
grant execute on function public.set_teacher_homeroom_class(uuid, uuid) to authenticated;

create or replace function public.replace_teacher_subject_assignments(
  p_teacher_id uuid,
  p_assignments jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if not public.superapp_has_active_role(array['super_admin', 'operator']::text[]) then
    raise exception 'Akses penugasan mata pelajaran tidak diizinkan.'
      using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.teachers teacher where teacher.id = p_teacher_id
  ) then
    raise exception 'Data guru tidak ditemukan.';
  end if;

  if jsonb_typeof(coalesce(p_assignments, '[]'::jsonb)) <> 'array' then
    raise exception 'Daftar penugasan tidak valid.';
  end if;

  delete from public.attendance_teacher_subject_assignments assignment
  where assignment.teacher_id = p_teacher_id;

  insert into public.attendance_teacher_subject_assignments (
    teacher_id,
    class_id,
    subject
  )
  select p_teacher_id,
    (assignment.value ->> 'class_id')::uuid,
    btrim(assignment.value ->> 'subject')
  from jsonb_array_elements(coalesce(p_assignments, '[]'::jsonb)) assignment(value)
  where nullif(btrim(assignment.value ->> 'subject'), '') is not null
    and nullif(assignment.value ->> 'class_id', '') is not null;
end;
$function$;

revoke all on function public.replace_teacher_subject_assignments(uuid, jsonb) from public, anon;
grant execute on function public.replace_teacher_subject_assignments(uuid, jsonb) to authenticated;

create or replace function public.superapp_teacher_has_additional_role(p_role text)
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
        and btrim(teacher.nip::text) = btrim(profile.username::text)
      )
    where profile.id = auth.uid()
      and profile.status::text = 'active'
      and profile.role::text in ('guru', 'guru_bk')
      and p_role = any(coalesce(teacher.additional_roles, '{}'::text[]))
  );
$function$;

revoke all on function public.superapp_teacher_has_additional_role(text) from public, anon;
grant execute on function public.superapp_teacher_has_additional_role(text) to authenticated;

do $migration$
declare
  v_table_name text;
  v_access_scope text;
begin
  foreach v_table_name in array array[
    'inv_assets',
    'inv_places',
    'inv_issues',
    'inv_loans',
    'inv_history',
    'inv_minutes'
  ] loop
    if to_regclass(format('public.%I', v_table_name)) is null then
      continue;
    end if;

    v_access_scope :=
      'public.superapp_has_active_role(array[''super_admin'',''operator'',''kepala_sekolah'',''kepala_tata_usaha'']::text[])'
      || ' or (public.superapp_has_active_role(array[''guru'',''guru_bk'']::text[])'
      || ' and public.superapp_teacher_has_additional_role(''Wakasek Sarana dan Prasarana''))';

    execute format('drop policy if exists superapp_role_scope on public.%I', v_table_name);
    execute format('drop policy if exists superapp_role_access on public.%I', v_table_name);
    execute format(
      'create policy superapp_role_scope on public.%I as restrictive for all to authenticated using (%s) with check (%s)',
      v_table_name, v_access_scope, v_access_scope
    );
    execute format(
      'create policy superapp_role_access on public.%I for all to authenticated using (%s) with check (%s)',
      v_table_name, v_access_scope, v_access_scope
    );
  end loop;

  foreach v_table_name in array array[
    'kb_prestasi',
    'kb_ekstrakurikuler',
    'kb_osis_kegiatan',
    'kb_perizinan'
  ] loop
    if to_regclass(format('public.%I', v_table_name)) is null then
      continue;
    end if;

    execute format('alter table public.%I enable row level security', v_table_name);
    execute format('drop policy if exists kesiswaan_wakasek_access on public.%I', v_table_name);
    execute format(
      'create policy kesiswaan_wakasek_access on public.%I as restrictive for all to authenticated using (not public.superapp_has_active_role(array[''guru'',''guru_bk'']::text[]) or public.superapp_teacher_has_additional_role(''Wakasek Kesiswaan'')) with check (not public.superapp_has_active_role(array[''guru'',''guru_bk'']::text[]) or public.superapp_teacher_has_additional_role(''Wakasek Kesiswaan''))',
      v_table_name
    );
  end loop;
end;
$migration$;
