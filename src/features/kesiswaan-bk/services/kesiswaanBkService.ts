import { getValidSupabaseSession, supabase } from "../../../lib/supabase";
import { EXPORT_BATCH_SIZE, PAGE_SIZE } from "../constants";
import type {
  AcademicYearOption,
  AssignmentStudent,
  AttendanceBkAlert,
  ClassOption,
  CounselorOption,
  KbRow,
  PageResult,
  QueryFilters,
  SectionConfig,
  SectionFormValue,
  StudentOption,
  StudentProfile,
  SchoolHeader,
  SummaryStats,
  UserRole,
} from "../types";

type RelatedClass = {
  id: string;
  name: string;
  academic_year_id: string | null;
  homeroom_teacher_id: string | null;
  grade_level: number | null;
  academic_year: { name: string } | { name: string }[] | null;
};

function throwOnError(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

function relationOne<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? value[0] ?? null : value;
}

function normalizeSearch(value: string) {
  return value.trim().replace(/[^\p{L}\p{N}\s-]/gu, "").replace(/\s+/g, " ");
}

function studentMatches(student: StudentOption, search: string) {
  const searchValue = search.toLocaleLowerCase();
  return `${student.full_name} ${student.nisn} ${student.class_name}`.toLocaleLowerCase().includes(searchValue);
}

function toStudentOption(
  row: Record<string, unknown>,
  counselorProfileId: string | null,
  teacherNames: Map<string, string> = new Map(),
): StudentOption {
  const classRow = relationOne(row.class as RelatedClass | RelatedClass[] | null) ?? (
    typeof row.class_id === "string" && typeof row.class_name === "string"
      ? {
          id: row.class_id,
          name: row.class_name,
          academic_year_id: typeof row.academic_year_id === "string" ? row.academic_year_id : null,
          homeroom_teacher_id: null,
          grade_level: typeof row.grade_level === "number" ? row.grade_level : null,
          academic_year: typeof row.academic_year === "string" ? { name: row.academic_year } : null,
        }
      : null
  );
  const academicYear = relationOne(classRow?.academic_year ?? null);
  return {
    id: String(row.id),
    nisn: String(row.nisn ?? ""),
    full_name: String(row.full_name ?? ""),
    status: String(row.status ?? ""),
    birth_date: typeof row.birth_date === "string" ? row.birth_date : null,
    gender: typeof row.gender === "string" ? row.gender : null,
    class_id: typeof row.class_id === "string" ? row.class_id : null,
    class_name: classRow?.name ?? "",
    homeroom_teacher_name: classRow?.homeroom_teacher_id ? teacherNames.get(classRow.homeroom_teacher_id) ?? null : null,
    academic_year_id: classRow?.academic_year_id ?? null,
    academic_year: academicYear?.name ?? null,
    counselor_profile_id: counselorProfileId,
    counselor_name: counselorProfileId
      ? String(row.counselor_name ?? teacherNames.get(counselorProfileId) ?? "") || null
      : null,
    parent_phone: typeof row.parent_phone === "string" ? row.parent_phone : null,
    profile_id: typeof row.profile_id === "string" ? row.profile_id : null,
    grade_level: classRow?.grade_level ?? null,
  };
}

