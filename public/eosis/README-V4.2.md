# eOSIS Supabase V4.2

Update ini mempertahankan fitur V4.1 yang sudah berjalan dan hanya memperbarui modul ekspor hasil.

## Perubahan V4.2
- PDF resmi disusun ulang mengikuti format Berita Acara & Rekapitulasi Hasil Pemungutan Suara.
- Masa bakti ditampilkan sebagai tahun, misalnya `2026/2027`.
- Ditambahkan 4 ringkasan: Total DPT, Total Suara Sah Masuk, Belum Memilih, Tingkat Partisipasi.
- Tabel pasangan calon mencakup No. Urut, Pasangan Calon, Slogan Kampanye, Suara Sah, Persentase, Keterangan.
- Ditambahkan rekapitulasi partisipasi pemilih per kelas.
- Bagian Ditetapkan di / Pada tanggal menggunakan pengaturan admin.
- Tata letak tanda tangan: Pembina OSIS dan Ketua Panitia di atas; Kepala Sekolah di tengah bawah.
- Ekspor Excel ikut diselaraskan dengan struktur hasil terbaru.

## Penting
Tidak ada perubahan pada SQL/database pada update V4.2 ini. Database, login admin, reset pemilihan, voting, data siswa, kandidat, kelas, dan pengaturan yang sudah berjalan tetap digunakan.

Ganti hanya file `js/admin-export.js` pada folder V4.1 jika Anda ingin memperbarui project secara manual.
