alter table public.school_settings
  add column if not exists academic_year text not null default '';

alter table public.students
  add column if not exists profile_id uuid;

do $migration$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'students_profile_id_fkey'
      and conrelid = 'public.students'::regclass
  ) then
    alter table public.students
      add constraint students_profile_id_fkey
      foreign key (profile_id)
      references public.profiles(id)
      on delete set null
      not valid;
  end if;
end;
$migration$;

create index if not exists students_profile_id_idx
  on public.students (profile_id)
  where profile_id is not null;

create or replace function public.sync_student_profile_from_nisn()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  matching_profile_id uuid;
  matching_student_count integer;
begin
  if tg_op = 'UPDATE' and new.nisn is distinct from old.nisn then
    new.profile_id := null;
  end if;

  if new.nisn is null or btrim(new.nisn) = '' then
    new.profile_id := null;
    return new;
  end if;

  select count(*)
  into matching_student_count
  from public.students student
  where btrim(student.nisn) = btrim(new.nisn)
    and (tg_op = 'INSERT' or student.id <> new.id);

  if matching_student_count = 0
    and (
    select count(*)
    from public.profiles profile
    where btrim(profile.username) = btrim(new.nisn)
      and profile.role::text = 'siswa'
    ) = 1
  then
    select profile.id
    into matching_profile_id
    from public.profiles profile
    where btrim(profile.username) = btrim(new.nisn)
      and profile.role::text = 'siswa'
    limit 1;

    if new.profile_id is null or new.profile_id = matching_profile_id then
      new.profile_id := matching_profile_id;
    end if;
  end if;

  return new;
end;
$function$;

create or replace function public.sync_student_profile_from_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  matching_student_count integer;
begin
  update public.students student
  set profile_id = null
  where student.profile_id = new.id
    and (
      new.username is null
      or btrim(student.nisn) is distinct from btrim(new.username)
      or new.role::text <> 'siswa'
    );

  if new.username is null
    or btrim(new.username) = ''
    or new.role::text <> 'siswa'
  then
    return new;
  end if;

  select count(*)
  into matching_student_count
  from public.students student
  where btrim(student.nisn) = btrim(new.username);

  if matching_student_count = 1
    and (
      select count(*)
      from public.profiles profile
      where btrim(profile.username) = btrim(new.username)
        and profile.role::text = 'siswa'
    ) = 1
  then
    update public.students student
    set profile_id = new.id
    where btrim(student.nisn) = btrim(new.username)
      and (student.profile_id is null or student.profile_id = new.id);
  end if;

  return new;
end;
$function$;

drop trigger if exists students_sync_profile_from_nisn on public.students;
create trigger students_sync_profile_from_nisn
before insert or update of nisn on public.students
for each row
execute function public.sync_student_profile_from_nisn();

drop trigger if exists profiles_sync_student_profile on public.profiles;
create trigger profiles_sync_student_profile
after insert or update on public.profiles
for each row
execute function public.sync_student_profile_from_profile();

create or replace function public.sync_teacher_profile_from_nip()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  affected_nip text;
  matching_profile_id uuid;
  matching_profile_count integer;
  matching_teacher_count integer;
begin
  for affected_nip in
    select distinct btrim(changed_nip)
    from unnest(array[
      new.nip,
      case when tg_op = 'UPDATE' then old.nip else null end
    ]) as changed(changed_nip)
    where changed_nip is not null
      and btrim(changed_nip) <> ''
  loop
    matching_profile_id := null;

    select count(*)
    into matching_profile_count
    from public.profiles profile
    where btrim(profile.username) = affected_nip
      and profile.role::text in (
        'kepala_sekolah',
        'operator',
        'kepala_tata_usaha',
        'staff_tata_usaha',
        'guru',
        'guru_bk',
        'tendik'
      );

    select count(*)
    into matching_teacher_count
    from public.teachers teacher
    where btrim(teacher.nip) = affected_nip;

    if matching_profile_count = 1 and matching_teacher_count = 1 then
      select profile.id
      into matching_profile_id
      from public.profiles profile
      where btrim(profile.username) = affected_nip
        and profile.role::text in (
          'kepala_sekolah',
          'operator',
          'kepala_tata_usaha',
          'staff_tata_usaha',
          'guru',
          'guru_bk',
          'tendik'
        )
      limit 1;
    end if;

    update public.teachers teacher
    set profile_id = matching_profile_id
    where btrim(teacher.nip) = affected_nip
      and teacher.profile_id is distinct from matching_profile_id;
  end loop;

  return new;
end;
$function$;

create or replace function public.sync_teacher_profile_from_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  matching_profile_count integer;
  matching_teacher_count integer;