export async function loadStudentsAndYears(role: UserRole): Promise<{
  students: StudentOption[];
  academicYears: AcademicYearOption[];
  classes: ClassOption[];
}> {
  if (role === "siswa") {
    const [contextResult, yearsResult] = await Promise.all([
      supabase.rpc("kb_student_self_context"),
      supabase.from("academic_years").select("id,name,is_active").order("start_date", { ascending: false }),
    ]);
    throwOnError(contextResult.error);
    throwOnError(yearsResult.error);
    const context = Array.isArray(contextResult.data) ? contextResult.data[0] : contextResult.data;
    const students = context
      ? [toStudentOption(context as Record<string, unknown>, typeof context.counselor_profile_id === "string" ? context.counselor_profile_id : null)]
      : [];
    return {
      students,
      academicYears: (yearsResult.data ?? []) as AcademicYearOption[],
      classes: context?.class_id && context?.class_name
        ? [{ id: String(context.class_id), name: String(context.class_name), grade_level: Number(context.grade_level ?? 0), academic_year_id: String(context.academic_year_id ?? "") }]
        : [],
    };
  }

  const [studentsResult, yearsResult, assignmentsResult, teachersResult, classesResult] = await Promise.all([
    supabase.from("students")
      .select("id,profile_id,parent_phone,nisn,full_name,status,birth_date,gender,class_id,class:classes!students_class_id_fkey(id,name,grade_level,academic_year_id,homeroom_teacher_id,academic_year:academic_years(name))")
      .order("full_name"),
    supabase.from("academic_years").select("id,name,is_active").order("start_date", { ascending: false }),
    supabase.from("attendance_bk_assignments").select("student_id,counselor_profile_id"),
    supabase.from("teachers").select("profile_id,full_name").not("profile_id", "is", null),
    supabase.from("classes").select("id,name,grade_level,academic_year_id").order("grade_level").order("name"),
  ]);
  throwOnError(studentsResult.error);
  throwOnError(yearsResult.error);
  throwOnError(assignmentsResult.error);
  throwOnError(teachersResult.error);
  throwOnError(classesResult.error);

  const counselorByStudent = new Map(
    (assignmentsResult.data ?? []).map(row => [row.student_id, row.counselor_profile_id]),
  );
  const teacherNames = new Map<string, string>();
  for (const teacher of teachersResult.data ?? []) {
    if (teacher.profile_id) teacherNames.set(teacher.profile_id, teacher.full_name);
  }
  return {
    students: (studentsResult.data ?? []).map(student =>
      toStudentOption(student, counselorByStudent.get(student.id) ?? null, teacherNames),
    ),
    academicYears: (yearsResult.data ?? []) as AcademicYearOption[],
    classes: (classesResult.data ?? []) as ClassOption[],
  };
}

export async function loadSchoolHeader(): Promise<SchoolHeader> {
  const { data, error } = await supabase.from("school_settings")
    .select("school_name,npsn,letterhead,academic_year")
    .order("id")
    .limit(1)
    .maybeSingle();
  throwOnError(error);
  return {
    school_name: data?.school_name || "SMAN 7 Maros",
    npsn: data?.npsn || "",
    letterhead: data?.letterhead || "",
    academic_year: data?.academic_year || "",
  };
}

export async function loadSectionRows(
  config: SectionConfig,
  filters: QueryFilters,
  page: number,
  students: StudentOption[],
): Promise<PageResult<KbRow>> {
  let query = supabase.from(config.table).select("*", { count: "exact" }).order("created_at", { ascending: false });
  if (filters.academicYearId) query = query.eq("academic_year_id", filters.academicYearId);
  if (filters.semester) query = query.eq("semester", Number(filters.semester));
  if (config.dateField && filters.dateFrom) query = query.gte(config.dateField, filters.dateFrom);
  if (config.dateField && filters.dateTo) query = query.lte(config.dateField, filters.dateTo);

  if (filters.classId && config.fields.some(field => field.key === "student_id")) {
    const classStudentIds = students.filter(student => student.class_id === filters.classId).map(student => student.id);
    if (config.fields.some(field => field.key === "class_id")) {
      const classCondition = `class_id.eq.${filters.classId}`;
      const studentCondition = classStudentIds.length ? `student_id.in.(${classStudentIds.join(",")})` : "";
      query = query.or([classCondition, studentCondition].filter(Boolean).join(","));
    } else {
      if (classStudentIds.length === 0) return { rows: [], count: 0 };
      query = query.in("student_id", classStudentIds);
    }
  }

  const search = normalizeSearch(filters.search);
  if (search) {
    const textFields = config.fields
      .filter(field => field.kind !== "date" && field.kind !== "time" && field.kind !== "student" && field.kind !== "class")
      .map(field => `${field.key}.ilike.*${search}*`);
    const studentIds = students.filter(student => studentMatches(student, search)).map(student => student.id);
    if (studentIds.length > 0 && config.fields.some(field => field.key === "student_id")) {
      textFields.push(`student_id.in.(${studentIds.join(",")})`);
    }
    if (config.legacyStudentNameField) {
      textFields.push(`${config.legacyStudentNameField}.ilike.*${search}*`);
    }
    if (textFields.length === 0) return { rows: [], count: 0 };
    query = query.or(textFields.join(","));
  }

  const { data, error, count } = await query.range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
  throwOnError(error);
  return { rows: (data ?? []) as KbRow[], count: count ?? 0 };
}

