create or replace function public.get_classes_v3(p_username text, p_password text)
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
      select json_agg(json_build_object('id', c.id, 'nama_kelas', c.nama_kelas) order by c.nama_kelas)
      from public.kelas c
    ),
    '[]'::json
  );
end;
$function$;

create or replace function public.add_class(
  p_username text,
  p_password text,
  p_nama_kelas text
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_id bigint;
begin
  if not public.eosis_admin_call(p_username, p_password) then
    raise exception 'Akun admin salah.';
  end if;

  insert into public.kelas(nama_kelas)
  values (trim(p_nama_kelas))
  on conflict (nama_kelas) do nothing
  returning id into v_id;

  if v_id is null then
    select c.id into v_id
    from public.kelas c
    where c.nama_kelas = trim(p_nama_kelas);
  end if;

  return v_id;
end;
$function$;

create or replace function public.get_voter_registry_v3(p_username text, p_password text)
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
        order by s.nama
      )
      from public.siswa s
      left join public.kelas k on k.id = s.kelas_id
    ),
    '[]'::json
  );
end;
$function$;
