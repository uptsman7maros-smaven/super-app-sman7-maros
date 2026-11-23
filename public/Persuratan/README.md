# Modul Persuratan Digital — SMAN 7 Maros

Starter module React + Vite + Supabase. Paket ini disusun berdasarkan spesifikasi persuratan sekolah: template builder dasar, pengajuan, persetujuan Kepala TU/Kepala Sekolah, nomor surat transaksional, PDF/cetak A4, arsip, surat masuk/keluar, disposisi, notifikasi, QR verifikasi, laporan, dan audit.

## Penting sebelum dipasang

Paket ini menggunakan `public.profiles` SUPER APP sebagai sumber role tunggal. Setelah migrasi akses dijalankan, tabel pemetaan lama `public.letter_user_roles` tidak digunakan untuk otorisasi.

Jalankan di project Supabase pengembangan terlebih dahulu. Tinjau seluruh SQL, khususnya bucket dan policies, sebelum produksi. Jangan menaruh `service_role` key di frontend.

## Isi paket

- `supabase/001_persuratan.sql` — skema, fungsi, trigger, RLS, Storage policies.
- `supabase/002_persuratan_table_grants.sql` — privilege tabel untuk instalasi lama bila diperlukan.
- `supabase/003_superapp_role_access.sql` — pemetaan role langsung dari profil SUPER APP, kebijakan RLS, dan grant.
- `../../supabase/migrations/20261123130000_persuratan_template_access_and_staff_workflow.sql` — izin template Guru/Staf, dokumen tanpa identitas pengaju, akses administrator, serta alur Kepala/Staf TU.
- `src/` — antarmuka React responsif, Supabase client, workflow dasar, preview A4.
- `.env.example` — variabel frontend.
- `package.json` — dependensi.
- `supabase/SEED_ADMIN.sql` — laporan pratinjau pemetaan role (tidak menulis data).
- `docs/INTEGRATION.md` — integrasi dengan SUPER APP.

## Menjalankan

1. Buat project Supabase atau gunakan project SUPER APP setelah meninjau SQL.
2. Jalankan `supabase/001_persuratan.sql`, lalu `supabase/003_superapp_role_access.sql` di SQL Editor.
3. Gunakan akun SUPER APP yang sudah aktif; sesi login yang sama dipakai oleh modul Persuratan.
4. Pastikan akun memiliki profil aktif di `public.profiles`. Role Persuratan dibaca langsung dari profil; tidak ada sinkronisasi/penyalinan role kedua.
5. Salin `.env.example` menjadi `.env` dan isi URL serta anon key.
6. Jalankan:

```bash
npm install
npm run dev
```

Untuk instalasi lama, jalankan `supabase/003_superapp_role_access.sql`. Migrasi ini memperbarui pemetaan role dan grant tabel, mempertahankan RLS, serta membuat perubahan role Super App berlaku langsung. `supabase/002_persuratan_table_grants.sql` dapat dipakai terpisah hanya jika error izin tabel masih muncul. `supabase/SEED_ADMIN.sql` kini hanya menampilkan laporan pemetaan dan tidak menulis role.

## Hak akses peran

`public.profiles` SUPER APP adalah satu-satunya sumber role. Hanya profil berstatus `active` yang mendapat akses; perubahan role/status langsung berlaku di RLS.

| Role Super App | Role Persuratan | Hak akses utama |
| --- | --- | --- |
| `super_admin` | `administrator` | Akses seluruh menu dan data; mengelola template/pengaturan; menyetujui dan menerbitkan surat. |
| `operator` | `operator` | Melihat proses dan arsip, mengelola surat masuk/keluar dan disposisi; tidak menyetujui atau menerbitkan nomor. |
| `kepala_tata_usaha` | `kepala_tu` | Memeriksa, merevisi, menyetujui/menolak, menerbitkan nomor, dan mengelola administrasi surat. |
| `staff_tata_usaha` | `staf_tu` | Melihat semua format aktif, memproses pengajuan, menerbitkan nomor, serta menangani surat masuk/keluar. |
| `kepala_sekolah` | `kepala_sekolah` | Melihat proses dan memberi persetujuan untuk template yang mensyaratkannya. |
| `guru`, `tendik` | `guru_staf` | Membuat serta melacak pengajuan sendiri. |
| `siswa` | `pemohon` | Membuat serta melacak pengajuan sendiri; tidak melihat data pengguna lain. |

Penetapan role dilakukan di menu Pengguna SUPER APP. Tabel lama `letter_user_roles` tidak lagi dipakai untuk otorisasi.

## Pengaturan dan pratinjau

- Administrator dapat menentukan apakah format tersedia untuk Guru/Staf dan apakah identitas pengaju disembunyikan dari dokumen.
- Import DOCX membaca struktur dokumen, style, tabel, tab stop, dan metadata ukuran halaman; import PDF mempertahankan koordinat teks dan ukuran font sejauh tersedia pada PDF berbasis teks.
- Pratinjau mendukung zoom dan ukuran A4/F4. Periksa hasil impor dan margin di editor sebelum format disimpan.
- PDF final dirender dari HTML melalui browser. Untuk hasil server-side yang konsisten lintas perangkat, tambahkan layanan backend/headless browser.
- QR verifikasi menggunakan URL publik dengan token acak; endpoint verifikasi perlu dipublikasikan melalui aplikasi.
- Notifikasi tersimpan di tabel dan dapat dikembangkan menjadi Supabase Realtime.
- Pengiriman email/WhatsApp tidak dikonfigurasi.
- Tanda tangan gambar bukan tanda tangan elektronik tersertifikasi.
- Excel export dan backup terjadwal merupakan tahap pengembangan lanjutan.

## Keamanan

RLS aktif pada tabel-tabel utama. Jalur file Storage dibatasi dengan folder berbasis `auth.uid()` untuk unggahan pengguna; dokumen final dibaca oleh role yang berwenang. Fungsi SECURITY DEFINER memakai `search_path = ''` dan referensi objek berkualifikasi schema. Tetap lakukan pengujian RLS dengan akun tiap role sebelum produksi.
