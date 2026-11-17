import type { SectionConfig, SectionKey } from "./types";

export const PRESTASI_LEVELS = ["Sekolah", "Kabupaten", "Provinsi", "Nasional", "Internasional"] as const;
export const BK_SERVICE_AREAS = ["Pribadi", "Sosial", "Belajar", "Karir"] as const;
export const BK_SERVICE_TYPES = [
  "Konseling Individu",
  "Konseling Kelompok",
  "Mediasi",
  "Home Visit",
  "Konferensi Kasus",
  "Panggilan Orang Tua",
] as const;
export const CASE_PRIORITIES = ["Normal", "Pantauan", "Mendesak"] as const;
export const CASE_STATUSES = ["Terbuka", "Dalam Pendampingan", "Selesai"] as const;
export const PERMISSION_STATUSES = ["Menunggu", "Disetujui", "Ditolak", "Selesai"] as const;
export const REFERRAL_TYPES = ["Akademik", "Kehadiran", "Perilaku", "Lainnya"] as const;
export const REFERRAL_STATUSES = ["Perlu Asesmen", "Dalam Pendampingan", "Selesai"] as const;
export const CAREER_PLANS = ["SNBP", "SNBT", "Kedinasan", "Vokasi", "Bekerja"] as const;

export const SECTION_CONFIGS: readonly SectionConfig[] = [
  {
    key: "Prestasi",
    table: "kb_prestasi",
    dateField: "tanggal",
    legacyStudentNameField: "nama_siswa",
    fields: [
      { key: "student_id", label: "Siswa", required: true, kind: "student" },
      { key: "nama_prestasi", label: "Prestasi", required: true },
      { key: "tingkat", label: "Tingkat", kind: "select", options: PRESTASI_LEVELS },
      { key: "tanggal", label: "Tanggal", kind: "date" },
    ],
  },
  {
    key: "Ekstrakurikuler",
    table: "kb_ekstrakurikuler",
    fields: [
      { key: "student_id", label: "Siswa", kind: "student" },
      { key: "nama_ekskul", label: "Nama ekstrakurikuler", required: true },
      { key: "pembina", label: "Pembina" },
      { key: "jadwal", label: "Jadwal" },
      { key: "lokasi", label: "Lokasi" },
    ],
  },
  {
    key: "Catatan BK",
    table: "kb_catatan_bk",
    private: true,
    dateField: "tanggal",
    legacyStudentNameField: "nama_siswa",
    fields: [
      { key: "student_id", label: "Siswa", required: true, kind: "student" },
      { key: "tanggal", label: "Tanggal", kind: "date" },
      { key: "bidang_layanan", label: "Bidang layanan", kind: "select", options: BK_SERVICE_AREAS },
      { key: "jenis_layanan", label: "Jenis layanan", kind: "select", options: BK_SERVICE_TYPES },
      { key: "prioritas", label: "Prioritas", kind: "select", options: CASE_PRIORITIES },
      { key: "status_kasus", label: "Status kasus", kind: "select", options: CASE_STATUSES },
      { key: "ringkasan", label: "Ringkasan", required: true, kind: "textarea" },
      { key: "tindak_lanjut", label: "Tindak lanjut", kind: "textarea" },
      { key: "tanggal_kontrol", label: "Tanggal kontrol", kind: "date" },
    ],
  },
  {
    key: "Jadwal BK",
    table: "kb_jadwal_bk",
    dateField: "hari_tanggal",
    fields: [
      { key: "student_id", label: "Siswa", kind: "student" },
      { key: "nama_guru_bk", label: "Guru BK", required: true },
      { key: "hari_tanggal", label: "Tanggal", required: true, kind: "date" },
      { key: "waktu", label: "Waktu", kind: "time" },
      { key: "lokasi", label: "Lokasi" },
      { key: "keterangan", label: "Keterangan", kind: "textarea" },
    ],
  },
  {
    key: "Perizinan",
    table: "kb_perizinan",
    dateField: "tanggal",
    legacyStudentNameField: "nama_siswa",
    fields: [
      { key: "student_id", label: "Siswa", required: true, kind: "student" },
      { key: "tanggal", label: "Tanggal", required: true, kind: "date" },
      { key: "alasan", label: "Alasan", kind: "textarea" },
      { key: "status_tindak_lanjut", label: "Status tindak lanjut", kind: "select", options: PERMISSION_STATUSES },
    ],
  },
  {
    key: "OSIS & Kegiatan",
    table: "kb_osis_kegiatan",
    dateField: "tanggal",
    fields: [
      { key: "student_id", label: "Siswa", kind: "student" },
      { key: "nama_kegiatan", label: "Nama kegiatan", required: true },
      { key: "organisasi", label: "Organisasi/ekskul" },
      { key: "penanggung_jawab", label: "Penanggung jawab" },
      { key: "tanggal", label: "Tanggal", kind: "date" },
      { key: "keterangan", label: "Keterangan", kind: "textarea" },
    ],
  },
  {
    key: "Rujukan BK",
    table: "kb_referrals",
    fields: [
      { key: "student_id", label: "Siswa", required: true, kind: "student" },
      { key: "referral_type", label: "Jenis rujukan", required: true, kind: "select", options: REFERRAL_TYPES },
      { key: "subject_name", label: "Mata pelajaran" },
      { key: "summary", label: "Ringkasan", required: true, kind: "textarea" },
      { key: "details", label: "Detail", kind: "textarea" },
      { key: "status", label: "Status", kind: "select", options: REFERRAL_STATUSES },
    ],
  },
  {
    key: "Rencana Karir",
    table: "kb_career_plans",
    fields: [
      { key: "student_id", label: "Siswa", required: true, kind: "student" },
      { key: "interests", label: "Minat dan bakat", kind: "textarea" },
      { key: "strengths", label: "Kekuatan akademik", kind: "textarea" },
      { key: "learning_style", label: "Gaya belajar" },
      { key: "subject_preferences", label: "Pilihan mata pelajaran", kind: "textarea" },
      { key: "study_major", label: "Rencana jurusan/studi", kind: "textarea" },
      { key: "post_graduation_plan", label: "Rencana pasca-lulus", kind: "select", options: CAREER_PLANS },
      { key: "notes", label: "Catatan konsultasi", kind: "textarea" },
    ],
  },
] as const;

export const SECTION_BY_KEY: Record<SectionKey, SectionConfig> = Object.fromEntries(
  SECTION_CONFIGS.map(config => [config.key, config]),
) as Record<SectionKey, SectionConfig>;

export const PAGE_SIZE = 50;
export const EXPORT_BATCH_SIZE = 500;
