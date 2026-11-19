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
};

export type SchoolLetterhead = Pick<SchoolSettings, "school_name" | "npsn" | "logo_url" | "letterhead">;
export type LetterheadSlot = "1" | "2";

export function getSchoolLetterhead(
  settings: Pick<SchoolSettings, "school_name" | "npsn" | "logo_url" | "letterhead" | "logo_url_2" | "letterhead_2"> | null,
  slot: LetterheadSlot,
): SchoolLetterhead {
  if (!settings) {
    return { school_name: "SMAN 7 Maros", npsn: "", logo_url: "", letterhead: "" };
  }
  return {
    school_name: settings.school_name,
    npsn: settings.npsn,
    logo_url: slot === "2" ? settings.logo_url_2 : settings.logo_url,
    letterhead: slot === "2" ? settings.letterhead_2 : settings.letterhead,
  };
}

export function hasAlternateSchoolLetterhead(
  settings: Pick<SchoolSettings, "logo_url_2" | "letterhead_2"> | null,
) {
  return Boolean(settings?.logo_url_2.trim() || settings?.letterhead_2.trim());
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
      .select("id, school_name, npsn, academic_year, logo_url, letterhead, logo_url_2, letterhead_2")
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
