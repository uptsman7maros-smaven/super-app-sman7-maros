begin;

delete from public.app_module_settings
where regexp_replace(lower(coalesce(route_key, label, module_key)), '[^a-z0-9]', '', 'g')
  in (
    'dashboard',
    'akademikdigital',
    'inventarisdigital',
    'keuangandigital',
    'kesiswaanbk',
    'pengaturanintegrasi',
    'perpustakaandigital',
    'persuratandigital'
  );

insert into public.app_module_settings (module_key, label, route_key, is_enabled)
select registry.module_key, registry.label, registry.route_key, true
from (values
  ('data-induk', 'Data Induk', 'Data Induk'),
  ('absensi-digital', 'Absensi Digital', 'Absensi Digital'),
  ('persuratan', 'Persuratan', 'Persuratan'),
  ('perpustakaan', 'Perpustakaan', 'Perpustakaan'),
  ('inventaris', 'Inventaris', 'Inventaris'),
  ('keuangan', 'Keuangan', 'Keuangan'),
  ('akademik', 'Akademik', 'Akademik'),
  ('smaven-learn', 'SMAVEN Learn', 'SMAVEN Learn'),
  ('kesiswaan', 'Kesiswaan', 'Kesiswaan'),
  ('bimbingan-dan-konseling', 'Bimbingan dan Konseling', 'Bimbingan dan Konseling'),
  ('pemilihan-osis', 'Pemilihan OSIS', 'Pemilihan OSIS'),
  ('laporan-analitik', 'Laporan & Analitik', 'Laporan & Analitik'),
  ('pengguna', 'Pengguna', 'Pengguna'),
  ('pengaturan', 'Pengaturan', 'Pengaturan')
) as registry(module_key, label, route_key)
where not exists (
  select 1
  from public.app_module_settings existing
  where regexp_replace(lower(coalesce(existing.route_key, existing.label, existing.module_key)), '[^a-z0-9]', '', 'g')
    = regexp_replace(lower(registry.route_key), '[^a-z0-9]', '', 'g')
);

commit;
