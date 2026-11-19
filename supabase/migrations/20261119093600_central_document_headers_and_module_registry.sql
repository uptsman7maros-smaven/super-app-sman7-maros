begin;

alter table public.school_settings
  add column if not exists letterhead_2 text not null default '',
  add column if not exists logo_url_2 text not null default '';

create table if not exists public.app_module_settings (
  id uuid primary key default gen_random_uuid(),
  module_key text not null,
  label text not null,
  is_enabled boolean not null default true,
  route_key text not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

alter table public.app_module_settings
  add column if not exists module_key text,
  add column if not exists label text,
  add column if not exists is_enabled boolean not null default true,
  add column if not exists route_key text,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists updated_by uuid references auth.users(id);

create index if not exists app_module_settings_route_key_idx
  on public.app_module_settings (route_key);

alter table public.app_module_settings enable row level security;

drop policy if exists app_module_settings_active_read on public.app_module_settings;
create policy app_module_settings_active_read
  on public.app_module_settings
  for select
  to authenticated
  using (
    public.superapp_has_active_role(array[
      'super_admin','kepala_sekolah','operator','kepala_tata_usaha',
      'staff_tata_usaha','guru','guru_bk','siswa','tendik'
    ]::text[])
  );

drop policy if exists app_module_settings_super_admin_write on public.app_module_settings;
create policy app_module_settings_super_admin_write
  on public.app_module_settings
  for all
  to authenticated
  using (public.superapp_has_active_role(array['super_admin']::text[]))
  with check (public.superapp_has_active_role(array['super_admin']::text[]));

drop policy if exists app_module_settings_write_guard on public.app_module_settings;
create policy app_module_settings_write_guard
  on public.app_module_settings
  as restrictive
  for insert
  to authenticated
  with check (public.superapp_has_active_role(array['super_admin']::text[]));

drop policy if exists app_module_settings_update_guard on public.app_module_settings;
create policy app_module_settings_update_guard
  on public.app_module_settings
  as restrictive
  for update
  to authenticated
  using (public.superapp_has_active_role(array['super_admin']::text[]))
  with check (public.superapp_has_active_role(array['super_admin']::text[]));

drop policy if exists app_module_settings_delete_guard on public.app_module_settings;
create policy app_module_settings_delete_guard
  on public.app_module_settings
  as restrictive
  for delete
  to authenticated
  using (public.superapp_has_active_role(array['super_admin']::text[]));

grant select, insert, update, delete on public.app_module_settings to authenticated;

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

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'school-letterheads',
  'school-letterheads',
  true,
  8388608,
  array['image/png', 'image/jpeg']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists school_letterheads_public_read on storage.objects;
create policy school_letterheads_public_read
  on storage.objects
  for select
  to public
  using (bucket_id = 'school-letterheads');

drop policy if exists school_letterheads_super_admin_insert on storage.objects;
create policy school_letterheads_super_admin_insert
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'school-letterheads'
    and public.superapp_has_active_role(array['super_admin']::text[])
  );

drop policy if exists school_letterheads_super_admin_update on storage.objects;
create policy school_letterheads_super_admin_update
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'school-letterheads'
    and public.superapp_has_active_role(array['super_admin']::text[])
  )
  with check (
    bucket_id = 'school-letterheads'
    and public.superapp_has_active_role(array['super_admin']::text[])
  );

drop policy if exists school_letterheads_super_admin_delete on storage.objects;
create policy school_letterheads_super_admin_delete
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'school-letterheads'
    and public.superapp_has_active_role(array['super_admin']::text[])
  );

commit;
