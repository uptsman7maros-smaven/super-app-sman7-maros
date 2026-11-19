import { supabase } from "../lib/supabase";

export type SchoolAccount = {
  id: string;
  username: string;
  role: string;
};

export type MasterIdentity = {
  student_id: string | null;
  teacher_id: string | null;
  class_id: string | null;
  class_name: string | null;
  full_name: string;
  nip_or_nisn: string;
  jabatan: string | null;
};

type MasterIdentityRow = MasterIdentity;

export type SchoolSettings = {
  id: number;
  school_name: string;
  npsn: string;
  academic_year: string;
  logo_url: string;
  letterhead: string;
  logo_url_2: string;
  letterhead_2: string;
  province_logo_url: string;
};

export type LetterheadSlot = "1" | "2" | "3";
export type SchoolLetterhead = {
  layout: LetterheadSlot;
  school_name: string;
  npsn: string;
  letterhead: string;
  logo_url: string;
  province_logo_url: string;
  school_logo_url: string;
};

export const DEFAULT_SCHOOL_LETTERHEAD_ADDRESS =
  "Alamat : Jl. Poros Maros-Bone Kec. Mallawa Kabupaten Maros KP (90563) Tlp. 0411-3880500 Email : sman7mallawamaros@gmail.com";

function officialSchoolName(value: string) {
  const name = value.trim().replace(/\s+/g, " ").toLocaleUpperCase("id-ID");
  if (!name) return "UPT SMA NEGERI 7 MAROS";
  if (name.startsWith("UPT SMA NEGERI ")) return name;
  const schoolName = name.match(/^(?:SMAN|SMA\s+NEGERI)\s*(.+)$/);
  return schoolName ? `UPT SMA NEGERI ${schoolName[1]}` : name;
}

export function getSchoolLetterhead(
  settings: Pick<SchoolSettings, "school_name" | "npsn" | "logo_url" | "letterhead" | "logo_url_2" | "letterhead_2" | "province_logo_url"> | null,
  slot: LetterheadSlot,
): SchoolLetterhead {
  const provinceLogoUrl =
    typeof settings?.province_logo_url === "string" && settings.province_logo_url.trim()
      ? settings.province_logo_url.trim()
      : "/logo-provinsi-sulsel.svg";
  const alternateSchoolLogo =
    typeof settings?.logo_url_2 === "string" ? settings.logo_url_2.trim() : "";
  const primarySchoolLogo =
    typeof settings?.logo_url === "string" ? settings.logo_url.trim() : "";
  const schoolLogoUrl = alternateSchoolLogo || primarySchoolLogo || "/logo-sekolah.png";
  const thirdLetterheadLogo = "/logo-kop-3.png";
  return {
    layout: slot,
    school_name: officialSchoolName(settings?.school_name || "SMAN 7 Maros"),
    npsn: settings?.npsn || "",
    logo_url: slot === "1" ? provinceLogoUrl : slot === "3" ? thirdLetterheadLogo : schoolLogoUrl,
    province_logo_url: slot === "3" ? thirdLetterheadLogo : provinceLogoUrl,
    school_logo_url: schoolLogoUrl,
    letterhead: (slot === "2" ? settings?.letterhead_2 : settings?.letterhead)?.trim() || DEFAULT_SCHOOL_LETTERHEAD_ADDRESS,
  };
}

export type AcademicYear = {
  id: string;
  name: string;
  is_active: boolean;
  start_date: string | null;
  end_date: string | null;
};

export type ModuleSetting = {
  id: string;
  module_key: string;
  label: string;
  is_enabled: boolean;
  route_key: string;
};

export type SchoolContextData = {
  identity: MasterIdentity;
  schoolSettings: SchoolSettings | null;
  activeAcademicYear: AcademicYear | null;
  moduleSettings: ModuleSetting[];
};

export type PersonOption = {
  id: string;
  type: "student" | "teacher";
  full_name: string;
  identifier: string;
  class_id: string | null;
  class_name: string | null;
  profile_id: string | null;
};

export type ClassOption = {
  id: string;
  name: string;
  grade_level: number;
  academic_year_id: string;
};

function throwOnError(error: { message: string } | null, operation: string) {
  if (error) throw new Error(`${operation}: ${error.message}`);
}

function identityFor(
  account: SchoolAccount,
  profileName: string | null,
  person?: PersonOption & { jabatan?: string | null },
): MasterIdentity {
  return {
    student_id: person?.type === "student" ? person.id : null,
    teacher_id: person?.type === "teacher" ? person.id : null,
    class_id: person?.type === "student" ? person.class_id : null,
    class_name: person?.type === "student" ? person.class_name : null,
    full_name: person?.full_name || profileName || account.username,
    nip_or_nisn: person?.identifier || account.username,
    jabatan: person?.type === "teacher" ? person.jabatan ?? null : null,
  };
}

