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
  staff_category: string | null;
  primary_role: string | null;
  additional_roles: string[];
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
  principal_name?: string | null;
  principal_nip?: string | null;
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

const SCHOOL_CONTEXT_CACHE_MS = 90_000;
const schoolContextCache = new Map<string, { data: SchoolContextData; cachedAt: number }>();
const schoolContextRequests = new Map<string, Promise<SchoolContextData>>();

type SupabaseErrorDetails = {
  code?: string;
  message: string;
  details?: string;
  hint?: string;
};

function formatSupabaseError(error: unknown, operation: string) {
  const details = typeof error === "object" && error !== null
    ? error as SupabaseErrorDetails
    : null;
  const message = error instanceof Error
    ? error.message
    : details?.message ?? String(error);
  const code = details?.code ? `[${details.code}] ` : "";
  const extraDetails = details?.details ? ` Detail: ${details.details}` : "";
  const hint = details?.hint ? ` Saran: ${details.hint}` : "";
  return `${operation}: ${code}${message}${extraDetails}${hint}`;
}

function throwOnError(error: SupabaseErrorDetails | null, operation: string) {
  if (error) throw new Error(formatSupabaseError(error, operation));
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
    staff_category: null,
    primary_role: person?.type === "teacher" ? person.jabatan ?? null : null,
    additional_roles: [],
  };
}

