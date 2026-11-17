
## V4.1 hotfix
- Memperbaiki reset pemilihan agar kompatibel dengan safe-update policy PostgreSQL/Supabase: DELETE dan UPDATE massal menggunakan WHERE TRUE.
# eOSIS V4 — Perbaikan Admin, Reset, Sinkronisasi dan PDF

Salin folder ini menggantikan folder frontend V3 setelah database V4 dipasang.

## Database
Jalankan `sql/03_v4_admin_fix.sql` setelah V3. SQL ini:
- memperbaiki RPC `admin_login`;
- membuat tabel `admin_users` dan memindahkan/menyalin akun admin lama;
- menambah fitur tambah/lihat/hapus admin;
- memperbaiki ubah username/password;
- membuat reset hasil menghapus suara, mengembalikan status semua siswa ke BELUM MEMILIH dan mengosongkan waktu memilih;
- menjaga sinkron suara, status siswa dan agregat kandidat;
- memperkuat health check sinkronisasi;
- refresh schema cache PostgREST.

## Frontend
`js/admin.js`, `js/admin-api.js`, `js/admin-management.js`, `admin.html`, dan `js/admin-export.js` sudah diperbarui.

PDF sekarang memusatkan nama kop, subjudul, alamat dan kontak. PDF juga memuat ringkasan DPT, hasil suara, dan partisipasi per kelas.

## Kapasitas
Tidak ada batas 500 suara yang ditanam pada frontend. Dengan 500 data siswa valid, sistem dapat mencatat sampai 500 suara karena setiap siswa hanya dapat memilih satu kali. Dashboard, tabel dan statistik menggunakan nilai database, bukan batas 100/500. Preview Excel tetap hanya menampilkan 100 baris untuk menjaga tampilan browser, tetapi seluruh data tetap diproses saat import.

## Koneksi
Isi `js/supabase.js` dengan Project URL dan Publishable/Anon Key. Jangan gunakan service_role key di browser.