export async function loadAllSectionRows(
  config: SectionConfig,
  filters: QueryFilters,
  students: StudentOption[],
): Promise<KbRow[]> {
  const results: KbRow[] = [];
  let page = 0;
  while (true) {
    let query = supabase.from(config.table).select("*").order("created_at", { ascending: false });
    if (filters.academicYearId) query = query.eq("academic_year_id", filters.academicYearId);
    if (filters.semester) query = query.eq("semester", Number(filters.semester));
    if (config.dateField && filters.dateFrom) query = query.gte(config.dateField, filters.dateFrom);
    if (config.dateField && filters.dateTo) query = query.lte(config.dateField, filters.dateTo);
    if (filters.classId && config.fields.some(field => field.key === "student_id")) {
      const ids = students.filter(student => student.class_id === filters.classId).map(student => student.id);
      if (config.fields.some(field => field.key === "class_id")) {
        const conditions = [`class_id.eq.${filters.classId}`];
        if (ids.length) conditions.push(`student_id.in.(${ids.join(",")})`);
        query = query.or(conditions.join(","));
      } else {
        if (ids.length === 0) return [];
        query = query.in("student_id", ids);
      }
    }
    const search = normalizeSearch(filters.search);
    if (search) {
      const conditions = config.fields
        .filter(field => field.kind !== "date" && field.kind !== "time" && field.kind !== "student" && field.kind !== "class")
        .map(field => `${field.key}.ilike.*${search}*`);
      const matchingStudents = students.filter(student => studentMatches(student, search)).map(student => student.id);
      if (matchingStudents.length > 0 && config.fields.some(field => field.key === "student_id")) {
        conditions.push(`student_id.in.(${matchingStudents.join(",")})`);
      }
      if (config.legacyStudentNameField) {
        conditions.push(`${config.legacyStudentNameField}.ilike.*${search}*`);
      }
      if (conditions.length === 0) return [];
      query = query.or(conditions.join(","));
    }
    const { data, error } = await query.range(page * EXPORT_BATCH_SIZE, (page + 1) * EXPORT_BATCH_SIZE - 1);
    throwOnError(error);
    const batch = (data ?? []) as KbRow[];
    results.push(...batch);
    if (batch.length < EXPORT_BATCH_SIZE) break;
    page += 1;
  }
  return results;
}

export async function exportSectionCsv(
  config: SectionConfig,
  filters: QueryFilters,
  students: StudentOption[],
) {
  const rows = await loadAllSectionRows(config, filters, students);
  const headers = config.fields.map(field => field.label);
  const data = rows.map(row => config.fields.map(field => {
    if (field.key === "student_id") {
      return students.find(student => student.id === row.student_id)?.full_name ?? String(row.nama_siswa ?? "");
    }
    return String(row[field.key] ?? "");
  }));
  const quote = (value: string) => {
    const firstNonWhitespace = value.trimStart()[0];
    const safeValue = firstNonWhitespace && "=-+@".includes(firstNonWhitespace) ? `'${value}` : value;
    return `"${safeValue.replace(/"/g, '""')}"`;
  };
  const csv = [headers, ...data].map(line => line.map(quote).join(",")).join("\r\n");
  return `\uFEFF${csv}`;
}