async function loadIdentity(account: SchoolAccount): Promise<MasterIdentity> {
  const [identityResult, profileResult, teacherAccessResult] = await Promise.all([
    supabase.rpc("get_my_master_identity").maybeSingle(),
    supabase.from("profiles").select("full_name").eq("id", account.id).maybeSingle(),
    ["guru", "guru_bk"].includes(account.role)
      ? supabase.rpc("get_my_teacher_access_profile").maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  throwOnError(identityResult.error, "Identitas Data Induk gagal dimuat");
  throwOnError(profileResult.error, "Profil pengguna gagal dimuat");
  throwOnError(teacherAccessResult.error, "Jabatan guru gagal dimuat");

  const row = identityResult.data as MasterIdentityRow | null;
  const teacherAccess = teacherAccessResult.data as {
    teacher_id: string;
    staff_category: string | null;
    primary_role: string | null;
    additional_roles: string[] | null;
  } | null;
  if (row) {
    return {
      student_id: row.student_id ?? null,
      teacher_id: row.teacher_id ?? null,
      class_id: row.class_id ?? null,
      class_name: row.class_name ?? null,
      full_name: row.full_name || profileResult.data?.full_name || account.username,
      nip_or_nisn: row.nip_or_nisn || account.username,
      jabatan: row.jabatan ?? null,
      staff_category: teacherAccess?.staff_category ?? null,
      primary_role: teacherAccess?.primary_role ?? row.jabatan ?? null,
      additional_roles: teacherAccess?.additional_roles ?? [],
    };
  }

  return {
    ...identityFor(account, profileResult.data?.full_name ?? null),
    staff_category: teacherAccess?.staff_category ?? null,
    primary_role: teacherAccess?.primary_role ?? null,
    additional_roles: teacherAccess?.additional_roles ?? [],
  };
}

export async function loadSchoolContextData(
  account: SchoolAccount,
  options: { force?: boolean } = {},
): Promise<SchoolContextData> {
  const cacheKey = JSON.stringify([account.id, account.role]);
  const cached = schoolContextCache.get(cacheKey);
  if (!options.force && cached && Date.now() - cached.cachedAt < SCHOOL_CONTEXT_CACHE_MS) {
    return cached.data;
  }
  const existingRequest = schoolContextRequests.get(cacheKey);
  if (existingRequest) return existingRequest;

  const request = (async () => {
    const [identity, settingsResult, yearResult, modulesResult] = await Promise.all([
      loadIdentity(account),
      supabase
        .from("school_settings")
        .select("id, school_name, npsn, academic_year, logo_url, letterhead, logo_url_2, letterhead_2, province_logo_url, principal_name, principal_nip")
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

    const data = {
      identity,
      schoolSettings: settingsResult.data,
      activeAcademicYear: yearResult.data,
      moduleSettings: modulesResult.data ?? [],
    };
    schoolContextCache.set(cacheKey, { data, cachedAt: Date.now() });
    return data;
  })();

  schoolContextRequests.set(cacheKey, request);
  try {
    return await request;
  } finally {
    if (schoolContextRequests.get(cacheKey) === request) {
      schoolContextRequests.delete(cacheKey);
    }
  }
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
  students: number | null;
  teachers: number | null;
  classes: number | null;
  academicRecords: number | null;
  teacherSubjectAssignments: number | null;
  rooms: number | null;
  roomsLinkedToClasses: number | null;
  assets: number | null;
  assetsLinkedToPlaces: number | null;
  loans: number | null;
};

export type DataIndukSchoolPanelData = {
  settings: SchoolPanelSettings | null;
  settingsError: string | null;
  holidays: SchoolHoliday[];
  holidaysError: string | null;
  summary: SchoolSyncSummary;
  loadErrors: string[];
};

type QueryError = { code?: string; message: string; details?: string; hint?: string };
type QueryOutcome<T> = { data: T | null; count: number | null; error: string | null };

function parseSchoolPanelSettings(value: unknown): SchoolPanelSettings | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const nullableText = (item: unknown) => item === null || typeof item === "string";
  const nullableNumber = (item: unknown) => item === null || typeof item === "number";
  if (
    typeof row.id !== "number"
    || !nullableText(row.school_name)
    || !nullableText(row.npsn)
    || !nullableText(row.school_address)
    || !nullableText(row.principal_name)
    || !nullableText(row.principal_nip)
    || !nullableNumber(row.latitude)
    || !nullableNumber(row.longitude)
    || !nullableNumber(row.geofence_radius_meters)
  ) return null;
  return {
    id: row.id,
    school_name: typeof row.school_name === "string" ? row.school_name : "",
    npsn: typeof row.npsn === "string" ? row.npsn : "",
    school_address: typeof row.school_address === "string" ? row.school_address : null,
    principal_name: typeof row.principal_name === "string" ? row.principal_name : null,
    principal_nip: typeof row.principal_nip === "string" ? row.principal_nip : null,
    latitude: typeof row.latitude === "number" ? row.latitude : null,
    longitude: typeof row.longitude === "number" ? row.longitude : null,
    geofence_radius_meters: typeof row.geofence_radius_meters === "number"
      ? row.geofence_radius_meters
      : null,
  };
}

async function captureQuery<T>(
  query: PromiseLike<{ data: T | null; count: number | null; error: QueryError | null }>,
  operation: string,
  didTimeout: () => boolean,
): Promise<QueryOutcome<T>> {
  try {
    const result = await query;
    return {
      data: result.data,
      count: result.count,
      error: result.error
        ? formatSupabaseError(result.error, operation)
        : didTimeout()
          ? `${operation}: permintaan melewati batas waktu 20 detik.`
          : null,
    };
  } catch (error) {
    return {
      data: null,
      count: null,
      error: didTimeout()
        ? `${operation}: permintaan melewati batas waktu 20 detik.`
        : formatSupabaseError(error, operation),
    };
  }
}

export async function loadDataIndukSchoolPanelData(signal?: AbortSignal): Promise<DataIndukSchoolPanelData> {
  const controller = new AbortController();
  let timedOut = false;
  const abortFromCaller = () => controller.abort();
  if (signal?.aborted) controller.abort();
  else signal?.addEventListener("abort", abortFromCaller, { once: true });
  const timeoutId = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, 20_000);
  const capture = <T,>(
    query: PromiseLike<{ data: T | null; count: number | null; error: QueryError | null }>,
    operation: string,
  ) => captureQuery(query, operation, () => timedOut);

  try {
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
      capture(supabase
        .from("school_settings")
        .select("id, school_name, npsn, school_address, principal_name, principal_nip, latitude, longitude, geofence_radius_meters")
        .order("id")
        .limit(1)
        .abortSignal(controller.signal)
        .maybeSingle(), "Profil sekolah gagal dimuat"),
      capture(supabase
        .from("school_holidays")
        .select("id, holiday_date, title, category, is_non_kbm")
        .order("holiday_date", { ascending: false })
        .order("title")
        .abortSignal(controller.signal), "Kalender sekolah gagal dimuat"),
      capture(supabase.from("students").select("id", { count: "exact", head: true }).abortSignal(controller.signal), "Jumlah siswa gagal dimuat"),
      capture(supabase.from("teachers").select("id", { count: "exact", head: true }).abortSignal(controller.signal), "Jumlah guru/tendik gagal dimuat"),
      capture(supabase.from("classes").select("id", { count: "exact", head: true }).abortSignal(controller.signal), "Jumlah kelas gagal dimuat"),
      capture(supabase.from("academic_records").select("id", { count: "exact", head: true }).abortSignal(controller.signal), "Jumlah data Akademik gagal dimuat"),
      capture(supabase.from("attendance_teacher_subject_assignments").select("id", { count: "exact", head: true }).abortSignal(controller.signal), "Jumlah penugasan mapel gagal dimuat"),
      capture(supabase.from("inv_places").select("id", { count: "exact", head: true }).abortSignal(controller.signal), "Jumlah ruangan Inventaris gagal dimuat"),
      capture(supabase.from("inv_places").select("id", { count: "exact", head: true }).not("class_id", "is", null).abortSignal(controller.signal), "Jumlah ruangan tertaut gagal dimuat"),
      capture(supabase.from("inv_assets").select("id", { count: "exact", head: true }).abortSignal(controller.signal), "Jumlah aset gagal dimuat"),
      capture(supabase.from("inv_assets").select("id", { count: "exact", head: true }).not("place_id", "is", null).abortSignal(controller.signal), "Jumlah aset tertaut gagal dimuat"),
      capture(supabase.from("inv_loans").select("id", { count: "exact", head: true }).abortSignal(controller.signal), "Jumlah peminjaman gagal dimuat"),
    ]);

    const loadErrors: string[] = [];
    const count = <T,>(result: QueryOutcome<T>, operation: string) => {
      if (result.error) {
        loadErrors.push(result.error);
        return null;
      }
      if (result.count === null) {
        loadErrors.push(`${operation}: jumlah data tidak tersedia.`);
        return null;
      }
      return result.count;
    };
    const rawSettings: unknown = settingsResult.data;
    const settingsData = parseSchoolPanelSettings(rawSettings);
    const settingsError = settingsResult.error ?? (
      rawSettings !== null && settingsData === null
        ? "Profil sekolah gagal dimuat: bentuk data dari Supabase tidak sesuai."
        : null
    );
    const holidaysError = holidaysResult.error;
    if (settingsError) loadErrors.push(settingsError);
    if (holidaysError) loadErrors.push(holidaysError);

    return {
      settings: settingsData,
      settingsError,
      holidays: holidaysResult.data ?? [],
      holidaysError,
      summary: {
        students: count(studentsResult, "Jumlah siswa"),
        teachers: count(teachersResult, "Jumlah guru/tendik"),
        classes: count(classesResult, "Jumlah kelas"),
        academicRecords: count(academicRecordsResult, "Jumlah data Akademik"),
        teacherSubjectAssignments: count(assignmentsResult, "Jumlah penugasan mapel"),
        rooms: count(roomsResult, "Jumlah ruangan Inventaris"),
        roomsLinkedToClasses: count(linkedRoomsResult, "Jumlah ruangan tertaut"),
        assets: count(assetsResult, "Jumlah aset"),
        assetsLinkedToPlaces: count(linkedAssetsResult, "Jumlah aset tertaut"),
        loans: count(loansResult, "Jumlah peminjaman"),
      },
      loadErrors,
    };
  } finally {
    window.clearTimeout(timeoutId);
    signal?.removeEventListener("abort", abortFromCaller);
  }
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
