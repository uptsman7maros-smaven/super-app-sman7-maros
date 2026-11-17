# Super App SMAN 7 Maros

Portal sekolah berbasis React, TypeScript, Vite, dan Supabase. Data sekolah serta autentikasi tetap berada di Supabase; Vercel menyajikan aplikasi web dan dapat membangun ulang aplikasi dari GitHub.

## Menjalankan secara lokal

1. Pasang dependensi dengan `npm ci`.
2. Buat `.env.local` dengan variabel berikut:

   ```dotenv
   VITE_SUPABASE_URL=https://<project-ref>.supabase.co
   VITE_SUPABASE_ANON_KEY=<supabase-anon-key>
   ```

3. Jalankan `npm run dev`.

Jangan pernah menyimpan `service_role` key atau token Fonnte dalam variabel `VITE_*`, karena nilai tersebut dikirim ke browser. `FONNTE_TOKEN` harus tetap menjadi secret pada Supabase Edge Functions.

## Pemeriksaan sebelum deploy

```bash
npm ci
npm run lint
npm run build
```

## Deploy ke Vercel melalui GitHub

1. Hubungkan repository GitHub ke Vercel dan pilih root proyek ini.
2. Gunakan framework preset **Vite**, build command `npm run build`, dan output directory `dist`.
3. Tambahkan `VITE_SUPABASE_URL` dan `VITE_SUPABASE_ANON_KEY` pada Vercel untuk Production, Preview, dan Development sesuai kebutuhan. Gunakan nilai project Supabase yang sama dengan aplikasi.
4. Setelah memperoleh domain Vercel, tambahkan domain tersebut ke Supabase Authentication URL Configuration (Site URL dan Redirect URLs).
5. Terapkan migrasi di `supabase/migrations` ke database Supabase sebelum menggunakan fitur pemeliharaan.

`vercel.json` mengarahkan permintaan halaman kembali ke `index.html`, sehingga aplikasi satu halaman tetap dapat dibuka melalui URL langsung.

## Pengumuman pemeliharaan

Super Admin dapat mengaktifkan atau menonaktifkan pemberitahuan pemeliharaan pada **Pengaturan & Integrasi → Backup & sistem**. Pesan tampil untuk semua pengunjung dan akun serta diperbarui melalui Supabase Realtime. Pemberitahuan ini tidak memblokir login atau menghentikan akses aplikasi.
