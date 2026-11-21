begin;

alter table public.siswa
  add column if not exists datainduk_student_id uuid
  references public.students(id) on delete set null;

create index if not exists siswa_datainduk_student_id_idx
  on public.siswa (datainduk_student_id)
  where datainduk_student_id is not null;

update public.siswa voter
set datainduk_student_id = student.id
from public.students student
where voter.datainduk_student_id is null
  and btrim(voter.nisn) = btrim(student.nisn)
  and (
    select count(*)
    from public.students matching_student
    where btrim(matching_student.nisn) = btrim(voter.nisn)
  ) = 1;

create table if not exists public.eosis_kpu_members (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  assigned_by uuid references public.profiles(id) on delete set null,
  assigned_at timestamptz not null default pg_catalog.now()
);

alter table public.eosis_kpu_members enable row level security;
revoke all on table public.eosis_kpu_members from public, anon, authenticated;

create or replace function public.eosis_is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.profiles profile
    where profile.id = auth.uid()
      and profile.status::text = 'active'
      and profile.role::text = 'super_admin'
  );
$function$;

create or replace function public.eosis_has_admin_access()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.profiles profile
    where profile.id = auth.uid()
      and profile.status::text = 'active'
      and (
        profile.role::text = 'super_admin'
        or (
          profile.role::text = 'siswa'
          and exists (
            select 1
            from public.eosis_kpu_members member
            join public.students student on student.profile_id = profile.id
            where member.profile_id = profile.id
              and student.status::text = 'Active'
          )
        )
      )
  );
$function$;

