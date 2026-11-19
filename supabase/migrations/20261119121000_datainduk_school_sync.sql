alter table public.school_settings
  add column if not exists principal_name text,
  add column if not exists principal_nip text,
  add column if not exists latitude double precision,
  add column if not exists longitude double precision,
  add column if not exists geofence_radius_meters integer default 150;

alter table public.students
  add column if not exists nik text,
  add column if not exists address text,
  add column if not exists parent_name text,
  add column if not exists kip_pip_status text;

alter table public.teachers
  add column if not exists nuptk text,
  add column if not exists nik text,
  add column if not exists employment_type text,
  add column if not exists phone text,
  add column if not exists email text;

create table if not exists public.school_holidays (
  id uuid primary key default gen_random_uuid(),
  holiday_date date not null,
  title text not null check (length(btrim(title)) > 0),
  category text not null default 'Sekolah',
  is_non_kbm boolean not null default true,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

alter table public.school_holidays enable row level security;
grant select, insert, update, delete on public.school_holidays to authenticated;

drop policy if exists school_holidays_read_authenticated on public.school_holidays;
create policy school_holidays_read_authenticated on public.school_holidays
  for select to authenticated
  using (true);

drop policy if exists school_holidays_admin_insert on public.school_holidays;
create policy school_holidays_admin_insert on public.school_holidays
  for insert to authenticated
  with check (public.has_active_role(array[
    'super_admin'::public.app_role,
    'operator'::public.app_role
  ]));

drop policy if exists school_holidays_admin_update on public.school_holidays;
create policy school_holidays_admin_update on public.school_holidays
  for update to authenticated
  using (public.has_active_role(array[
    'super_admin'::public.app_role,
    'operator'::public.app_role
  ]))
  with check (public.has_active_role(array[
    'super_admin'::public.app_role,
    'operator'::public.app_role
  ]));

drop policy if exists school_holidays_admin_delete on public.school_holidays;
create policy school_holidays_admin_delete on public.school_holidays
  for delete to authenticated
  using (public.has_active_role(array[
    'super_admin'::public.app_role,
    'operator'::public.app_role
  ]));

create or replace view public.v_satu_data_siswa
  with (security_invoker = true)
as
select
  student.id,
  student.profile_id,
  student.nis,
  student.nisn,
  student.nik,
  student.full_name,
  student.class_id,
  class.name as class_name,
  class.grade_level,
  class.academic_year_id,
  academic_year.name as academic_year_name,
  academic_year.is_active as academic_year_is_active,
  student.birth_date,
  student.gender,
  student.status,
  student.address,
  student.parent_name,
  student.parent_phone,
  student.kip_pip_status
from public.students student
left join public.classes class on class.id = student.class_id
left join public.academic_years academic_year on academic_year.id = class.academic_year_id;

create or replace view public.v_satu_data_ptk
  with (security_invoker = true)
as
select
  teacher.id,
  teacher.profile_id,
  teacher.nip,
  teacher.nuptk,
  teacher.nik,
  teacher.full_name,
  teacher.employment_status,
  teacher.employment_type,
  teacher.phone,
  teacher.email
from public.teachers teacher;

grant select on public.v_satu_data_siswa to authenticated;
grant select on public.v_satu_data_ptk to authenticated;

notify pgrst, 'reload schema';
