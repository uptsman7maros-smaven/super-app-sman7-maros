create or replace function public.save_school_settings_v3(
  p_username text,
  p_password text,
  p_nama_sekolah text,
  p_logo_url text,
  p_kop_nama_sekolah text,
  p_kop_subjudul text,
  p_kop_alamat text,
  p_kop_kontak text,
  p_masa_bakti_mulai date,
  p_masa_bakti_selesai date,
  p_ditetapkan_di text,
  p_tanggal_ditetapkan date,
  p_pembina_osis_nama text,
  p_pembina_osis_nip text,
  p_ketua_panitia_nama text,
  p_ketua_panitia_nisn text,
  p_kepala_sekolah_nama text,
  p_kepala_sekolah_nip text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if not public.eosis_admin_call(p_username, p_password) then
    raise exception 'Akun admin salah.';
  end if;

  if p_masa_bakti_mulai is not null
    and p_masa_bakti_selesai is not null
    and p_masa_bakti_selesai < p_masa_bakti_mulai then
    raise exception 'Tanggal akhir masa bakti tidak boleh sebelum tanggal mulai.';
  end if;

  update public.pengaturan
  set nama_sekolah = coalesce(nullif(trim(p_nama_sekolah), ''), 'SMAN 7 MAROS'),
      logo_url = nullif(p_logo_url, ''),
      kop_nama_sekolah = coalesce(
        nullif(trim(p_kop_nama_sekolah), ''),
        coalesce(nullif(trim(p_nama_sekolah), ''), 'SMAN 7 MAROS')
      ),
      kop_subjudul = coalesce(nullif(trim(p_kop_subjudul), ''), 'PEMILIHAN KETUA DAN WAKIL KETUA OSIS'),
      kop_alamat = coalesce(p_kop_alamat, ''),
      kop_kontak = coalesce(p_kop_kontak, ''),
      masa_bakti_mulai = p_masa_bakti_mulai,
      masa_bakti_selesai = p_masa_bakti_selesai,
      ditetapkan_di = coalesce(p_ditetapkan_di, ''),
      tanggal_ditetapkan = p_tanggal_ditetapkan,
      pembina_osis_nama = coalesce(p_pembina_osis_nama, ''),
      pembina_osis_nip = coalesce(p_pembina_osis_nip, ''),
      ketua_panitia_nama = coalesce(p_ketua_panitia_nama, ''),
      ketua_panitia_nisn = coalesce(p_ketua_panitia_nisn, ''),
      kepala_sekolah_nama = coalesce(p_kepala_sekolah_nama, ''),
      kepala_sekolah_nip = coalesce(p_kepala_sekolah_nip, '')
  where id = (select id from public.pengaturan order by id limit 1);

  return true;
end;
$function$;

revoke all on function public.save_school_settings_v3(
  text, text, text, text, text, text, text, text, date, date,
  text, date, text, text, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.save_school_settings_v3(
  text, text, text, text, text, text, text, text, date, date,
  text, date, text, text, text, text, text, text
) to authenticated;
