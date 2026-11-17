export type SectionKey =
  | "Prestasi"
  | "Ekstrakurikuler"
  | "Catatan BK"
  | "Jadwal BK"
  | "Perizinan"
  | "OSIS & Kegiatan"
  | "Rujukan BK"
  | "Rencana Karir";

export type ViewMode = "data" | "alerts" | "assignments";
export type FieldKind = "text" | "date" | "time" | "textarea" | "select" | "student";
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
};

export type AcademicYearOption = { id: string; name: string; is_active: boolean };
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
