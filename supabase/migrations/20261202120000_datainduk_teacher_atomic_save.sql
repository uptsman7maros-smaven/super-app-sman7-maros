alter table public.teachers
  add column if not exists homeroom_class_id uuid
  references public.classes(id) on delete set null;

create unique index if not exists teachers_single_homeroom_class_idx
  on public.teachers (homeroom_class_id)
  where homeroom_class_id is not null;

update public.teachers teacher
set homeroom_class_id = class.id
from public.classes class
where teacher.profile_id = class.homeroom_teacher_id
  and teacher.homeroom_class_id is null;

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
  where teacher.id = p_teacher_id
  for update;

  if not found then
    raise exception 'Data guru tidak ditemukan.';
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

  if p_class_id is not null then
    update public.teachers teacher
    set homeroom_class_id = null,
        additional_roles = array_remove(coalesce(teacher.additional_roles, '{}'::text[]), 'Wali Kelas')
    where teacher.homeroom_class_id = p_class_id
      and teacher.id <> p_teacher_id;
  end if;

  update public.teachers teacher
  set homeroom_class_id = p_class_id,
      additional_roles = case
        when p_class_id is null then array_remove(coalesce(teacher.additional_roles, '{}'::text[]), 'Wali Kelas')
        else array(
          select distinct role
          from unnest(coalesce(teacher.additional_roles, '{}'::text[]) || array['Wali Kelas']::text[]) as roles(role)
        )
      end
  where teacher.id = p_teacher_id;

  if v_profile_id is not null then
    update public.classes class
    set homeroom_teacher_id = null
    where class.homeroom_teacher_id = v_profile_id
      and class.id is distinct from p_class_id;

    if p_class_id is not null then
      update public.classes class
      set homeroom_teacher_id = v_profile_id
      where class.id = p_class_id;
    end if;
  elsif p_class_id is not null then
    update public.classes class
    set homeroom_teacher_id = null
    where class.id = p_class_id
      and class.homeroom_teacher_id is not null;
  end if;
end;
$function$;

revoke all on function public.set_teacher_homeroom_class(uuid, uuid) from public, anon;
grant execute on function public.set_teacher_homeroom_class(uuid, uuid) to authenticated;

create or replace function public.sync_teacher_homeroom_class_link()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.profile_id is not distinct from old.profile_id
    and new.homeroom_class_id is not distinct from old.homeroom_class_id then
    return new;
  end if;

  if old.profile_id is not null and old.profile_id is distinct from new.profile_id then
    update public.classes class
    set homeroom_teacher_id = null
    where class.homeroom_teacher_id = old.profile_id;
  end if;

  if new.profile_id is not null and new.homeroom_class_id is not null then
    update public.classes class
    set homeroom_teacher_id = null
    where class.homeroom_teacher_id = new.profile_id
      and class.id is distinct from new.homeroom_class_id;

    update public.classes class
    set homeroom_teacher_id = new.profile_id
    where class.id = new.homeroom_class_id
      and class.homeroom_teacher_id is distinct from new.profile_id;
  end if;

  return new;
end;
$function$;

revoke all on function public.sync_teacher_homeroom_class_link() from public, anon, authenticated;

drop trigger if exists teachers_sync_homeroom_class_link on public.teachers;
create trigger teachers_sync_homeroom_class_link
  after update of profile_id, homeroom_class_id
  on public.teachers
  for each row
  execute function public.sync_teacher_homeroom_class_link();

create or replace function public.save_teacher_master_data(
  p_teacher_id uuid,
  p_nip text,
  p_full_name text,
  p_staff_category text,
  p_primary_role text,
  p_additional_roles text[],
  p_bk_class_ids uuid[],
  p_homeroom_class_id uuid,
  p_assignments jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_teacher_id uuid;
begin
  if not public.superapp_has_active_role(array['super_admin', 'operator']::text[]) then
    raise exception 'Akses pengelolaan data guru/tendik tidak diizinkan.'
      using errcode = '42501';
  end if;

  if nullif(btrim(p_full_name), '') is null then
    raise exception 'Nama lengkap guru/tendik wajib diisi.';
  end if;

  if p_staff_category is null or p_staff_category not in ('Guru', 'Tenaga Kependidikan') then
    raise exception 'Status kepegawaian guru/tendik tidak valid.';
  end if;

  if p_staff_category = 'Guru'
    and (p_primary_role is null or p_primary_role not in ('Guru Mata Pelajaran', 'Guru BK')) then
    raise exception 'Jabatan utama guru tidak valid.';
  end if;

  if p_staff_category = 'Tenaga Kependidikan'
    and (p_primary_role is null or p_primary_role not in (
      'Kepala Sekolah',
      'Kepala Tata Usaha',
      'Staff Tata Usaha',
      'Bendahara Pengeluaran',
      'Operator Sekolah',
      'Tendik Lainnya'
    )) then
    raise exception 'Jabatan utama tenaga kependidikan tidak valid.';
  end if;

  if p_homeroom_class_id is not null
    and (p_staff_category <> 'Guru' or p_primary_role <> 'Guru Mata Pelajaran') then
    raise exception 'Wali kelas hanya dapat ditetapkan kepada guru mata pelajaran.';
  end if;

  if p_teacher_id is null then
    insert into public.teachers (
      nip,
      full_name,
      staff_category,
      primary_role,
      employment_status,
      additional_roles,
      bk_class_ids,
      homeroom_class_id
    )
    values (
      nullif(btrim(p_nip), ''),
      btrim(p_full_name),
      p_staff_category,
      p_primary_role,
      p_primary_role,
      coalesce(p_additional_roles, '{}'::text[]),
      coalesce(p_bk_class_ids, '{}'::uuid[]),
      p_homeroom_class_id
    )
    returning id into v_teacher_id;
  else
    update public.teachers teacher
    set nip = nullif(btrim(p_nip), ''),
        full_name = btrim(p_full_name),
        staff_category = p_staff_category,
        primary_role = p_primary_role,
        employment_status = p_primary_role,
        additional_roles = coalesce(p_additional_roles, '{}'::text[]),
        bk_class_ids = coalesce(p_bk_class_ids, '{}'::uuid[]),
        homeroom_class_id = p_homeroom_class_id,
        updated_at = now()
    where teacher.id = p_teacher_id
    returning teacher.id into v_teacher_id;

    if v_teacher_id is null then
      raise exception 'Data guru/tendik tidak ditemukan.';
    end if;
  end if;

  perform public.set_teacher_homeroom_class(v_teacher_id, p_homeroom_class_id);
  perform public.replace_teacher_subject_assignments(
    v_teacher_id,
    case when p_primary_role = 'Guru Mata Pelajaran'
      then coalesce(p_assignments, '[]'::jsonb)
      else '[]'::jsonb
    end
  );

  return v_teacher_id;
end;
$function$;

revoke all on function public.save_teacher_master_data(uuid, text, text, text, text, text[], uuid[], uuid, jsonb) from public, anon;
grant execute on function public.save_teacher_master_data(uuid, text, text, text, text, text[], uuid[], uuid, jsonb) to authenticated;