async function loadIdentity(account: SchoolAccount): Promise<MasterIdentity> {
  const [identityResult, profileResult] = await Promise.all([
    supabase.rpc("get_my_master_identity").maybeSingle(),
    supabase.from("profiles").select("full_name").eq("id", account.id).maybeSingle(),
  ]);
  throwOnError(identityResult.error, "Identitas Data Induk gagal dimuat");
  throwOnError(profileResult.error, "Profil pengguna gagal dimuat");

  const row = identityResult.data as MasterIdentityRow | null;
  if (row) {
    return {
      student_id: row.student_id ?? null,
      teacher_id: row.teacher_id ?? null,
      class_id: row.class_id ?? null,
      class_name: row.class_name ?? null,
      full_name: row.full_name || profileResult.data?.full_name || account.username,
      nip_or_nisn: row.nip_or_nisn || account.username,
      jabatan: row.jabatan ?? null,
    };
  }

  return identityFor(account, profileResult.data?.full_name ?? null);
}

export async function loadSchoolContextData(
  account: SchoolAccount,
): Promise<SchoolContextData> {
  const [identity, settingsResult, yearResult, modulesResult] = await Promise.all([
    loadIdentity(account),
    supabase
      .from("school_settings")
      .select("id, school_name, npsn, academic_year, logo_url, letterhead, logo_url_2, letterhead_2, province_logo_url")
      .order("id")
      .limit(1)
      .maybeSingle(),
    supabase
      .from("academic_years")
      .select("id, name, is_active, start_date, end_date")
      .eq("is_active", true)
      .order("start_date", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("app_module_settings")
      .select("id, module_key, label, is_enabled, route_key")
      .order("label"),
  ]);

  throwOnError(settingsResult.error, "Pengaturan sekolah gagal dimuat");
  throwOnError(yearResult.error, "Tahun ajaran aktif gagal dimuat");
  throwOnError(modulesResult.error, "Konfigurasi modul gagal dimuat");

  return {
    identity,
    schoolSettings: settingsResult.data,
    activeAcademicYear: yearResult.data,
    moduleSettings: modulesResult.data ?? [],
  };
}

function cleanSearch(value: string) {
  return value.trim().replace(/[^\p{L}\p{N}\s-]/gu, " ").replace(/\s+/g, " ");
}

export async function searchStudents(search: string): Promise<PersonOption[]> {
  let query = supabase
    .from("students")
    .select("id, profile_id, nisn, full_name, class_id, class:classes!students_class_id_fkey(name)")
    .order("full_name")
    .limit(20);
  const term = cleanSearch(search);
  if (term) {
    query = query.or(`full_name.ilike.%${term}%,nisn.ilike.%${term}%`);
  }
  const { data, error } = await query;
  throwOnError(error, "Pencarian siswa gagal");

  return (data ?? []).map((student) => {
    const relation = Array.isArray(student.class) ? student.class[0] : student.class;
    return {
      id: student.id,
      type: "student" as const,
      full_name: student.full_name,
      identifier: student.nisn,
      class_id: student.class_id,
      class_name: relation?.name ?? null,
      profile_id: student.profile_id,
    };
  });
}

export async function searchTeachers(search: string): Promise<PersonOption[]> {
  let query = supabase
    .from("teachers")
    .select("id, profile_id, nip, full_name")
    .order("full_name")
    .limit(20);
  const term = cleanSearch(search);
  if (term) {
    query = query.or(`full_name.ilike.%${term}%,nip.ilike.%${term}%`);
  }
  const { data, error } = await query;
  throwOnError(error, "Pencarian guru/tendik gagal");

  return (data ?? []).map((teacher) => ({
    id: teacher.id,
    type: "teacher",
    full_name: teacher.full_name,
    identifier: teacher.nip ?? "",
    class_id: null,
    class_name: null,
    profile_id: teacher.profile_id,
  }));
}

export async function searchClasses(search = ""): Promise<ClassOption[]> {
  let query = supabase
    .from("classes")
    .select("id, name, grade_level, academic_year_id")
    .order("grade_level")
    .order("name")
    .limit(100);
  const term = cleanSearch(search);
  if (term) query = query.ilike("name", `%${term}%`);
  const { data, error } = await query;
  throwOnError(error, "Pencarian kelas gagal");
  return data ?? [];
}

export type SchoolPanelSettings = Pick<SchoolSettings, "id" | "school_name" | "npsn"> & {
  school_address: string | null;
  principal_name: string | null;
  principal_nip: string | null;
  latitude: number | null;
  longitude: number | null;
  geofence_radius_meters: number | null;
};

export type SchoolHoliday = {
  id: string;
  holiday_date: string;
  title: string;
  category: string;
  is_non_kbm: boolean;
};

export type SchoolSyncSummary = {
  students: number;
  teachers: number;
  classes: number;
  academicRecords: number;
  teacherSubjectAssignments: number;
  rooms: number;
  roomsLinkedToClasses: number;
  assets: number;
  assetsLinkedToPlaces: number;
  loans: number;
};

export type DataIndukSchoolPanelData = {
  settings: SchoolPanelSettings | null;
  holidays: SchoolHoliday[];
  summary: SchoolSyncSummary;
};

function requiredCount(count: number | null, operation: string) {
  if (count === null) throw new Error(`${operation}: jumlah data tidak tersedia.`);
  return count;
}

export async function loadDataIndukSchoolPanelData(): Promise<DataIndukSchoolPanelData> {
  const [
    settingsResult,
    holidaysResult,
    studentsResult,
    teachersResult,
    classesResult,
    academicRecordsResult,
    assignmentsResult,
    roomsResult,
    linkedRoomsResult,
    assetsResult,
    linkedAssetsResult,
    loansResult,
  ] = await Promise.all([
    supabase
      .from("school_settings")
      .select("id, school_name, npsn, school_address, principal_name, principal_nip, latitude, longitude, geofence_radius_meters")
      .order("id")
      .limit(1)
      .maybeSingle(),
    supabase
      .from("school_holidays")
      .select("id, holiday_date, title, category, is_non_kbm")
      .order("holiday_date", { ascending: false })
      .order("title"),
    supabase.from("students").select("id", { count: "exact", head: true }),
    supabase.from("teachers").select("id", { count: "exact", head: true }),
    supabase.from("classes").select("id", { count: "exact", head: true }),
    supabase.from("academic_records").select("id", { count: "exact", head: true }),
    supabase.from("attendance_teacher_subject_assignments").select("id", { count: "exact", head: true }),
    supabase.from("inv_places").select("id", { count: "exact", head: true }),
    supabase.from("inv_places").select("id", { count: "exact", head: true }).not("class_id", "is", null),
    supabase.from("inv_assets").select("id", { count: "exact", head: true }),
    supabase.from("inv_assets").select("id", { count: "exact", head: true }).not("place_id", "is", null),
    supabase.from("inv_loans").select("id", { count: "exact", head: true }),
  ]);

  throwOnError(settingsResult.error, "Profil sekolah gagal dimuat");
  throwOnError(holidaysResult.error, "Kalender sekolah gagal dimuat");
  throwOnError(studentsResult.error, "Jumlah siswa gagal dimuat");
  throwOnError(teachersResult.error, "Jumlah guru/tendik gagal dimuat");
  throwOnError(classesResult.error, "Jumlah kelas gagal dimuat");
  throwOnError(academicRecordsResult.error, "Jumlah data Akademik gagal dimuat");
  throwOnError(assignmentsResult.error, "Jumlah penugasan mapel gagal dimuat");
  throwOnError(roomsResult.error, "Jumlah ruangan Inventaris gagal dimuat");
  throwOnError(linkedRoomsResult.error, "Jumlah ruangan tertaut gagal dimuat");
  throwOnError(assetsResult.error, "Jumlah aset gagal dimuat");
  throwOnError(linkedAssetsResult.error, "Jumlah aset tertaut gagal dimuat");
  throwOnError(loansResult.error, "Jumlah peminjaman gagal dimuat");

  return {
    settings: settingsResult.data,
    holidays: holidaysResult.data ?? [],
    summary: {
      students: requiredCount(studentsResult.count, "Jumlah siswa"),
      teachers: requiredCount(teachersResult.count, "Jumlah guru/tendik"),
      classes: requiredCount(classesResult.count, "Jumlah kelas"),
      academicRecords: requiredCount(academicRecordsResult.count, "Jumlah data Akademik"),
      teacherSubjectAssignments: requiredCount(assignmentsResult.count, "Jumlah penugasan mapel"),
      rooms: requiredCount(roomsResult.count, "Jumlah ruangan Inventaris"),
      roomsLinkedToClasses: requiredCount(linkedRoomsResult.count, "Jumlah ruangan tertaut"),
      assets: requiredCount(assetsResult.count, "Jumlah aset"),
      assetsLinkedToPlaces: requiredCount(linkedAssetsResult.count, "Jumlah aset tertaut"),
      loans: requiredCount(loansResult.count, "Jumlah peminjaman"),
    },
  };
}

export type SchoolProfileUpdate = {
  principal_name: string | null;
  principal_nip: string | null;
  latitude: number | null;
  longitude: number | null;
  geofence_radius_meters: number;
};

export async function updateSchoolProfile(
  id: number,
  profile: SchoolProfileUpdate,
): Promise<void> {
  const { data, error } = await supabase
    .from("school_settings")
    .update(profile)
    .eq("id", id)
    .select("id")
    .single();
  throwOnError(error, "Profil sekolah gagal disimpan");
  if (!data) throw new Error("Profil sekolah tidak ditemukan.");
}

export type SchoolHolidayInput = Omit<SchoolHoliday, "id">;

export async function saveSchoolHoliday(
  holiday: SchoolHolidayInput,
  id?: string,
): Promise<void> {
  const result = id
    ? await supabase
        .from("school_holidays")
        .update(holiday)
        .eq("id", id)
        .select("id")
        .single()
    : await supabase.from("school_holidays").insert(holiday).select("id").single();
  throwOnError(result.error, "Hari libur gagal disimpan");
  if (!result.data) throw new Error("Hari libur tidak ditemukan.");
}

export async function deleteSchoolHoliday(id: string): Promise<void> {
  const { error } = await supabase.from("school_holidays").delete().eq("id", id);
  throwOnError(error, "Hari libur gagal dihapus");
}
