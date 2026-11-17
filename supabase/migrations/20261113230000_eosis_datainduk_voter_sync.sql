alter table public.siswa
  add column if not exists eosis_eligible boolean not null default true;

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
    raise exception 'Sesi admin eOSIS tidak valid.';
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
  from public.students s
  join public.classes c on c.id = s.class_id
  join public.academic_years ay on ay.id = c.academic_year_id
  where ay.is_active = true
    and s.status = 'Active'
    and nullif(trim(s.nisn), '') is not null
    and nullif(trim(c.name), '') is not null;

  if v_source_count = 0 then
    raise exception 'Tidak ditemukan siswa Active pada kelas tahun ajaran aktif. Data pemilih eOSIS tidak diubah.';
  end if;

  insert into public.kelas(nama_kelas)
  select distinct trim(c.name)
  from public.students s
  join public.classes c on c.id = s.class_id
  join public.academic_years ay on ay.id = c.academic_year_id
  where ay.is_active = true
    and s.status = 'Active'
    and nullif(trim(s.nisn), '') is not null
    and nullif(trim(c.name), '') is not null
  on conflict (nama_kelas) do nothing;

  select count(*) into v_created
  from public.students s
  join public.classes c on c.id = s.class_id
  join public.academic_years ay on ay.id = c.academic_year_id
  where ay.is_active = true
    and s.status = 'Active'
    and nullif(trim(s.nisn), '') is not null
    and nullif(trim(c.name), '') is not null
    and not exists (
      select 1
      from public.siswa es
      where es.nisn = trim(s.nisn)
    );

  update public.siswa
  set eosis_eligible = false
  where eosis_eligible = true;

  insert into public.siswa(
    nisn,
    nama,
    tgl_lahir,
    kelas_id,
    jenis_kelamin,
    status_memilih,
    waktu_memilih,
    eosis_eligible
  )
  select trim(s.nisn),
         s.full_name,
         s.birth_date,
         k.id,
         s.gender,
         false,
         null,
         true
  from public.students s
  join public.classes c on c.id = s.class_id
  join public.academic_years ay on ay.id = c.academic_year_id
  join public.kelas k on k.nama_kelas = trim(c.name)
  where ay.is_active = true
    and s.status = 'Active'
    and nullif(trim(s.nisn), '') is not null
    and nullif(trim(c.name), '') is not null
  on conflict (nisn) do update
  set nama = excluded.nama,
      tgl_lahir = excluded.tgl_lahir,
      kelas_id = excluded.kelas_id,
      jenis_kelamin = excluded.jenis_kelamin,
      eosis_eligible = true;

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
    raise exception 'Sesi admin eOSIS tidak valid.';
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
    raise exception 'Sesi admin eOSIS tidak valid.';
  end if;

  return coalesce(
    (
      select json_agg(x order by x.nama_kelas)
      from (
        select c.id, c.nama_kelas, count(s.id) as total_siswa
        from public.kelas c
        left join public.siswa s
          on s.kelas_id = c.id
         and s.eosis_eligible = true
        group by c.id, c.nama_kelas
      ) x
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
    raise exception 'Sesi admin eOSIS tidak valid.';
  end if;

  return coalesce(
    (
      select json_agg(x order by x.nama_kelas)
      from (
        select k.nama_kelas,
               count(s.id) as total_siswa,
               count(s.id) filter (where s.status_memilih = true) as sudah_memilih
        from public.kelas k
        left join public.siswa s
          on s.kelas_id = k.id
         and s.eosis_eligible = true
        group by k.id, k.nama_kelas
      ) x
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
    raise exception 'Sesi admin eOSIS tidak valid.';
  end if;

  return coalesce(
    (
      select json_agg(
        json_build_object(
          'id', s.id,
          'nisn', s.nisn,
          'nama', s.nama,
          'nama_kelas', k.nama_kelas,
          'tgl_lahir', s.tgl_lahir,
          'jenis_kelamin', s.jenis_kelamin,
          'status_memilih', s.status_memilih,
          'waktu_memilih', s.waktu_memilih
        )
        order by k.nama_kelas nulls last, s.nama, s.nisn
      )
      from public.siswa s
      left join public.kelas k on k.id = s.kelas_id
      where s.eosis_eligible = true
    ),
    '[]'::json
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
    raise exception 'Sesi admin eOSIS tidak valid.';
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

create or replace function public.eosis_current_student()
returns json
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_student json;
begin
  if auth.uid() is null then
    raise exception 'Masuk ke Super App dengan akun siswa untuk melanjutkan.';
  end if;

  select pg_catalog.json_build_object(
    'nisn', s.nisn,
    'nama', s.nama,
    'nama_kelas', k.nama_kelas,
    'status_memilih', s.status_memilih
  )
  into v_student
  from public.profiles p
  join public.siswa s on s.nisn = p.username
  left join public.kelas k on k.id = s.kelas_id
  where p.id = auth.uid()
    and p.status = 'active'::public.account_status
    and p.role = 'siswa'::public.app_role
    and s.eosis_eligible = true;

  if v_student is null then
    raise exception 'Akun ini tidak terdaftar sebagai pemilih aktif di Data Induk untuk tahun ajaran aktif.';
  end if;

  return v_student;
end;
$function$;

create or replace function public.eosis_cast_vote(p_kandidat_id bigint)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_student public.siswa%rowtype;
  v_voting_active boolean;
begin
  if auth.uid() is null then
    raise exception 'Masuk ke Super App dengan akun siswa untuk memberikan suara.';
  end if;

  select s.*
  into v_student
  from public.profiles p
  join public.siswa s on s.nisn = p.username
  where p.id = auth.uid()
    and p.status = 'active'::public.account_status
    and p.role = 'siswa'::public.app_role
    and s.eosis_eligible = true
  for update of s;

  if not found then
    raise exception 'Akun ini tidak terdaftar sebagai pemilih aktif di Data Induk untuk tahun ajaran aktif.';
  end if;

  select coalesce(pemilihan_aktif, false)
  into v_voting_active
  from public.pengaturan
  order by id
  limit 1;

  if not coalesce(v_voting_active, false) then
    raise exception 'Pemilihan sedang ditutup.';
  end if;

  if v_student.status_memilih then
    raise exception 'Hak suara sudah digunakan.';
  end if;

  if not exists (
    select 1 from public.kandidat where id = p_kandidat_id
  ) then
    raise exception 'Kandidat tidak ditemukan.';
  end if;

  insert into public.suara(kandidat_id, siswa_id)
  values (p_kandidat_id, v_student.id);

  update public.siswa
  set status_memilih = true,
      waktu_memilih = pg_catalog.now()
  where id = v_student.id;

  update public.kandidat
  set total_suara = total_suara + 1
  where id = p_kandidat_id;

  return true;
end;
$function$;

revoke all on function public.eosis_sync_voters_from_datainduk() from public, anon;
grant execute on function public.eosis_sync_voters_from_datainduk() to authenticated;

notify pgrst, 'reload schema';