export async function loadSummaryStats(role: UserRole, filters: QueryFilters): Promise<SummaryStats> {
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Makassar" });
  let achievementsQuery = supabase.from("kb_prestasi").select("id", { count: "exact", head: true });
  const permitsQuery = supabase.from("kb_perizinan")
    .select("id", { count: "exact", head: true })
    .eq("tanggal", today);
  if (filters.academicYearId) achievementsQuery = achievementsQuery.eq("academic_year_id", filters.academicYearId);
  if (filters.semester) achievementsQuery = achievementsQuery.eq("semester", Number(filters.semester));

  const [achievementsResult, permitsResult, alertsResult] = await Promise.all([
    achievementsQuery,
    permitsQuery,
    ["guru_bk", "super_admin", "operator"].includes(role)
      ? supabase.from("attendance_bk_alerts").select("id", { count: "exact", head: true }).eq("is_read", false)
      : Promise.resolve({ count: null, error: null }),
  ]);
  throwOnError(achievementsResult.error);
  throwOnError(permitsResult.error);
  throwOnError(alertsResult.error);

  let activeCases: number | null = null;
  if (role === "kepala_sekolah" || role === "super_admin") {
    const { data, error } = await supabase.rpc("kb_case_summary");
    throwOnError(error);
    const caseSummary = (data ?? []) as Array<{ status_kasus: string | null; jumlah: number }>;
    activeCases = caseSummary
      .filter(row => row.status_kasus !== "Selesai")
      .reduce((count, row) => count + Number(row.jumlah), 0);
  } else if (role === "guru_bk") {
    let casesQuery = supabase.from("kb_catatan_bk").select("id", { count: "exact", head: true }).neq("status_kasus", "Selesai");
    if (filters.academicYearId) casesQuery = casesQuery.eq("academic_year_id", filters.academicYearId);
    if (filters.semester) casesQuery = casesQuery.eq("semester", Number(filters.semester));
    const { count, error } = await casesQuery;
    throwOnError(error);
    activeCases = count ?? 0;
  }

  return {
    unreadAlerts: alertsResult.count ?? (role === "guru_bk" || role === "super_admin" || role === "operator" ? 0 : null),
    activeCases,
    permitsToday: permitsResult.count ?? 0,
    achievements: achievementsResult.count ?? 0,
  };
}

