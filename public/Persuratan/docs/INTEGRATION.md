# Integrasi ke SUPER APP SMAN 7 MAROS

## Pilihan integrasi autentikasi

**Role Persuratan:** `public.profiles` adalah sumber tunggal. Jalankan `supabase/003_superapp_role_access.sql` setelah migrasi skema. Fungsi `letter_current_role()` memetakan role aktif Super App ke hak akses Persuratan; perubahan role/status tidak memerlukan seed ulang.

Instalasi baru: jalankan `001_persuratan.sql`, kemudian `003_superapp_role_access.sql`. Instalasi yang sudah memiliki skema: jalankan `003_superapp_role_access.sql` saja. Modul utama menggunakan instance Supabase SUPER APP yang sama, sehingga sesi login yang aktif dipakai kembali tanpa login/logout kedua. Jangan membuat Supabase client kedua. Tetap uji RLS dan workflow dengan akun tiap role.

Jika migrasi `letter_current_role()` belum ditemukan, jalankan `supabase/003_superapp_role_access.sql`. Jika sesudahnya tabel data Persuratan masih menampilkan `permission denied`, jalankan `supabase/002_persuratan_table_grants.sql`. Lalu tekan **Coba lagi** di modul.

## Prefix dan isolasi

Seluruh objek menggunakan prefix `letter_` atau nama yang khusus untuk persuratan. Tidak ada perintah DROP pada tabel aplikasi lain. Bucket yang dibuat adalah `letter-files`.

## Memasang sebagai modul

Komponen Persuratan dipasang di `src/PersuratanModule.jsx` dan memakai client dari `src/lib/supabase.ts`. CSS-nya dibatasi dalam `.letter-app` agar tidak mengubah gaya modul lain. Komponen dibuka melalui menu Persuratan di SUPER APP.

## Catatan skema

Nama kolom `profiles` tidak diasumsikan. Jika ingin menampilkan NIP/jabatan dari profil utama, lakukan join melalui view atau query yang disesuaikan setelah memeriksa skema aktual.
