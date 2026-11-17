drop policy if exists school_notifications_target_group_visibility
  on public.school_notifications;

create policy school_notifications_target_group_visibility
  on public.school_notifications
  as restrictive
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.status = 'active'
        and (
          p.role::text = 'super_admin'
          or target_group = 'Semua pengguna'
          or (target_group = 'Guru' and p.role::text = 'guru')
          or (target_group = 'Siswa' and p.role::text = 'siswa')
          or (
            target_group = 'Tenaga Kependidikan'
            and p.role::text in ('kepala_tata_usaha', 'staff_tata_usaha', 'tendik')
          )
          or (target_group = 'Operator' and p.role::text = 'operator')
          or (target_group = 'Kepala Sekolah' and p.role::text = 'kepala_sekolah')
        )
    )
  );
