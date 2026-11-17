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
    and p.role = 'siswa'::public.app_role;

  if v_student is null then
    raise exception 'Akun Super App ini tidak terdaftar sebagai pemilih siswa aktif.';
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
  for update of s;

  if not found then
    raise exception 'Akun Super App ini tidak terdaftar sebagai pemilih siswa aktif.';
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
    select 1
    from public.kandidat
    where id = p_kandidat_id
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

revoke all on function public.eosis_current_student() from public, anon, authenticated;
revoke all on function public.eosis_cast_vote(bigint) from public, anon, authenticated;
grant execute on function public.eosis_current_student() to authenticated;
grant execute on function public.eosis_cast_vote(bigint) to authenticated;

do $block$
declare
  v_function record;
begin
  for v_function in
    select p.proname,
           pg_catalog.oidvectortypes(p.proargtypes) as argument_types
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('student_login', 'submit_vote')
  loop
    execute pg_catalog.format(
      'revoke all on function %I.%I(%s) from public, anon, authenticated',
      'public',
      v_function.proname,
      v_function.argument_types
    );
  end loop;
end;
$block$;
