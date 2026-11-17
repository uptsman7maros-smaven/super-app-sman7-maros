-- Menjaga agar satu record absensi tidak dapat membuat log WhatsApp sent lebih dari sekali.
-- Migrasi ini hanya membuat index jika tidak ada duplikasi sent pada record yang sama.
-- Migrasi tidak mengubah struktur, menghapus data, atau mengubah enum/role.

do $$
begin
  if not exists (
    select 1
    from public.attendance_whatsapp_logs
    where attendance_record_id is not null
      and status = 'sent'
    group by attendance_record_id
    having count(*) > 1
  ) then
    create unique index if not exists attendance_whatsapp_logs_sent_record_uidx
      on public.attendance_whatsapp_logs (attendance_record_id)
      where status = 'sent';
  else
    raise notice 'attendance_whatsapp_logs_sent_record_uidx tidak dibuat: terdapat log sent duplikat; periksa dan rapikan log sebelum menjalankan index lagi.';
  end if;
end;
$$;
