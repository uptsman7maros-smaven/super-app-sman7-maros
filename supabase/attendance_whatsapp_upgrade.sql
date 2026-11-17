-- Jalankan di Supabase Dashboard > SQL Editor
-- 1. Nomor WhatsApp orang tua pada data siswa
alter table public.students
  add column if not exists parent_phone text;

create index if not exists students_parent_phone_idx
  on public.students (parent_phone)
  where parent_phone is not null;

-- 2. Pengaturan notifikasi Absensi Digital
create table if not exists public.attendance_notification_settings (
  id smallint primary key default 1 check (id = 1),
  enabled boolean not null default false,
  message_template text not null default 'Assalamu’alaikum Bapak/Ibu,

Kami informasikan bahwa putra/putri Bapak/Ibu, *{nama}*, tercatat *{status}* pada *{tanggal} pukul {jam}*.

Terima kasih atas perhatian Bapak/Ibu.',
  provider text not null default 'Fonnte',
  updated_at timestamptz not null default now()
);

insert into public.attendance_notification_settings (id)
values (1)
on conflict (id) do nothing;

alter table public.attendance_notification_settings
  alter column message_template
  set default 'Assalamu’alaikum Bapak/Ibu,

Kami informasikan bahwa putra/putri Bapak/Ibu, *{nama}*, tercatat *{status}* pada *{tanggal} pukul {jam}*.

Terima kasih atas perhatian Bapak/Ibu.';

update public.attendance_notification_settings
set message_template = 'Assalamu’alaikum Bapak/Ibu,

Kami informasikan bahwa putra/putri Bapak/Ibu, *{nama}*, tercatat *{status}* pada *{tanggal} pukul {jam}*.

Terima kasih atas perhatian Bapak/Ibu.'
where id = 1
  and message_template = 'Assalamualaikum, putra/putri Anda {nama} tercatat {status} pada {tanggal}.';

alter table public.attendance_notification_settings enable row level security;

drop policy if exists attendance_settings_admin_read on public.attendance_notification_settings;
create policy attendance_settings_admin_read on public.attendance_notification_settings
  for select to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('super_admin', 'operator', 'kepala_sekolah')
    )
  );

drop policy if exists attendance_settings_admin_write on public.attendance_notification_settings;
create policy attendance_settings_admin_write on public.attendance_notification_settings
  for all to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('super_admin', 'operator', 'kepala_sekolah')
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('super_admin', 'operator', 'kepala_sekolah')
    )
  );

grant select, insert, update on public.attendance_notification_settings to authenticated;

-- 3. Log pengiriman agar status dan kegagalan dapat diaudit
create table if not exists public.attendance_whatsapp_logs (
  id uuid primary key default gen_random_uuid(),
  attendance_record_id uuid references public.attendance_records(id) on delete set null,
  student_id uuid references public.students(id) on delete set null,
  phone text,
  message text,
  status text not null default 'queued' check (status in ('queued', 'sent', 'failed')),
  provider_response jsonb,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

alter table public.attendance_whatsapp_logs enable row level security;

drop policy if exists attendance_wa_logs_admin on public.attendance_whatsapp_logs;
create policy attendance_wa_logs_admin on public.attendance_whatsapp_logs
  for select to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('super_admin', 'operator', 'kepala_sekolah')
    )
  );
