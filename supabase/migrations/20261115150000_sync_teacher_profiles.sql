create or replace function public.sync_teacher_profile_from_nip()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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
        'guru'
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
          'guru'
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
$$;

create or replace function public.sync_teacher_profile_from_profile()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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
        'guru'
      )
    );

  if new.username is null
    or btrim(new.username) = ''
    or new.role::text not in (
      'kepala_sekolah',
      'operator',
      'kepala_tata_usaha',
      'staff_tata_usaha',
      'guru'
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
      'guru'
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
$$;

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
    'guru'
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
        'guru'
      )
  ) = 1;