export async function loadAttendanceAlerts(): Promise<{ alerts: AttendanceBkAlert[]; unreadCount: number }> {
  const [alertsResult, unreadResult] = await Promise.all([
    supabase.from("attendance_bk_alerts")
      .select("id,student_id,counselor_profile_id,attendance_date,student_name,student_identifier,class_name,title,body,is_read")
      .order("attendance_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(200),
    supabase.from("attendance_bk_alerts").select("id", { count: "exact", head: true }).eq("is_read", false),
  ]);
  throwOnError(alertsResult.error);
  throwOnError(unreadResult.error);

  const records = alertsResult.data ?? [];
  const studentIds = [...new Set(records.map(alert => alert.student_id))];
  const permissionKeys = new Set<string>();
  if (studentIds.length > 0) {
    const dates = records.map(alert => alert.attendance_date).sort();
    const { data, error } = await supabase.from("kb_perizinan")
      .select("student_id,tanggal,alasan")
      .in("student_id", studentIds)
      .gte("tanggal", dates[0])
      .lte("tanggal", dates[dates.length - 1]);
    throwOnError(error);
    for (const permission of data ?? []) {
      if (/izin|sakit|dispensasi/i.test(String(permission.alasan ?? ""))) {
        permissionKeys.add(`${permission.student_id}:${permission.tanggal}`);
      }
    }
  }

  return {
    unreadCount: unreadResult.count ?? 0,
    alerts: records.map(alert => ({
      ...alert,
      has_permission: permissionKeys.has(`${alert.student_id}:${alert.attendance_date}`),
    })) as AttendanceBkAlert[],
  };
}

export async function markAttendanceAlertRead(alertId: string) {
  const { error } = await supabase.from("attendance_bk_alerts").update({ is_read: true }).eq("id", alertId);
  throwOnError(error);
}

export async function loadCounselorAssignments(): Promise<{
  students: AssignmentStudent[];
  counselors: CounselorOption[];
}> {
  const [studentsResult, profilesResult, teachersResult, assignmentsResult] = await Promise.all([
    supabase.from("students")
      .select("id,nisn,full_name,status,birth_date,gender,class_id,class:classes!students_class_id_fkey(id,name,academic_year_id,homeroom_teacher_id,academic_year:academic_years(name))")
      .eq("status", "Active")
      .order("full_name"),
    supabase.from("profiles").select("id,username").eq("role", "guru_bk").eq("status", "active").order("username"),
    supabase.from("teachers").select("profile_id,full_name").not("profile_id", "is", null),
    supabase.from("attendance_bk_assignments").select("student_id,counselor_profile_id"),
  ]);
  throwOnError(studentsResult.error);
  throwOnError(profilesResult.error);
  throwOnError(teachersResult.error);
  throwOnError(assignmentsResult.error);

  const teacherNames = new Map<string, string>();
  for (const teacher of teachersResult.data ?? []) {
    if (teacher.profile_id) teacherNames.set(teacher.profile_id, teacher.full_name);
  }
  const counselors = (profilesResult.data ?? []).map(profile => ({
    id: profile.id,
    name: teacherNames.get(profile.id) || profile.username || "Guru BK",
  }));
  const assignments = new Map((assignmentsResult.data ?? []).map(row => [row.student_id, row.counselor_profile_id]));
  return {
    counselors,
    students: (studentsResult.data ?? []).map(row =>
      toStudentOption(row, assignments.get(row.id) ?? null, teacherNames),
    ),
  };
}

export async function saveCounselorAssignment(studentId: string, counselorProfileId: string) {
  const result = counselorProfileId
    ? await supabase.from("attendance_bk_assignments").upsert({
        student_id: studentId,
        counselor_profile_id: counselorProfileId,
      })
    : await supabase.from("attendance_bk_assignments").delete().eq("student_id", studentId);
  throwOnError(result.error);
}

export async function saveSectionRecord(
  config: SectionConfig,
  form: SectionFormValue,
  students: StudentOption[],
  classes: ClassOption[],
  academicYears: AcademicYearOption[],
  academicYearId: string,
  semester: string,
  recordId: string | null,
) {
  const session = await getValidSupabaseSession();
  if (!session?.user) throw new Error("Sesi login tidak aktif. Silakan masuk kembali.");

  const payload: Record<string, string | number | null> = {};
  for (const field of config.fields) {
    const value = form[field.key]?.trim() ?? "";
    payload[field.key] = field.key === "student_id" || field.kind === "date" || field.kind === "time"
      ? value || null
      : value || "";
  }
  const student = students.find(item => item.id === form.student_id);
  const classYearId = classes.find(item => item.id === form.class_id)?.academic_year_id;
  const yearId = student?.academic_year_id ?? classYearId ?? form.academic_year_id ?? academicYearId;
  payload.academic_year_id = yearId || null;
  payload.academic_year = student?.academic_year ?? academicYears.find(year => year.id === yearId)?.name ?? null;
  payload.semester = semester ? Number(semester) : null;
  if (student) {
    payload.class_id = student.class_id;
    payload.counselor_profile_id = student.counselor_profile_id;
  }
  if (config.key === "Catatan BK") {
    payload.source_alert_id = form.source_alert_id || null;
    payload.created_by = session.user.id;
    payload.target_type = form.target_type || "Siswa";
    payload.student_id = form.target_type === "Siswa" ? form.student_id || null : null;
    payload.class_id = form.target_type === "Kelas"
      ? form.class_id || null
      : form.target_type === "Siswa"
        ? student?.class_id ?? null
        : null;
    payload.counselor_profile_id = student?.counselor_profile_id ?? session.user.id;
    payload.sasaran = form.target_type === "Siswa"
      ? student?.full_name ?? ""
      : form.target_type === "Kelas"
        ? form.class_id ?? ""
        : form.target_type ?? "";
    payload.status_kasus = form.status_kasus || "Terbuka";
  }
  if (config.key === "Rujukan BK") {
    payload.reporter_profile_id = session.user.id;
    payload.counselor_profile_id = student?.counselor_profile_id ?? null;
    payload.status = form.status || "Perlu Asesmen";
  }
  if (config.key === "Rencana Karir") {
    payload.created_by = session.user.id;
    payload.updated_by = session.user.id;
  }
  if (config.key === "Jadwal BK" && !payload.nama_guru_bk && student?.counselor_profile_id) {
    const profile = await supabase.from("profiles").select("username").eq("id", student.counselor_profile_id).maybeSingle();
    throwOnError(profile.error);
    payload.nama_guru_bk = profile.data?.username ?? "Guru BK";
  }

  const result = recordId
    ? await supabase.from(config.table).update(payload).eq("id", recordId)
    : await supabase.from(config.table).insert(payload);
  throwOnError(result.error);
}

export async function deleteSectionRecord(config: SectionConfig, recordId: string) {
  const { error } = await supabase.from(config.table).delete().eq("id", recordId);
  throwOnError(error);
}

export async function loadStudentProfile(studentId: string, role: UserRole): Promise<StudentProfile> {
  const { data: studentData, error: studentError } = await supabase.from("students")
    .select("id,nisn,full_name,status,birth_date,gender,class_id,class:classes!students_class_id_fkey(id,name,academic_year_id,homeroom_teacher_id,academic_year:academic_years(name))")
    .eq("id", studentId)
    .single();
  throwOnError(studentError);
  if (!studentData) throw new Error("Profil siswa tidak ditemukan.");
  const [assignmentsResult, teachersResult] = await Promise.all([
    supabase.from("attendance_bk_assignments").select("counselor_profile_id").eq("student_id", studentId).maybeSingle(),
    supabase.from("teachers").select("profile_id,full_name").not("profile_id", "is", null),
  ]);
  throwOnError(assignmentsResult.error);
  throwOnError(teachersResult.error);
  const teacherNames = new Map<string, string>();
  for (const teacher of teachersResult.data ?? []) {
    if (teacher.profile_id) teacherNames.set(teacher.profile_id, teacher.full_name);
  }
  const option = toStudentOption(
    studentData,
    assignmentsResult.data?.counselor_profile_id ?? null,
    teacherNames,
  );
  const counselorName = option.counselor_name;
  const allowedNotes = role === "guru_bk" || role === "super_admin";
  const allowedAttendance = ["guru_bk", "super_admin", "operator", "kepala_sekolah"].includes(role);

  const [
    alertsResult,
    attendanceResult,
    achievementsResult,
    extracurricularsResult,
    organizationsResult,
    permissionsResult,
    referralsResult,
    careerResult,
    notesResult,
  ] = await Promise.all([
    allowedAttendance
      ? supabase.from("attendance_bk_alerts").select("*").eq("student_id", studentId).order("attendance_date", { ascending: false }).limit(50)
      : Promise.resolve({ data: [], error: null }),
    allowedAttendance
      ? supabase.rpc("kb_student_attendance_history", { p_student_id: studentId })
      : Promise.resolve({ data: [], error: null }),
    supabase.from("kb_prestasi").select("*").eq("student_id", studentId).order("created_at", { ascending: false }).limit(100),
    supabase.from("kb_ekstrakurikuler").select("*").eq("student_id", studentId).order("created_at", { ascending: false }).limit(100),
    supabase.from("kb_osis_kegiatan").select("*").eq("student_id", studentId).order("created_at", { ascending: false }).limit(100),
    supabase.from("kb_perizinan").select("*").eq("student_id", studentId).order("created_at", { ascending: false }).limit(100),
    supabase.from("kb_referrals").select("*").eq("student_id", studentId).order("created_at", { ascending: false }).limit(100),
    allowedNotes
      ? supabase.from("kb_career_plans").select("*").eq("student_id", studentId).order("created_at", { ascending: false }).limit(50)
      : Promise.resolve({ data: [], error: null }),
    allowedNotes
      ? supabase.from("kb_catatan_bk").select("*").eq("student_id", studentId).order("created_at", { ascending: false }).limit(100)
      : Promise.resolve({ data: [], error: null }),
  ]);
  for (const result of [alertsResult, attendanceResult, achievementsResult, extracurricularsResult, organizationsResult, permissionsResult, referralsResult, careerResult, notesResult]) {
    throwOnError(result.error);
  }
  return {
    student: option,
    counselorName,
    alerts: (alertsResult.data ?? []) as AttendanceBkAlert[],
    attendance: (attendanceResult.data ?? []) as KbRow[],
    achievements: (achievementsResult.data ?? []) as KbRow[],
    extracurriculars: (extracurricularsResult.data ?? []) as KbRow[],
    organizations: (organizationsResult.data ?? []) as KbRow[],
    permissions: (permissionsResult.data ?? []) as KbRow[],
    referrals: (referralsResult.data ?? []) as KbRow[],
    careerPlans: (careerResult.data ?? []) as KbRow[],
    counselingNotes: (notesResult.data ?? []) as KbRow[],
  };
}
