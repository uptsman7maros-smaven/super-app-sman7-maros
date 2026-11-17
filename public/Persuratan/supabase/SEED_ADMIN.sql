-- Compatibility report only. Role assignment is now read directly from
-- public.profiles by 003_superapp_role_access.sql; no separate seed is needed.
select
  p.id as user_id,
  p.username,
  p.role as super_app_role,
  case p.role::text
    when 'super_admin' then 'administrator'
    when 'operator' then 'operator'
    when 'kepala_tata_usaha' then 'kepala_tu'
    when 'staff_tata_usaha' then 'staf_tu'
    when 'kepala_sekolah' then 'kepala_sekolah'
    when 'guru' then 'guru_staf'
    when 'tendik' then 'guru_staf'
    when 'siswa' then 'pemohon'
  end as persuratan_role
from public.profiles p
where p.status = 'active'
  and p.role::text in (
    'super_admin',
    'operator',
    'kepala_tata_usaha',
    'staff_tata_usaha',
    'kepala_sekolah',
    'guru',
    'tendik',
    'siswa'
  )
order by p.role, p.username;