begin
  update public.teachers teacher
  set profile_id = null
  where teacher.profile_id = new.id
    and (
      new.username is null
      or btrim(teacher.nip) is distinct from btrim(new.username)
      or new.role::text not in (
        'kepala_sekolah',
        'operator',
        'kepala_tata_usaha',
        'staff_tata_usaha',
        'guru',
        'guru_bk',
        'tendik'
      )
    );

  if new.username is null
    or btrim(new.username) = ''
    or new.role::text not in (
      'kepala_sekolah',
      'operator',
      'kepala_tata_usaha',
      'staff_tata_usaha',
      'guru',
      'guru_bk',
      'tendik'
    )
  then
    return new;
  end if;

  select count(*)
  into matching_profile_count
  from public.profiles profile
  where btrim(profile.username) = btrim(new.username)
    and profile.role::text in (
      'kepala_sekolah',
      'operator',
      'kepala_tata_usaha',
      'staff_tata_usaha',
      'guru',
      'guru_bk',
      'tendik'
    );

  select count(*)
  into matching_teacher_count
  from public.teachers teacher
  where btrim(teacher.nip) = btrim(new.username);

  if matching_profile_count = 1 and matching_teacher_count = 1 then
    update public.teachers teacher
    set profile_id = new.id
    where btrim(teacher.nip) = btrim(new.username)
      and (teacher.profile_id is null or teacher.profile_id = new.id);
  end if;

  return new;
end;
$function$;

drop trigger if exists teachers_sync_profile_from_nip on public.teachers;
create trigger teachers_sync_profile_from_nip
after insert or update of nip on public.teachers
for each row
execute function public.sync_teacher_profile_from_nip();

drop trigger if exists profiles_sync_teacher_profile on public.profiles;
create trigger profiles_sync_teacher_profile
after insert or update on public.profiles
for each row
execute function public.sync_teacher_profile_from_profile();

update public.students student
set profile_id = profile.id
from public.profiles profile
where student.profile_id is null
  and btrim(student.nisn) = btrim(profile.username)
  and profile.role::text = 'siswa'
  and (
    select count(*)
    from public.students matching_student
    where btrim(matching_student.nisn) = btrim(student.nisn)
  ) = 1
  and (
    select count(*)
    from public.profiles matching_profile
    where btrim(matching_profile.username) = btrim(profile.username)
      and matching_profile.role::text = 'siswa'
  ) = 1;

update public.teachers teacher
set profile_id = profile.id
from public.profiles profile
where teacher.profile_id is null
  and btrim(teacher.nip) = btrim(profile.username)
  and profile.role::text in (
    'kepala_sekolah',
    'operator',
    'kepala_tata_usaha',
    'staff_tata_usaha',
    'guru',
    'guru_bk',
    'tendik'
  )
  and (
    select count(*)
    from public.teachers matching_teacher
    where btrim(matching_teacher.nip) = btrim(teacher.nip)
  ) = 1
  and (
    select count(*)
    from public.profiles matching_profile
    where btrim(matching_profile.username) = btrim(profile.username)
      and matching_profile.role::text in (
        'kepala_sekolah',
        'operator',
        'kepala_tata_usaha',
        'staff_tata_usaha',
        'guru',
        'guru_bk',
        'tendik'
      )
  ) = 1;

