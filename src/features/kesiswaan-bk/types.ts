export type SectionKey =
  | "Prestasi"
  | "Ekstrakurikuler"
  | "Catatan BK"
  | "Jadwal BK"
  | "Perizinan"
  | "OSIS & Kegiatan"
  | "Rujukan BK"
  | "Rencana Karir";

export type ViewMode = "data" | "alerts" | "assignments" | "workflow";
export type FieldKind = "text" | "date" | "time" | "textarea" | "select" | "student" | "class";
export type UserRole =
  | "super_admin"
  | "kepala_sekolah"
  | "guru_bk"
  | "operator"
  | "guru"
  | (string & {});
export type RowValue = string | number | boolean | null;
export type KbRow = { id: string; [key: string]: RowValue | undefined };

export type FieldDefinition = {
  key: string;
  label: string;
  required?: boolean;
  kind?: FieldKind;
  options?: readonly string[];
};

export type SectionConfig = {
  key: SectionKey;
  table: string;
  fields: readonly FieldDefinition[];
  dateField?: string;
  legacyStudentNameField?: string;
  private?: boolean;
};

export type StudentOption = {
  id: string;
  nisn: string;
  full_name: string;
  status: string;
  birth_date: string | null;
  gender: string | null;
  class_id: string | null;
  class_name: string;
  homeroom_teacher_name: string | null;
  academic_year_id: string | null;
  academic_year: string | null;
  counselor_profile_id: string | null;
  counselor_name: string | null;
  parent_phone?: string | null;
  profile_id?: string | null;
  grade_level?: number | null;
};

export type AcademicYearOption = { id: string; name: string; is_active: boolean };
export type ClassOption = { id: string; name: string; grade_level: number; academic_year_id: string };
export type SchoolHeader = { school_name: string; npsn: string; letterhead: string; academic_year: string; logo_url: string };
export type CounselorOption = { id: string; name: string };
export type AssignmentStudent = StudentOption & { counselor_profile_id: string | null };

export type AttendanceBkAlert = {
  id: string;
  student_id: string;
  counselor_profile_id: string;
  attendance_date: string;
  student_name: string;
  student_identifier: string;
  class_name: string | null;
  title: string;
  body: string;
  is_read: boolean;
  has_permission: boolean;
};

export type QueryFilters = {
  search: string;
  academicYearId: string;
  semester: string;
  classId: string;
  dateFrom: string;
  dateTo: string;
};

export type PageResult<T> = { rows: T[]; count: number };
export type SummaryStats = {
  unreadAlerts: number | null;
  activeCases: number | null;
  permitsToday: number | null;
  achievements: number | null;
};

export type StudentProfile = {
  student: StudentOption;
  counselorName: string | null;
  alerts: AttendanceBkAlert[];
  attendance: KbRow[];
  achievements: KbRow[];
  extracurriculars: KbRow[];
  organizations: KbRow[];
  permissions: KbRow[];
  referrals: KbRow[];
  careerPlans: KbRow[];
  counselingNotes: KbRow[];
};

export type SectionFormValue = Record<string, string>;
export type FollowUpKind = "note" | "schedule";

export type ConsultationRow = {
  id: string;
  student_id: string;
  class_id: string | null;
  requester_profile_id: string | null;
  requester_name: string;
  topic: string;
  scheduled_date: string | null;
  start_time: string | null;
  end_time: string | null;
  counselor_profile_id: string | null;
  status: "Menunggu" | "Terjadwal" | "Selesai";
  outcome_summary: string | null;
  follow_up: string | null;
  source_curhat_thread_id: string | null;
};

export type HomeVisitRow = {
  id: string;
  student_id: string;
  class_id: string | null;
  academic_year_id: string | null;
  semester: number | null;
  visit_date: string;
  visit_time: string | null;
  address: string;
  people_met: string;
  counselor_profile_id: string;
  purpose: string;
  observations: string;
  agreement_follow_up: string;
  auto_agenda: boolean;
};

export type RplRow = {
  id: string;
  title: string;
  academic_year_id: string | null;
  target_class: string;
  service_area: string;
  content: Record<string, string>;
  created_at: string;
};

export type RplGeneratedDraft = {
  judul_topik: string;
  tujuan_umum: string;
  tujuan_khusus: string[];
  metode_teknik: string;
  media_alat: string;
  materi_pokok: string;
  tahap_awal: Array<{ kegiatan: string; estimasi_menit: number }>;
  tahap_inti: Array<{ kegiatan: string; estimasi_menit: number }>;
  tahap_penutup: Array<{ kegiatan: string; estimasi_menit: number }>;
  evaluasi_proses: string;
  evaluasi_hasil: string;
};

export type RplEditorContent = {
  judul_topik: string;
  tujuan_umum: string;
  tujuan_khusus: string;
  metode_teknik: string;
  media_alat: string;
  materi_pokok: string;
  tahap_awal: string;
  tahap_inti: string;
  tahap_penutup: string;
  evaluasi_proses: string;
  evaluasi_hasil: string;
};

export type AkpdFormRow = {
  id: string;
  title: string;
  academic_year_id: string;
  target_grade: string;
  questions: Array<{ id: string; area: string; text: string }>;
  is_active: boolean;
};

export type AkpdResponseRow = {
  id: string;
  form_id: string;
  student_id: string;
  answers: Record<string, string>;
  created_at: string;
};

export type CurhatThreadRow = {
  id: string;
  student_id: string;
  counselor_profile_id: string;
  subject: string;
  category: string;
  urgency: string;
  status: "Baru" | "Dibaca" | "Ditindaklanjuti" | "Selesai";
  request_consultation: boolean;
  unread_by_counselor: boolean;
  unread_by_student: boolean;
  created_at: string;
};

export type CurhatMessageRow = {
  id: string;
  thread_id: string;
  author_profile_id: string;
  message: string;
  created_at: string;
};

export type StudentCounselingProfile = {
  student_id: string;
  home_address: string;
  guardian_name: string;
  guardian_occupation: string;
  talents: string;
  career_plan: string;
  health_notes: string;
};
