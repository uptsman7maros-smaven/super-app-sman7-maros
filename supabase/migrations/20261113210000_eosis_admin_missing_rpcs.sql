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
    raise exception 'Akun admin salah.';
  end if;

  return coalesce(
    (
      select json_agg(x order by x.nama_kelas)
      from (
        select k.nama_kelas,
               count(s.id) as total_siswa,
               count(s.id) filter (where s.status_memilih = true) as sudah_memilih
        from public.kelas k
        left join public.siswa s on s.kelas_id = k.id
        group by k.id, k.nama_kelas
      ) x
    ),
    '[]'::json
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
    raise exception 'Akun admin salah.';
  end if;

  return coalesce(
    (
      select json_agg(x order by x.nama_kelas)
      from (
        select c.id, c.nama_kelas, count(s.id) as total_siswa
        from public.kelas c
        left join public.siswa s on s.kelas_id = c.id
        group by c.id, c.nama_kelas
      ) x
    ),
    '[]'::json
  );
end;
$function$;

create or replace function public.delete_class_v3(
  p_username text,
  p_password text,
  p_id bigint
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_student_count integer;
begin
  if not public.eosis_admin_call(p_username, p_password) then
    raise exception 'Akun admin salah.';
  end if;

  select count(*) into v_student_count
  from public.siswa
  where kelas_id = p_id;

  if v_student_count > 0 then
    raise exception 'Kelas tidak dapat dihapus karena masih memiliki % siswa. Pindahkan siswa terlebih dahulu.', v_student_count;
  end if;

  delete from public.kelas where id = p_id;
  if not found then
    raise exception 'Kelas tidak ditemukan.';
  end if;

  return true;
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
begin
  if not public.eosis_admin_call(p_username, p_password) then
    raise exception 'Akun admin salah.';
  end if;

  for r in
    select e.value
    from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) as e(value)
  loop
    v_nisn := nullif(trim(r->>'nisn'), '');
    v_nama := nullif(trim(r->>'nama'), '');
    v_kelas := nullif(trim(r->>'kelas'), '');
    v_jenis_kelamin := nullif(trim(r->>'jenis_kelamin'), '');
    v_tanggal_lahir := nullif(r->>'tgl_lahir', '')::date;

    if v_nisn is null
      or v_nama is null
      or v_kelas is null
      or v_tanggal_lahir is null then
      continue;
    end if;

    insert into public.kelas(nama_kelas)
    values (v_kelas)
    on conflict (nama_kelas) do nothing;

    select id into v_kelas_id
    from public.kelas
    where nama_kelas = v_kelas
    limit 1;

    update public.siswa
    set nama = v_nama,
        tgl_lahir = v_tanggal_lahir,
        kelas_id = v_kelas_id,
        jenis_kelamin = v_jenis_kelamin
    where nisn = v_nisn;

    if not found then
      insert into public.siswa(
        nisn, nama, tgl_lahir, kelas_id, jenis_kelamin, status_memilih, waktu_memilih
      )
      values (
        v_nisn, v_nama, v_tanggal_lahir, v_kelas_id, v_jenis_kelamin, false, null
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

revoke all on function public.get_class_stats(text, text) from public, anon, authenticated;
revoke all on function public.get_classes_v3(text, text) from public, anon, authenticated;
revoke all on function public.delete_class_v3(text, text, bigint) from public, anon, authenticated;
revoke all on function public.import_students(text, text, jsonb) from public, anon, authenticated;

grant execute on function public.get_class_stats(text, text) to authenticated;
grant execute on function public.get_classes_v3(text, text) to authenticated;
grant execute on function public.delete_class_v3(text, text, bigint) to authenticated;
grant execute on function public.import_students(text, text, jsonb) to authenticated;

notify pgrst, 'reload schema';