create or replace function public.get_my_master_identity()
returns table (
  student_id uuid,
  teacher_id uuid,
  class_id uuid,
  class_name text,
  full_name text,
  nip_or_nisn text,
  jabatan text
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_role text;
  v_username text;
  v_student_id uuid;
  v_teacher_id uuid;
  v_class_id uuid;
  v_class_name text;
  v_full_name text;
  v_identifier text;
  v_jabatan text;
  v_match_count integer;
begin
  if auth.uid() is null then
    return;
  end if;

  select profile.role::text, profile.username
  into v_role, v_username
  from public.profiles profile
  where profile.id = auth.uid()
    and profile.status::text = 'active';

  if not found then
    return;
  end if;

  if v_role = 'siswa' then
    select count(*)
    into v_match_count
    from public.students student
    where student.profile_id = auth.uid();

    if v_match_count = 1 then
      select student.id, student.class_id, class.name, student.full_name, student.nisn
      into v_student_id, v_class_id, v_class_name, v_full_name, v_identifier
      from public.students student
      left join public.classes class on class.id = student.class_id
      where student.profile_id = auth.uid();
    elsif v_match_count = 0 then
      select count(*)
      into v_match_count
      from public.students student
      where student.profile_id is null
        and btrim(student.nisn) = btrim(v_username);

      if v_match_count = 1 then
        select student.id, student.class_id, class.name, student.full_name, student.nisn
        into v_student_id, v_class_id, v_class_name, v_full_name, v_identifier
        from public.students student
        left join public.classes class on class.id = student.class_id
        where student.profile_id is null
          and btrim(student.nisn) = btrim(v_username);
      end if;
    end if;

    if v_student_id is not null then
      return query
      select v_student_id, null::uuid, v_class_id, v_class_name, v_full_name, v_identifier, null::text;
    end if;
    return;
  end if;

  if v_role in (
    'kepala_sekolah',
    'operator',
    'kepala_tata_usaha',
    'staff_tata_usaha',
    'guru',
    'guru_bk',
    'tendik'
  ) then
    select count(*)
    into v_match_count
    from public.teachers teacher
    where teacher.profile_id = auth.uid();

    if v_match_count = 1 then
      select teacher.id, teacher.full_name, teacher.nip, teacher.employment_status
      into v_teacher_id, v_full_name, v_identifier, v_jabatan
      from public.teachers teacher
      where teacher.profile_id = auth.uid();
    elsif v_match_count = 0 then
      select count(*)
      into v_match_count
      from public.teachers teacher
      where teacher.profile_id is null
        and btrim(teacher.nip) = btrim(v_username);

      if v_match_count = 1 then
        select teacher.id, teacher.full_name, teacher.nip, teacher.employment_status
        into v_teacher_id, v_full_name, v_identifier, v_jabatan
        from public.teachers teacher
        where teacher.profile_id is null
          and btrim(teacher.nip) = btrim(v_username);
      end if;
    end if;

    if v_teacher_id is not null then
      return query
      select null::uuid, v_teacher_id, null::uuid, null::text, v_full_name,
        coalesce(v_identifier, v_username), v_jabatan;
    end if;
  end if;

  return;
end;
$function$;

create or replace function public.sync_active_academic_year_to_school_settings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.is_active then
    update public.academic_years academic_year
    set is_active = false
    where academic_year.id <> new.id
      and academic_year.is_active;

    update public.school_settings settings
    set academic_year = new.name,
        updated_at = now()
    where settings.id = (
      select school_settings.id
      from public.school_settings
      order by school_settings.id
      limit 1
    )
      and settings.academic_year is distinct from new.name;
  end if;

  return new;
end;
$function$;

create or replace function public.sync_school_settings_academic_year()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  matching_year_id uuid;
  matching_year_count integer;
begin
  if tg_op = 'UPDATE' and new.academic_year is not distinct from old.academic_year then
    return new;
  end if;

  select count(*)
  into matching_year_count
  from public.academic_years academic_year
  where btrim(academic_year.name) = btrim(new.academic_year);

  if matching_year_count <> 1 then
    return new;
  end if;

  select academic_year.id
  into matching_year_id
  from public.academic_years academic_year
  where btrim(academic_year.name) = btrim(new.academic_year)
  limit 1;

  update public.academic_years academic_year
  set is_active = academic_year.id = matching_year_id
  where academic_year.is_active is distinct from (academic_year.id = matching_year_id);

  return new;
end;
$function$;

drop trigger if exists academic_years_sync_school_settings on public.academic_years;
create trigger academic_years_sync_school_settings
after insert or update of name, is_active on public.academic_years
for each row
execute function public.sync_active_academic_year_to_school_settings();

drop trigger if exists school_settings_sync_academic_year on public.school_settings;
create trigger school_settings_sync_academic_year
after insert or update of academic_year on public.school_settings
for each row
execute function public.sync_school_settings_academic_year();

revoke all on function public.sync_student_profile_from_nisn() from public, anon, authenticated;
revoke all on function public.sync_student_profile_from_profile() from public, anon, authenticated;
revoke all on function public.sync_teacher_profile_from_nip() from public, anon, authenticated;
revoke all on function public.sync_teacher_profile_from_profile() from public, anon, authenticated;
revoke all on function public.sync_active_academic_year_to_school_settings() from public, anon, authenticated;
revoke all on function public.sync_school_settings_academic_year() from public, anon, authenticated;
revoke all on function public.get_my_master_identity() from public, anon;
grant execute on function public.get_my_master_identity() to authenticated;

update public.school_settings settings
set academic_year = active_year.name,
    updated_at = now()
from (
  select academic_year.name
  from public.academic_years academic_year
  where academic_year.is_active
  order by academic_year.start_date desc nulls last, academic_year.name
  limit 1
) active_year
where settings.id = (
  select school_settings.id
  from public.school_settings
  order by school_settings.id
  limit 1
)
  and settings.academic_year is distinct from active_year.name;
