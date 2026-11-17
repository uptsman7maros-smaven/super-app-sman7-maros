drop policy if exists app_activity_logs_finance_insert on public.app_activity_logs;
drop policy if exists app_activity_logs_actor_insert on public.app_activity_logs;
create policy app_activity_logs_actor_insert on public.app_activity_logs
  for insert to authenticated
  with check (
    actor_id = auth.uid()
    and public.superapp_has_active_role(array[
      'super_admin',
      'kepala_sekolah',
      'operator',
      'kepala_tata_usaha',
      'staff_tata_usaha',
      'guru',
      'guru_bk',
      'siswa',
      'tendik'
    ]::text[])
  );

create index if not exists app_activity_logs_created_at_idx
  on public.app_activity_logs (created_at desc);

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
          or (target_group = 'Guru' and p.role::text in ('guru', 'guru_bk'))
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

do $migration$
declare
  v_table text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach v_table in array array[
      'school_notifications',
      'school_announcements',
      'academic_records',
      'attendance_qr_records',
      'library_loans',
      'library_loan_requests',
      'library_digital_access',
      'attendance_bk_alerts',
      'kb_catatan_bk',
      'letter_requests',
      'finance_transactions',
      'inv_issues',
      'app_activity_logs'
    ]
    loop
      if to_regclass(format('public.%I', v_table)) is not null
        and not exists (
          select 1
          from pg_publication_tables
          where pubname = 'supabase_realtime'
            and schemaname = 'public'
            and tablename = v_table
        )
      then
        execute format('alter publication supabase_realtime add table public.%I', v_table);
      end if;
    end loop;
  end if;
end
$migration$;
