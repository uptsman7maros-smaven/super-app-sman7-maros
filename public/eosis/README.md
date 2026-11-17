# eOSIS Supabase V3 — Update Lanjutan

Versi ini adalah **update dari eOSIS Supabase V2**. Struktur dibuat modular agar fitur baru tidak bercampur dengan fitur lama.

## Urutan pemasangan

### 1. Jangan hapus project Supabase lama
Database lama tetap dipakai.

### 2. Jalankan SQL V3
Di Supabase → SQL Editor → New query:
1. Buka file `sql/02_v3_update.sql`.
2. Copy seluruh isinya.
3. Paste ke SQL Editor.
4. Klik Run.
5. Harus muncul `Success` tanpa error.
6. Jika fungsi baru belum terbaca, jalankan:
```sql
NOTIFY pgrst, 'reload schema';
```

**Jangan jalankan `01_management_migration.sql` lagi jika V2 Anda sudah berhasil.**

### 3. Isi koneksi Supabase
Buka `js/supabase.js` lalu isi:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

Gunakan **Publishable/Anon key**, jangan pernah memakai `service_role`.

### 4. Jalankan website
Buka folder ini di VS Code dan jalankan `index.html` dengan Live Server.

## Fitur V3

- Import Excel: NISN, Nama, Kelas, Tanggal Lahir, Jenis Kelamin.
- Tombol **Generate Preview** setelah file dipilih.
- Preview dan tabel pemilih menampilkan Status Hak Suara dan Waktu Memilih.
- Sinkronisasi data siswa berdasarkan NISN.
- Kelas otomatis dibuat saat import jika belum ada.
- Tambah kelas.
- Hapus kelas hanya jika kelas tidak sedang dipakai siswa.
- Daftar pemilih tersinkron langsung dari Supabase.
- Edit/tambah kandidat, foto, visi, misi, slogan.
- Buka/tutup pemilihan.
- Reset hasil: suara = 0, status hak suara = belum memilih, waktu memilih = kosong.
- Waktu memilih otomatis dicatat saat suara berhasil masuk.
- Grafik suara.
- Edit nama sekolah dan logo.
- Pengaturan kop.
- Masa bakti kandidat terpilih.
- Tempat dan tanggal penetapan.
- Nama/NIP Pembina OSIS.
- Nama/NISN Ketua Panitia.
- Nama/NIP Kepala Sekolah.
- Unduh hasil PDF resmi dan Excel.
- Ganti username dan password admin.
- Pemeriksaan Database & Sinkronisasi.
- Halaman publik tetap mengambil nama/logo/status dari Supabase.

## Format Excel

Baris pertama wajib memiliki judul:
`NISN | Nama | Kelas | Tanggal Lahir | Jenis Kelamin`

Contoh:
`1234567890 | Agus | XII IPA 1 | 2006-05-14 | L`

Tanggal lahir boleh berupa tanggal Excel atau format `YYYY-MM-DD` / `DD-MM-YYYY`.

## Catatan PDF

PDF dibuat sebagai format resmi dengan:
- kop sekolah + logo
- judul hasil pemilihan
- masa bakti
- rekap suara dan persentase
- Ditetapkan di
- Pada tanggal
- 3 kolom tanda tangan:
  - Pembina OSIS (Nama + NIP)
  - Ketua Panitia (Nama + NISN)
  - Kepala Sekolah (Nama + NIP)

Nilai tersebut diisi dari menu **Sekolah & Pengaturan**, sehingga tidak perlu mengedit PDF secara manual.

Jika nanti Anda memiliki contoh PDF/gambar kop yang harus ditiru 100%, kirimkan gambar tersebut dan bagian layout PDF dapat disesuaikan tanpa mengubah database voting.

## Keamanan

- Jangan masukkan service_role key ke JavaScript.
- Operasi admin eOSIS memakai sesi Super App aktif dengan role admin yang diizinkan; tidak ada password admin eOSIS terpisah.
- Pemilih harus masuk ke Super App memakai akun siswa aktif; username profil harus sama dengan NISN pada daftar pemilih.
- Identitas pemilih dan status hak suara diverifikasi di server. NISN/tanggal lahir atau data `sessionStorage` tidak lagi menjadi bukti autentikasi.
- Akses anonim ke RPC login dan pengiriman suara legacy dicabut.
- `suara` tetap tidak menyimpan NISN pemilih.

Untuk instalasi yang sudah memakai skema eOSIS legacy, tinjau dan jalankan migrasi `20261113132500_eosis_superapp_admin_auth.sql`, `20261113140000_eosis_student_auth.sql`, lalu `20261113160000_eosis_admin_superapp_sso.sql`. Jalankan migrasi satu kali dan jangan mengulang migrasi lama yang sudah diterapkan.