create or replace function public.eosis_admin_access(
  p_username text,
  p_password text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select public.eosis_has_admin_access();
$function$;

create or replace function public.eosis_admin_call(
  p_username text,
  p_password text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select public.eosis_has_admin_access();
$function$;

create or replace function public.eosis_is_admin(
  p_username text,
  p_password text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select public.eosis_has_admin_access();
$function$;

create or replace function public.admin_login(
  p_username text,
  p_password text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select public.eosis_has_admin_access();
$function$;

create or replace function public.eosis_get_kpu_students()
returns json
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if not public.eosis_is_super_admin() then
    raise exception 'Hanya Super Admin yang dapat mengelola anggota KPU.';
  end if;

  return coalesce(
    (
      select json_agg(
        json_build_object(
          'profile_id', candidate.profile_id,
          'nisn', candidate.nisn,
          'full_name', candidate.full_name,
          'class_name', candidate.class_name,
          'is_kpu', candidate.is_kpu
        )
        order by candidate.full_name, candidate.nisn
      )
      from (
        select distinct on (profile.id)
          profile.id as profile_id,
          student.nisn,
          student.full_name,
          class.name as class_name,
          exists (
            select 1
            from public.eosis_kpu_members member
            where member.profile_id = profile.id
          ) as is_kpu
        from public.students student
        join public.profiles profile
          on profile.id = student.profile_id
         and profile.role::text = 'siswa'
         and profile.status::text = 'active'
        left join public.classes class on class.id = student.class_id
        where student.status::text = 'Active'
        order by profile.id, student.full_name, student.nisn
      ) candidate
    ),
    '[]'::json
  );
end;
$function$;

create or replace function public.eosis_set_kpu_member(
  p_profile_id uuid,
  p_is_kpu boolean
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if not public.eosis_is_super_admin() then
    raise exception 'Hanya Super Admin yang dapat mengelola anggota KPU.';
  end if;

  if coalesce(p_is_kpu, false) then
    if not exists (
      select 1
      from public.profiles profile
      join public.students student on student.profile_id = profile.id
      where profile.id = p_profile_id
        and profile.role::text = 'siswa'
        and profile.status::text = 'active'
        and student.status::text = 'Active'
    ) then
      raise exception 'Akun yang dipilih bukan akun siswa aktif yang tertaut ke Data Induk.';
    end if;

    insert into public.eosis_kpu_members (profile_id, assigned_by)
    values (p_profile_id, auth.uid())
    on conflict (profile_id) do nothing;
  else
    delete from public.eosis_kpu_members
    where profile_id = p_profile_id;
  end if;

  return true;
end;
$function$;

create or replace function public.eosis_deactivate_deleted_datainduk_voter()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  update public.siswa
  set eosis_eligible = false,
      datainduk_student_id = null
  where datainduk_student_id = old.id;

  return old;
end;
$function$;

drop trigger if exists students_deactivate_eosis_voter on public.students;
create trigger students_deactivate_eosis_voter
before delete on public.students
for each row
execute function public.eosis_deactivate_deleted_datainduk_voter();

create or replace function public.eosis_sync_voters_from_datainduk()
returns json
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_active_year_count integer;
  v_source_count integer;
  v_created integer;
  v_processed integer;
  v_ineligible integer;
begin
  if not public.eosis_admin_call('', '') then
    raise exception 'Sesi pengelola eOSIS tidak valid.';
  end if;

  select count(*) into v_active_year_count
  from public.academic_years
  where is_active = true;

  if v_active_year_count = 0 then
    raise exception 'Tahun ajaran aktif belum ditentukan di Data Induk.';
  end if;

  if v_active_year_count > 1 then
    raise exception 'Terdapat lebih dari satu tahun ajaran aktif di Data Induk.';
  end if;

  select count(*) into v_source_count
  from public.students student
  join public.classes class on class.id = student.class_id
  join public.academic_years academic_year on academic_year.id = class.academic_year_id
  where academic_year.is_active = true
    and student.status = 'Active'
    and nullif(btrim(student.nisn), '') is not null
    and nullif(btrim(class.name), '') is not null;

  if v_source_count = 0 then
    raise exception 'Tidak ditemukan siswa Active pada kelas tahun ajaran aktif. Data pemilih eOSIS tidak diubah.';
  end if;

  insert into public.kelas (nama_kelas)
  select distinct btrim(class.name)
  from public.students student
  join public.classes class on class.id = student.class_id
  join public.academic_years academic_year on academic_year.id = class.academic_year_id
  where academic_year.is_active = true
    and student.status = 'Active'
    and nullif(btrim(student.nisn), '') is not null
    and nullif(btrim(class.name), '') is not null
  on conflict (nama_kelas) do nothing;

  select count(*) into v_created
  from public.students student
  join public.classes class on class.id = student.class_id
  join public.academic_years academic_year on academic_year.id = class.academic_year_id
  where academic_year.is_active = true
    and student.status = 'Active'
    and nullif(btrim(student.nisn), '') is not null
    and nullif(btrim(class.name), '') is not null
    and not exists (
      select 1
      from public.siswa voter
      where voter.nisn = btrim(student.nisn)
    );

  update public.siswa
  set eosis_eligible = false
  where datainduk_student_id is not null
    and eosis_eligible = true;

  insert into public.siswa (
    nisn,
    nama,
    tgl_lahir,
    kelas_id,
    jenis_kelamin,
    status_memilih,
    waktu_memilih,
    eosis_eligible,
    datainduk_student_id
  )
  select btrim(student.nisn),
         student.full_name,
         student.birth_date,
         voter_class.id,
         student.gender,
         false,
         null,
         true,
         student.id
  from public.students student
  join public.classes class on class.id = student.class_id
  join public.academic_years academic_year on academic_year.id = class.academic_year_id
  join public.kelas voter_class on voter_class.nama_kelas = btrim(class.name)
  where academic_year.is_active = true
    and student.status = 'Active'
    and nullif(btrim(student.nisn), '') is not null
    and nullif(btrim(class.name), '') is not null
  on conflict (nisn) do update
  set nama = excluded.nama,
      tgl_lahir = excluded.tgl_lahir,
      kelas_id = excluded.kelas_id,
      jenis_kelamin = excluded.jenis_kelamin,
      eosis_eligible = true,
      datainduk_student_id = excluded.datainduk_student_id;

  get diagnostics v_processed = row_count;

  select count(*) into v_ineligible
  from public.siswa
  where eosis_eligible = false;

  return json_build_object(
    'processed', v_processed,
    'created', v_created,
    'updated', v_processed - v_created,
    'ineligible', v_ineligible
  );
end;
$function$;

create or replace function public.get_dashboard_stats(
  p_username text,
  p_password text
)
returns json
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if not public.eosis_admin_call(p_username, p_password) then
    raise exception 'Sesi pengelola eOSIS tidak valid.';
  end if;

  return json_build_object(
    'total_siswa', (select count(*) from public.siswa where eosis_eligible),
    'sudah_memilih', (select count(*) from public.siswa where eosis_eligible and status_memilih),
    'belum_memilih', (select count(*) from public.siswa where eosis_eligible and not status_memilih),
    'total_suara', (select count(*) from public.suara)
  );
end;
$function$;

create or replace function public.get_classes_v3(
  p_username text,
  p_password text
)
returns json
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if not public.eosis_admin_call(p_username, p_password) then
    raise exception 'Sesi pengelola eOSIS tidak valid.';
  end if;

  return coalesce(
    (
      select json_agg(row_data order by row_data.nama_kelas)
      from (
        select class.id,
               class.nama_kelas,
               count(voter.id) as total_siswa
        from public.kelas class
        left join public.siswa voter
          on voter.kelas_id = class.id
         and voter.eosis_eligible = true
        group by class.id, class.nama_kelas
      ) row_data
    ),
    '[]'::json
  );
end;
$function$;

create or replace function public.get_class_stats(
  p_username text,
  p_password text
)
returns json
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if not public.eosis_admin_call(p_username, p_password) then
    raise exception 'Sesi pengelola eOSIS tidak valid.';
  end if;

  return coalesce(
    (
      select json_agg(row_data order by row_data.nama_kelas)
      from (
        select class.nama_kelas,
               count(voter.id) as total_siswa,
               count(voter.id) filter (where voter.status_memilih) as sudah_memilih
        from public.kelas class
        left join public.siswa voter
          on voter.kelas_id = class.id
         and voter.eosis_eligible = true
        group by class.id, class.nama_kelas
      ) row_data
    ),
    '[]'::json
  );
end;
$function$;

create or replace function public.get_voter_registry_v3(
  p_username text,
  p_password text
)
returns json
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if not public.eosis_admin_call(p_username, p_password) then
    raise exception 'Sesi pengelola eOSIS tidak valid.';
  end if;

  return coalesce(
    (
      select json_agg(
        json_build_object(
          'id', voter.id,
          'nisn', voter.nisn,
          'nama', voter.nama,
          'nama_kelas', class.nama_kelas,
          'tgl_lahir', voter.tgl_lahir,
          'jenis_kelamin', voter.jenis_kelamin,
          'status_memilih', voter.status_memilih,
          'waktu_memilih', voter.waktu_memilih
        )
        order by class.nama_kelas nulls last, voter.nama, voter.nisn
      )
      from public.siswa voter
      left join public.kelas class on class.id = voter.kelas_id
      where voter.eosis_eligible = true
    ),
    '[]'::json
  );
end;
$function$;

create or replace function public.get_voter_registry_page_v3(
  p_username text,
  p_password text,
  p_page integer,
  p_page_size integer
)
returns json
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_total bigint;
  v_page integer;
  v_page_size integer;
  v_page_count integer;
  v_rows json;
begin
  if not public.eosis_admin_call(p_username, p_password) then
    raise exception 'Sesi pengelola eOSIS tidak valid.';
  end if;

  select count(*) into v_total
  from public.siswa
  where eosis_eligible = true;

  v_page_size := least(greatest(coalesce(p_page_size, 100), 1), 100);
  v_page_count := greatest(
    ceil(v_total::numeric / v_page_size)::integer,
    1
  );
  v_page := least(greatest(coalesce(p_page, 1), 1), v_page_count);

  select coalesce(
    json_agg(
      json_build_object(
        'id', page.id,
        'nisn', page.nisn,
        'nama', page.nama,
        'nama_kelas', page.nama_kelas,
        'tgl_lahir', page.tgl_lahir,
        'jenis_kelamin', page.jenis_kelamin,
        'status_memilih', page.status_memilih,
        'waktu_memilih', page.waktu_memilih
      )
      order by page.nama_kelas nulls last, page.nama, page.nisn
    ),
    '[]'::json
  )
  into v_rows
  from (
    select voter.id,
           voter.nisn,
           voter.nama,
           class.nama_kelas,
           voter.tgl_lahir,
           voter.jenis_kelamin,
           voter.status_memilih,
           voter.waktu_memilih
    from public.siswa voter
    left join public.kelas class on class.id = voter.kelas_id
    where voter.eosis_eligible = true
    order by class.nama_kelas nulls last, voter.nama, voter.nisn
    limit v_page_size
    offset (v_page - 1) * v_page_size
  ) page;

  return json_build_object(
    'total_count', v_total,
    'page', v_page,
    'page_size', v_page_size,
    'page_count', v_page_count,
    'rows', v_rows
  );
end;
$function$;

create or replace function public.get_system_sync_status_v3(
  p_username text,
  p_password text
)
returns json
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if not public.eosis_admin_call(p_username, p_password) then
    raise exception 'Sesi pengelola eOSIS tidak valid.';
  end if;

  return json_build_object(
    'database_connected', true,
    'pengaturan', (select count(*) from public.pengaturan),
    'kelas', (select count(*) from public.kelas),
    'siswa', (select count(*) from public.siswa where eosis_eligible),
    'kandidat', (select count(*) from public.kandidat),
    'suara', (select count(*) from public.suara),
    'siswa_sudah_memilih', (
      select count(*) from public.siswa
      where eosis_eligible and status_memilih
    ),
    'total_suara_kandidat', (
      select coalesce(sum(total_suara), 0) from public.kandidat
    ),
    'sinkron_status', 'TERSINKRON',
    'checked_at', pg_catalog.now()
  );
end;
$function$;

create or replace function public.import_students(
  p_username text,
  p_password text,
  p_rows jsonb
)
returns json
language plpgsql
security definer
set search_path = ''
as $function$
declare
  r jsonb;
  v_nisn text;
  v_nama text;
  v_kelas text;
  v_jenis_kelamin text;
  v_tanggal_lahir date;
  v_kelas_id bigint;
  v_processed integer := 0;
  v_created integer := 0;
  v_seen_nisns text[] := array[]::text[];
begin
  if not public.eosis_admin_call(p_username, p_password) then
    raise exception 'Sesi pengelola eOSIS tidak valid.';
  end if;

  for r in
    select entry.value
    from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) as entry(value)
  loop
    v_nisn := nullif(btrim(r->>'nisn'), '');
    v_nama := nullif(btrim(r->>'nama'), '');
    v_kelas := nullif(btrim(r->>'kelas'), '');
    v_jenis_kelamin := nullif(btrim(r->>'jenis_kelamin'), '');
    v_tanggal_lahir := nullif(r->>'tgl_lahir', '')::date;

    if v_nisn is null
      or v_nama is null
      or v_kelas is null
      or v_tanggal_lahir is null then
      continue;
    end if;

    if v_nisn = any(v_seen_nisns) then
      continue;
    end if;
    v_seen_nisns := array_append(v_seen_nisns, v_nisn);

    insert into public.kelas (nama_kelas)
    values (v_kelas)
    on conflict (nama_kelas) do nothing;

    select class.id into v_kelas_id
    from public.kelas class
    where class.nama_kelas = v_kelas
    limit 1;

    update public.siswa
    set nama = v_nama,
        tgl_lahir = v_tanggal_lahir,
        kelas_id = v_kelas_id,
        jenis_kelamin = v_jenis_kelamin,
        eosis_eligible = true
    where nisn = v_nisn;

    if not found then
      insert into public.siswa (
        nisn,
        nama,
        tgl_lahir,
        kelas_id,
        jenis_kelamin,
        status_memilih,
        waktu_memilih,
        eosis_eligible
      )
      values (
        v_nisn,
        v_nama,
        v_tanggal_lahir,
        v_kelas_id,
        v_jenis_kelamin,
        false,
        null,
        true
      );
      v_created := v_created + 1;
    end if;

    v_processed := v_processed + 1;
  end loop;

  return json_build_object(
    'processed', v_processed,
    'created', v_created,
    'updated', v_processed - v_created
  );
end;
$function$;

revoke all on function public.eosis_is_super_admin() from public, anon, authenticated;
grant execute on function public.eosis_is_super_admin() to authenticated;

revoke all on function public.eosis_has_admin_access() from public, anon, authenticated;
grant execute on function public.eosis_has_admin_access() to authenticated;

revoke all on function public.eosis_admin_access(text, text) from public, anon, authenticated;
revoke all on function public.eosis_admin_call(text, text) from public, anon, authenticated;
revoke all on function public.eosis_is_admin(text, text) from public, anon, authenticated;
revoke all on function public.admin_login(text, text) from public, anon, authenticated;
grant execute on function public.eosis_admin_call(text, text) to authenticated;
grant execute on function public.eosis_is_admin(text, text) to authenticated;
grant execute on function public.admin_login(text, text) to authenticated;

revoke all on function public.eosis_get_kpu_students() from public, anon, authenticated;
grant execute on function public.eosis_get_kpu_students() to authenticated;

revoke all on function public.eosis_set_kpu_member(uuid, boolean) from public, anon, authenticated;
grant execute on function public.eosis_set_kpu_member(uuid, boolean) to authenticated;

revoke all on function public.eosis_deactivate_deleted_datainduk_voter() from public, anon, authenticated;
revoke all on function public.eosis_sync_voters_from_datainduk() from public, anon, authenticated;
grant execute on function public.eosis_sync_voters_from_datainduk() to authenticated;

revoke all on function public.get_dashboard_stats(text, text) from public, anon, authenticated;
grant execute on function public.get_dashboard_stats(text, text) to authenticated;
revoke all on function public.get_classes_v3(text, text) from public, anon, authenticated;
grant execute on function public.get_classes_v3(text, text) to authenticated;
revoke all on function public.get_class_stats(text, text) from public, anon, authenticated;
grant execute on function public.get_class_stats(text, text) to authenticated;
revoke all on function public.get_voter_registry_v3(text, text) from public, anon, authenticated;
grant execute on function public.get_voter_registry_v3(text, text) to authenticated;
revoke all on function public.get_voter_registry_page_v3(text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.get_voter_registry_page_v3(text, text, integer, integer) to authenticated;
revoke all on function public.get_system_sync_status_v3(text, text) from public, anon, authenticated;
grant execute on function public.get_system_sync_status_v3(text, text) to authenticated;
revoke all on function public.import_students(text, text, jsonb) from public, anon, authenticated;
grant execute on function public.import_students(text, text, jsonb) to authenticated;

do $migration$
declare
  v_signature text;
  v_function regprocedure;
begin
  foreach v_signature in array array[
    'public.update_admin_credentials_v3(text, text, text, text)',
    'public.add_admin_v4(text, text, text, text)',
    'public.get_admins_v4(text, text)',
    'public.delete_admin_v4(text, text, bigint)'
  ] loop
    v_function := to_regprocedure(v_signature);
    if v_function is not null then
      execute format(
        'revoke all on function %s from public, anon, authenticated',
        v_function
      );
    end if;
  end loop;
end;
$migration$;

notify pgrst, 'reload schema';

commit;
