import { getValidSupabaseSession, supabase } from "./lib/supabase";
import {
  createManagedUser,
  getManagedUsers,
  type ManagedUser,
} from "./lib/manageUsers";
import { logAppActivity } from "./services/activityLogService";
import DataIndukSekolahPanel from "./DataIndukSekolahPanel";
import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { createPortal } from "react-dom";
import * as XLSX from "xlsx";
import {
  Users,
  GraduationCap,
  School,
  FileSpreadsheet,
  Search,
  Plus,
  Download,
  Upload,
  History,
  CheckCircle2,
  XCircle,
  Check,
  ChevronDown,
  Pencil,
  Trash2,
  UserRoundPlus,
} from "lucide-react";

type MenuDataInduk = "siswa" | "guru" | "kelas" | "sekolah" | "excel" | "riwayat";

type ImportStudentRow = {
  source_row: number;
  nisn: string;
  full_name: string;
  class_name: string;
  birth_date: string;
  gender: string;
  errors: string[];
};

type ImportTeacherRow = {
  source_row: number;
  nip: string;
  full_name: string;
  employment_status: string;
  errors: string[];
};

type Student = {
  id: string;
  profile_id: string | null;
  nisn: string;
  full_name: string;
  class_id: string | null;
  birth_date: string | null;
  gender: string | null;
  status: string;
  parent_phone: string | null;
  class: { name: string } | null;
};

type Teacher = { id: string; profile_id: string | null; nip: string | null; full_name: string; employment_status: string | null };
type TeacherSubjectAssignment = { id: string; teacher_id: string; class_id: string; subject: string };
type TeacherAssignmentSummary = Pick<TeacherSubjectAssignment, "teacher_id" | "class_id" | "subject">;
type TeacherHomeroomSummary = { id: string; name: string; homeroom_teacher_id: string | null };
type AcademicYear = { id: string; name: string; is_active: boolean; start_date: string | null; end_date: string | null };
type ClassRow = { id: string; name: string; grade_level: number; academic_year_id: string; homeroom_teacher_id: string | null; academic_year_name: string; homeroom_teacher_name: string; student_count: number };
type ClassForm = { name: string; grade_level: string; academic_year_id: string; homeroom_teacher_id: string };
type BulkMoveStudent = Pick<Student, "id" | "nisn" | "full_name" | "status">;
type DataIndukSelectOption = { value: string; label: string };
type BulkAccountProgress = { completed: number; total: number; succeeded: number; failed: string[] };
type DataIndukAuditEntry = {
  id: number;
  changed_at: string;
  actor_id: string | null;
  actor_name: string | null;
  table_name: "students" | "teachers" | "classes";
  record_id: string;
  operation: "INSERT" | "UPDATE" | "DELETE";
  changed_fields: string[];
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
};

function DataIndukSelect({
  id,
  labelId,
  value,
  options,
  onChange,
}: {
  id: string;
  labelId: string;
  value: string;
  options: DataIndukSelectOption[];
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [position, setPosition] = useState({ top: 0, left: 0, width: 0, maxHeight: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<Array<HTMLDivElement | null>>([]);
  const selectedIndex = options.findIndex((option) => option.value === value);
  const selectedOption = selectedIndex >= 0 ? options[selectedIndex] : undefined;

  useEffect(() => {
    if (!open) return;

    const updatePosition = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;

      const desiredHeight = Math.min(256, options.length * 42 + 12);
      const spaceBelow = window.innerHeight - rect.bottom - 12;
      const spaceAbove = rect.top - 12;
      const openAbove = spaceBelow < desiredHeight && spaceAbove > spaceBelow;
      const availableSpace = Math.max(96, (openAbove ? spaceAbove : spaceBelow) - 8);
      const menuHeight = Math.min(desiredHeight, availableSpace);
      const left = Math.min(rect.left, window.innerWidth - rect.width - 8);

      setPosition({
        top: openAbove ? Math.max(8, rect.top - menuHeight - 8) : Math.min(rect.bottom + 8, window.innerHeight - menuHeight - 8),
        left: Math.max(8, left),
        width: rect.width,
        maxHeight: menuHeight,
      });
    };

    const closeOnOutsideClick = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      document.removeEventListener("pointerdown", closeOnOutsideClick);
    };
  }, [open, options.length]);

  useEffect(() => {
    if (open) optionRefs.current[activeIndex]?.focus();
  }, [open, activeIndex]);

  const openMenu = () => {
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
    setOpen(true);
  };

  const selectOption = (option: DataIndukSelectOption) => {
    onChange(option.value);
    setOpen(false);
    triggerRef.current?.focus();
  };

  const moveFocus = (index: number) => {
    const nextIndex = Math.max(0, Math.min(index, options.length - 1));
    setActiveIndex(nextIndex);
    optionRefs.current[nextIndex]?.focus();
  };

  return (
    <>
      <button
        id={id}
        ref={triggerRef}
        type="button"
        className={`di-search di-select-trigger${open ? " is-open" : ""}`}
        aria-labelledby={labelId}
        aria-controls={`${id}-listbox`}
        aria-owns={`${id}-listbox`}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => open ? setOpen(false) : openMenu()}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            if (!open) openMenu();
          } else if (event.key === "Escape" && open) {
            setOpen(false);
          }
        }}
      >
        <span>{selectedOption?.label ?? "Pilih opsi"}</span>
        <ChevronDown size={17} aria-hidden="true" />
      </button>
      {open && createPortal(
        <div
          ref={menuRef}
          id={`${id}-listbox`}
          className="di-select-popover"
          role="listbox"
          aria-labelledby={labelId}
          style={{ top: position.top, left: position.left, width: position.width, maxHeight: position.maxHeight, visibility: position.width ? "visible" : "hidden" }}
        >
          {options.map((option, index) => {
            const isSelected = option.value === value;
            return (
              <div
                key={option.value}
                ref={(element) => { optionRefs.current[index] = element; }}
                className="di-select-option"
                role="option"
                aria-selected={isSelected}
                tabIndex={index === activeIndex ? 0 : -1}
                onClick={() => selectOption(option)}
                onKeyDown={(event) => {
                  if (event.key === "ArrowDown") {
                    event.preventDefault();
                    moveFocus(index + 1);
                  } else if (event.key === "ArrowUp") {
                    event.preventDefault();
                    moveFocus(index - 1);
                  } else if (event.key === "Home") {
                    event.preventDefault();
                    moveFocus(0);
                  } else if (event.key === "End") {
                    event.preventDefault();
                    moveFocus(options.length - 1);
                  } else if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    selectOption(option);
                  } else if (event.key === "Escape") {
                    event.preventDefault();
                    setOpen(false);
                    triggerRef.current?.focus();
                  }
                }}
              >
                <span>{option.label}</span>
                {isSelected && <Check size={16} aria-hidden="true" />}
              </div>
            );
          })}
        </div>,
        document.body
      )}
    </>
  );
}

type StudentForm = {
  nisn: string;
  full_name: string;
  class_id: string;
  birth_date: string;
  gender: string;
  status: "Active" | "Inactive" | "Graduated";
  parent_phone: string;
};

type TeacherForm = {
  nip: string;
  full_name: string;
  employment_status: string;
};

const emptyStudentForm: StudentForm = {
  nisn: "",
  full_name: "",
  class_id: "",
  birth_date: "",
  gender: "",
  status: "Active",
  parent_phone: "",
};

const emptyTeacherForm: TeacherForm = {
  nip: "",
  full_name: "",
  employment_status: "",
};

const teacherPositionOptions = [
  "Guru Mata Pelajaran",
  "Guru BK / Konselor",
  "Wakasek Kurikulum",
  "Wakasek Kesiswaan",
  "Wakasek Sarana dan Prasarana",
  "Wakasek Humas",
  "Kepala Sekolah",
  "Kepala Tata Usaha",
  "Staff Tata Usaha",
  "Tenaga Kependidikan (Tendik)",
];

const subjectSuggestions = [
  "Matematika",
  "Matematika Tingkat Lanjut",
  "Bahasa Indonesia",
  "Bahasa Inggris",
  "Fisika",
  "Kimia",
  "Biologi",
  "Ekonomi",
  "Sosiologi",
  "Geografi",
  "Sejarah",
  "PPKn",
  "Pendidikan Agama Islam",
  "PAI",
  "PJOK",
  "Seni Budaya",
  "Informatika",
  "Prakarya",
  "Bahasa Daerah",
];

const teacherRoleForPosition = (position: string | null) => {
  switch (position) {
    case "Guru BK / Konselor":
      return "guru_bk";
    case "Kepala Sekolah":
      return "kepala_sekolah";
    case "Kepala Tata Usaha":
      return "kepala_tata_usaha";
    case "Staff Tata Usaha":
      return "staff_tata_usaha";
    case "Tenaga Kependidikan (Tendik)":
      return "tendik";
    default:
      return "guru";
  }
};

const emptyClassForm: ClassForm = {
  name: "",
  grade_level: "10",
  academic_year_id: "",
  homeroom_teacher_id: "",
};

const formatSupabaseError = (error: unknown) => {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = String(error.message);
    const code = "code" in error && typeof error.code === "string"
      ? ` (${error.code})`
      : "";
    return `${message}${code}`;
  }
  return typeof error === "string" && error
    ? error
    : "Kesalahan tidak diketahui.";
};

const normalizeAccountUsername = (value: string) => value.trim().toLowerCase();

const auditFieldLabels: Record<string, string> = {
  nisn: "NISN",
  full_name: "Nama lengkap",
  class_id: "Kelas",
  birth_date: "Tanggal lahir",
  gender: "Jenis kelamin",
  parent_phone: "WhatsApp orang tua",
  status: "Status",
  nip: "NIP / NUPTK",
  employment_status: "Jabatan",
  name: "Nama kelas",
  grade_level: "Tingkat",
  academic_year_id: "Tahun ajaran",
  homeroom_teacher_id: "Wali kelas",
};

const formatAuditValue = (value: unknown) => {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value);
};

const menuItems = [
  {
    id: "siswa" as const,
    title: "Data Siswa",
    description: "Kelola identitas dan status siswa.",
    icon: GraduationCap,
  },
  {
    id: "guru" as const,
    title: "Data Guru & Tendik",
    description: "Kelola data guru dan tenaga kependidikan.",
    icon: Users,
  },
  {
    id: "kelas" as const,
    title: "Data Kelas",
    description: "Kelola kelas dan tahun ajaran.",
    icon: School,
  },
  {
    id: "sekolah" as const,
    title: "Sekolah & Sinkron",
    description: "Profil sekolah, kalender non-KBM, dan sinkronisasi data lintas modul.",
    icon: School,
  },
  {
    id: "excel" as const,
    title: "Impor / Ekspor Excel",
    description: "Impor data siswa, guru/tendik, dan ekspor data induk melalui Excel.",
    icon: FileSpreadsheet,
  },
  {
    id: "riwayat" as const,
    title: "Riwayat Perubahan",
    description: "Lihat siapa mengubah data dan kapan.",
    icon: History,
  },
];

type DataIndukProps = { userRole?: string };

export default function DataInduk({ userRole = "" }: DataIndukProps) {
  const canManageDataInduk = ["super_admin", "operator"].includes(userRole);
  const [activeMenu, setActiveMenu] =
    useState<MenuDataInduk>("siswa");
  const [search, setSearch] = useState("");

  const [students, setStudents] = useState<Student[]>([]);
const [loadingStudents, setLoadingStudents] = useState(false);
const [studentError, setStudentError] = useState("");
const [studentNotice, setStudentNotice] = useState("");

const [showStudentForm, setShowStudentForm] = useState(false);
const [editingStudent, setEditingStudent] =
  useState<Student | null>(null);
const [studentForm, setStudentForm] =
  useState<StudentForm>(emptyStudentForm);
const [savingStudent, setSavingStudent] = useState(false);
const [studentFormError, setStudentFormError] = useState("");
const [studentClassFilter, setStudentClassFilter] = useState("all");
const [studentStatusFilter, setStudentStatusFilter] = useState("all");
const [studentAccountFilter, setStudentAccountFilter] = useState("all");
const [bulkAccountProgress, setBulkAccountProgress] = useState<BulkAccountProgress | null>(null);

const [classes, setClasses] = useState<
  { id: string; name: string; grade_level: number }[]
>([]);
const [importRows, setImportRows] = useState<ImportStudentRow[]>([]);
const [importError, setImportError] = useState("");
const [importing, setImporting] = useState(false);
const [importFileName, setImportFileName] = useState("");
const [importValidationComplete, setImportValidationComplete] = useState(false);
const [teacherImportRows, setTeacherImportRows] = useState<ImportTeacherRow[]>([]);
const [teacherImportFileName, setTeacherImportFileName] = useState("");
const [teacherImportError, setTeacherImportError] = useState("");
const [teacherImportNotice, setTeacherImportNotice] = useState("");
const [teacherImportValidationComplete, setTeacherImportValidationComplete] = useState(false);
const [teachers, setTeachers] = useState<Teacher[]>([]);
const [teacherLoading, setTeacherLoading] = useState(false);
const [teacherFilterPosition, setTeacherFilterPosition] = useState("all");
const [teacherFilterStatus, setTeacherFilterStatus] = useState("all");
const [teacherAssignmentSummary, setTeacherAssignmentSummary] = useState<TeacherAssignmentSummary[]>([]);
const [teacherHomeroomSummary, setTeacherHomeroomSummary] = useState<TeacherHomeroomSummary[]>([]);
const [teacherSummaryError, setTeacherSummaryError] = useState("");
const [teacherAccounts, setTeacherAccounts] = useState<ManagedUser[] | null>(null);
const [teacherAccountError, setTeacherAccountError] = useState("");
const [creatingTeacherAccountId, setCreatingTeacherAccountId] = useState<string | null>(null);
const [studentAccounts, setStudentAccounts] = useState<ManagedUser[] | null>(null);
const [studentAccountError, setStudentAccountError] = useState("");
const [creatingStudentAccountId, setCreatingStudentAccountId] = useState<string | null>(null);
const [showTeacherForm, setShowTeacherForm] = useState(false);
const [editingTeacher, setEditingTeacher] = useState<Teacher | null>(null);
const [teacherForm, setTeacherForm] = useState<TeacherForm>(emptyTeacherForm);
const [savingTeacher, setSavingTeacher] = useState(false);
const [teacherFormError, setTeacherFormError] = useState("");
const [assignmentTeacher, setAssignmentTeacher] = useState<Teacher | null>(null);
const [teacherAssignments, setTeacherAssignments] = useState<TeacherSubjectAssignment[]>([]);
const [teacherAssignmentsLoading, setTeacherAssignmentsLoading] = useState(false);
const [teacherAssignmentSaving, setTeacherAssignmentSaving] = useState(false);
const [teacherAssignmentError, setTeacherAssignmentError] = useState("");
const [newAssignmentSubject, setNewAssignmentSubject] = useState("");
const [newAssignmentClassId, setNewAssignmentClassId] = useState("");

const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
const [classTeacherOptions, setClassTeacherOptions] = useState<Array<Pick<Teacher, "id" | "profile_id" | "full_name">>>([]);
const [classRows, setClassRows] = useState<ClassRow[]>([]);
const [classLoading, setClassLoading] = useState(false);
const [classReloadVersion, setClassReloadVersion] = useState(0);
const [showClassForm, setShowClassForm] = useState(false);
const [editingClass, setEditingClass] = useState<ClassRow | null>(null);
const [classForm, setClassForm] = useState<ClassForm>(emptyClassForm);
const [classFormError, setClassFormError] = useState("");
const [savingClass, setSavingClass] = useState(false);
const [showAcademicYearManager, setShowAcademicYearManager] = useState(false);
const [academicYearForm, setAcademicYearForm] = useState({ name: "", start_date: "", end_date: "" });
const [academicYearFormError, setAcademicYearFormError] = useState("");
const [savingAcademicYear, setSavingAcademicYear] = useState(false);
const [activatingAcademicYearId, setActivatingAcademicYearId] = useState<string | null>(null);
const [showBulkMove, setShowBulkMove] = useState(false);
const [bulkMoveMode, setBulkMoveMode] = useState<"move" | "graduate">("move");
const [bulkSourceYearId, setBulkSourceYearId] = useState("");
const [bulkSourceClassId, setBulkSourceClassId] = useState("");
const [bulkDestinationClassId, setBulkDestinationClassId] = useState("");
const [bulkStudents, setBulkStudents] = useState<BulkMoveStudent[]>([]);
const [bulkSelectedIds, setBulkSelectedIds] = useState<string[]>([]);
const [bulkLoading, setBulkLoading] = useState(false);
const [bulkSaving, setBulkSaving] = useState(false);
const [bulkError, setBulkError] = useState("");
const bulkLoadRequestRef = useRef(0);
const [auditEntries, setAuditEntries] = useState<DataIndukAuditEntry[]>([]);
const [auditLoading, setAuditLoading] = useState(false);
const [auditError, setAuditError] = useState("");
const [auditReloadVersion, setAuditReloadVersion] = useState(0);

const [masterError, setMasterError] = useState("");
const [masterNotice, setMasterNotice] = useState("");

const logMasterChange = async (action: string, details: string) => {
  try {
    await logAppActivity({ action, moduleKey: "Data Induk", details });
    return "";
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
};

useEffect(() => {
  if (activeMenu !== "siswa") return;

  let cancelled = false;

  async function loadStudents() {
    setLoadingStudents(true);
    setStudentError("");

    try {
      const session = await getValidSupabaseSession();
      if (!session?.user) {
        throw new Error("Sesi login Supabase tidak aktif. Keluar lalu masuk kembali.");
      }

      const { data, error } = await supabase
        .from("students")
        .select(`
          id,
          profile_id,
          nisn,
          full_name,
          class_id,
          birth_date,
          gender,
          status,
          parent_phone,
          class:classes!students_class_id_fkey (
            name
          )
        `)
        .order("full_name", { ascending: true });

      if (error) throw error;

      if (!cancelled) {
        setStudents((data ?? []) as unknown as Student[]);
      }
    } catch (error) {
      if (!cancelled) {
        setStudentError(`Gagal memuat data siswa dari Supabase: ${formatSupabaseError(error)}`);
      }
    } finally {
      if (!cancelled) {
        setLoadingStudents(false);
      }
    }
  }

  void loadStudents();

  return () => {
    cancelled = true;
  };
}, [activeMenu]);

useEffect(() => {
  if (activeMenu !== "siswa" || userRole !== "super_admin") return;
  let cancelled = false;
  void getManagedUsers()
    .then((users) => {
      if (!cancelled) {
        setStudentAccounts(users);
        setStudentAccountError("");
      }
    })
    .catch((error) => {
      if (!cancelled) {
        setStudentAccountError(formatSupabaseError(error));
      }
    });
  return () => { cancelled = true; };
}, [activeMenu, userRole]);

const getStudentAccountStatus = (student: Student) => {
  if (student.profile_id) return "Sudah Ada Akun";
  if (!studentAccounts) {
    return studentAccountError
      ? "Status akun belum dapat diverifikasi"
      : "Memeriksa akun...";
  }
  const username = normalizeAccountUsername(student.nisn ?? "");
  const hasAccount = username !== "" && studentAccounts.some((user) =>
    normalizeAccountUsername(user.username) === username
  );
  return hasAccount ? "Sudah Ada Akun" : "Belum Ada Akun";
};

const filteredStudents = students.filter((student) => {
  const keyword = search.trim().toLowerCase();
  const matchesSearch =
    student.nisn.toLowerCase().includes(keyword) ||
    student.full_name.toLowerCase().includes(keyword) ||
    (student.class?.name ?? "").toLowerCase().includes(keyword);
  const matchesClass = studentClassFilter === "all"
    || (studentClassFilter === "unassigned" ? !student.class_id : student.class_id === studentClassFilter);
  const matchesStatus = studentStatusFilter === "all" || student.status === studentStatusFilter;
  const matchesAccount = userRole !== "super_admin"
    || studentAccountFilter === "all"
    || (studentAccountFilter === "linked"
      ? getStudentAccountStatus(student) === "Sudah Ada Akun"
      : getStudentAccountStatus(student) === "Belum Ada Akun");

  return matchesSearch && matchesClass && matchesStatus && matchesAccount;
});

const createStudentAccount = async (student: Student) => {
  if (userRole !== "super_admin" || creatingStudentAccountId) return;
  const nisn = student.nisn.trim();
  const fullName = student.full_name.trim();
  if (!/^\d{10}$/.test(nisn) || fullName.length < 2 || fullName.length > 150) {
    setMasterNotice("Akun tidak dapat dibuat: NISN harus 10 angka dan nama harus 2–150 karakter.");
    return;
  }
  if (student.status !== "Active") {
    setMasterNotice("Akun hanya dapat dibuat untuk siswa berstatus Active.");
    return;
  }
  if (!window.confirm(`Buat akun untuk ${fullName}? Username dan password awal adalah NISN.`)) {
    return;
  }

  setCreatingStudentAccountId(student.id);
  setMasterNotice("");
  setStudentAccountError("");
  try {
    const currentUsers = await getManagedUsers();
    const existing = currentUsers.some((user) =>
      normalizeAccountUsername(user.username) === nisn.toLowerCase()
    );
    if (existing) {
      setStudentAccounts(currentUsers);
      setMasterNotice("NISN ini sudah digunakan oleh akun terdaftar; akun baru tidak dibuat.");
      return;
    }

    const createdUser = await createManagedUser({
      username: nisn,
      full_name: fullName,
      role: "siswa",
      password: nisn,
    });
    const { error: linkError } = await supabase
      .from("students")
      .update({ profile_id: createdUser.id })
      .eq("id", student.id);
    const missingProfileId = linkError?.code === "42703"
      || (linkError?.code === "PGRST204" && linkError.message.includes("profile_id"));
    const linkWarning = linkError && !missingProfileId
      ? ` Akun dibuat, tetapi tautan Data Induk gagal: ${linkError.message}`
      : "";

    setStudentAccounts((users) => [
      ...(users ?? currentUsers),
      { ...createdUser, created_at: new Date().toISOString() },
    ]);
    setStudents((current) => current.map((item) => item.id === student.id
      ? { ...item, profile_id: createdUser.id }
      : item));
    const auditWarning = await logMasterChange(
      "Akun siswa dibuat dari Data Induk",
      `${fullName} · NISN ${nisn}`,
    );
    setMasterNotice(
      `Akun berhasil dibuat. Username dan password awal adalah NISN.${linkWarning}${auditWarning ? ` ${auditWarning}` : ""}`,
    );
    if (missingProfileId) {
      setMasterNotice("Akun berhasil dibuat; kolom tautan profil tidak tersedia pada skema Data Induk.");
    }
  } catch (error) {
    setStudentAccountError(
      `Akun siswa gagal dibuat: ${formatSupabaseError(error)}`,
    );
  } finally {
    setCreatingStudentAccountId(null);
  }
};

const generateStudentAccountsBulk = async () => {
  if (userRole !== "super_admin" || creatingStudentAccountId || bulkAccountProgress) return;
  const eligibleStudents = filteredStudents.filter((student) =>
    student.status === "Active"
    && /^\d{10}$/.test(student.nisn.trim())
    && getStudentAccountStatus(student) === "Belum Ada Akun"
  );
  if (!eligibleStudents.length) {
    setMasterNotice("Tidak ada siswa Active yang memenuhi filter, NISN 10 digit, dan belum memiliki akun.");
    return;
  }
  if (!window.confirm(
    `Buat dan tautkan akun untuk ${eligibleStudents.length} siswa? Username dan password awal masing-masing adalah NISN.`,
  )) return;

  setBulkAccountProgress({ completed: 0, total: eligibleStudents.length, succeeded: 0, failed: [] });
  setStudentAccountError("");
  setMasterNotice("");
  let currentUsers: ManagedUser[];
  try {
    currentUsers = await getManagedUsers();
  } catch (error) {
    setStudentAccountError(`Daftar akun gagal diperbarui: ${formatSupabaseError(error)}`);
    setBulkAccountProgress(null);
    return;
  }
  let succeeded = 0;
  const failures: string[] = [];

  for (let index = 0; index < eligibleStudents.length; index += 1) {
    const student = eligibleStudents[index];
    try {
      const nisn = student.nisn.trim();
      const existing = currentUsers.find((user) =>
        normalizeAccountUsername(user.username) === normalizeAccountUsername(nisn)
      );
      if (existing && existing.role !== "siswa") {
        throw new Error("NISN sudah digunakan oleh akun dengan peran lain.");
      }

      const account = existing ?? await createManagedUser({
        username: nisn,
        full_name: student.full_name.trim(),
        role: "siswa",
        password: nisn,
      });
      if (!existing) {
        currentUsers = [...currentUsers, { ...account, created_at: new Date().toISOString() }];
      }

      const { error } = await supabase
        .from("students")
        .update({ profile_id: account.id })
        .eq("id", student.id)
        .select("id")
        .single();
      if (error) throw error;

      succeeded += 1;
      setStudents((current) => current.map((item) =>
        item.id === student.id ? { ...item, profile_id: account.id } : item
      ));
    } catch (error) {
      failures.push(`${student.full_name}: ${formatSupabaseError(error)}`);
    }

    setBulkAccountProgress({
      completed: index + 1,
      total: eligibleStudents.length,
      succeeded,
      failed: [...failures],
    });
    if (index < eligibleStudents.length - 1) {
      await new Promise<void>((resolve) => window.setTimeout(resolve, 700));
    }
  }

  setStudentAccounts(currentUsers);
  const auditWarning = await logMasterChange(
    "Pembuatan akun siswa massal",
    `${succeeded} berhasil ditautkan dari ${eligibleStudents.length} siswa; ${failures.length} gagal.`,
  );
  const failureDetails = failures.length
    ? ` Gagal: ${failures.slice(0, 3).join(" | ")}${failures.length > 3 ? ` dan ${failures.length - 3} lainnya.` : ""}`
    : "";
  setMasterNotice(
    `Proses akun selesai: ${succeeded} berhasil, ${failures.length} gagal.${failureDetails}${auditWarning ? ` Audit aktivitas gagal: ${auditWarning}` : ""}`,
  );
  setBulkAccountProgress(null);
};

const handleSaveStudent = async (event: FormEvent<HTMLFormElement>) => {
  event.preventDefault();
  setStudentFormError("");
  setStudentNotice("");

  const nisn = studentForm.nisn.trim();
  const full_name = studentForm.full_name.trim();

  if (!nisn || !full_name) {
    setStudentFormError("NISN dan nama lengkap wajib diisi.");
    return;
  }

  if (!/^\d{10}$/.test(nisn)) {
    setStudentFormError("NISN harus terdiri dari 10 angka.");
    return;
  }

  if (
    studentForm.gender &&
    !["L", "P"].includes(studentForm.gender)
  ) {
    setStudentFormError("Pilih jenis kelamin yang valid.");
    return;
  }

  setSavingStudent(true);

  try {
    const payload = {
      nisn,
      full_name,
      class_id: studentForm.class_id || null,
      birth_date: studentForm.birth_date || null,
      gender: studentForm.gender || null,
      status: studentForm.status,
      parent_phone: studentForm.parent_phone.trim() || null,
      updated_at: new Date().toISOString(),
    };

    const result = editingStudent
      ? await supabase
          .from("students")
          .update(payload)
          .eq("id", editingStudent.id)
          .select("id")
          .single()
      : await supabase
          .from("students")
          .insert(payload)
          .select("id")
          .single();

    if (result.error) {
      if (result.error.code === "23505") {
        throw new Error("NISN tersebut sudah terdaftar.");
      }

      throw result.error;
    }
    const auditWarning = await logMasterChange(
      editingStudent ? "Data siswa diperbarui" : "Data siswa ditambahkan",
      `${full_name} · NISN ${nisn}`,
    );

    const { data, error } = await supabase
      .from("students")
      .select(`
        id,
        profile_id,
        nisn,
        full_name,
        class_id,
        birth_date,
        gender,
        status,
        parent_phone,
        class:classes!students_class_id_fkey (
          name
        )
      `)
      .order("full_name", { ascending: true });

    if (error) throw error;

    setStudents((data ?? []) as unknown as Student[]);
    setStudentNotice(
      auditWarning
        ? `Data tersimpan, tetapi audit aktivitas gagal: ${auditWarning}`
        : editingStudent
          ? "Data siswa berhasil diperbarui."
          : "Data siswa berhasil ditambahkan."
    );
    setShowStudentForm(false);
    setEditingStudent(null);
    setStudentForm(emptyStudentForm);
  
} catch (error: unknown) {
  console.error("Gagal menyimpan data siswa:", error);

  const message =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error !== null && "message" in error
      ? String(error.message)
      : "Kesalahan tidak diketahui.";

  setStudentFormError(
    `Gagal menyimpan data siswa: ${message}`
  );
} finally {
  setSavingStudent(false);
}
};

useEffect(() => {
  let cancelled = false;

  async function loadClasses() {
    try {
      const { data, error } = await supabase
        .from("classes")
        .select("id, name, grade_level")
        .order("grade_level", { ascending: true })
        .order("name", { ascending: true });

      if (cancelled) return;
      if (error) throw error;
      setClasses(data ?? []);
    } catch (error) {
      if (!cancelled) {
        setStudentFormError(
          `Daftar kelas gagal dimuat: ${formatSupabaseError(error)}`
        );
      }
    }
  }

  void loadClasses();

  return () => {
    cancelled = true;
  };
}, []);

  useEffect(() => {
    if (activeMenu !== "guru") return;
    let cancelled = false;
    (async () => {
      setTeacherLoading(true);
      setMasterError("");
      setTeacherSummaryError("");
      try {
        const [teacherResult, assignmentResult, classResult] = await Promise.all([
          supabase.from("teachers").select("id, profile_id, nip, full_name, employment_status").order("full_name"),
          supabase.from("attendance_teacher_subject_assignments").select("teacher_id, class_id, subject"),
          supabase.from("classes").select("id, name, homeroom_teacher_id"),
        ]);
        if (cancelled) return;
        if (teacherResult.error) throw teacherResult.error;
        setTeachers((teacherResult.data ?? []) as Teacher[]);
        if (assignmentResult.error) {
          setTeacherAssignmentSummary([]);
          setTeacherSummaryError(`Ringkasan penugasan mapel gagal dimuat: ${formatSupabaseError(assignmentResult.error)}`);
        } else {
          setTeacherAssignmentSummary((assignmentResult.data ?? []) as TeacherAssignmentSummary[]);
        }
        if (classResult.error) {
          setTeacherHomeroomSummary([]);
          setTeacherSummaryError((current) => current
            ? `${current} Ringkasan wali kelas gagal dimuat: ${formatSupabaseError(classResult.error)}`
            : `Ringkasan wali kelas gagal dimuat: ${formatSupabaseError(classResult.error)}`);
        } else {
          setTeacherHomeroomSummary((classResult.data ?? []) as TeacherHomeroomSummary[]);
        }
        if (userRole === "super_admin") {
          setTeacherAccounts(null);
          void getManagedUsers()
            .then((users) => {
              if (!cancelled) setTeacherAccounts(users);
            })
            .catch((error) => {
              if (!cancelled) setTeacherAccountError(formatSupabaseError(error));
            });
        }
      } catch (error) {
        if (!cancelled) setMasterError(`Data guru gagal dimuat: ${formatSupabaseError(error)}`);
      } finally {
        if (!cancelled) setTeacherLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [activeMenu, userRole]);

  const getTeacherManagedAccount = (teacher: Teacher) => {
    if (!teacher.nip || !teacherAccounts) return undefined;
    return teacherAccounts.find((user) =>
      normalizeAccountUsername(user.username) === normalizeAccountUsername(teacher.nip ?? "")
    );
  };

  const getTeacherAccountStatus = (teacher: Teacher) => {
    if (teacher.profile_id) return "Akun Terhubung";
    if (userRole !== "super_admin") return "Status akun khusus Super Admin";
    if (!teacherAccounts) {
      return teacherAccountError
        ? "Status akun belum dapat diverifikasi"
        : "Memeriksa akun...";
    }

    const existing = getTeacherManagedAccount(teacher);
    if (existing?.role === "siswa") return "NIP digunakan akun siswa";
    return existing ? "Akun tersedia, belum ditautkan" : "Belum terhubung ke akun";
  };

  const filteredTeachers = teachers.filter((teacher) => {
    const keyword = search.trim().toLowerCase();
    const matchesSearch = `${teacher.nip ?? ""} ${teacher.full_name} ${teacher.employment_status ?? ""}`
      .toLowerCase()
      .includes(keyword);
    const matchesPosition = teacherFilterPosition === "all"
      || teacher.employment_status === teacherFilterPosition;
    const hasSubjectAssignment = teacherAssignmentSummary.some((assignment) => assignment.teacher_id === teacher.id);
    const account = getTeacherManagedAccount(teacher);
    const hasAccount = Boolean(teacher.profile_id || account);
    const matchesStatus = teacherFilterStatus === "all"
      || (teacherFilterStatus === "no-subject"
          ? !teacherSummaryError && teacher.employment_status === "Guru Mata Pelajaran" && !hasSubjectAssignment
        : userRole === "super_admin" && !hasAccount);
    return matchesSearch && matchesPosition && matchesStatus;
  });

  const eligibleStudentAccountCount = filteredStudents.filter((student) =>
    student.status === "Active"
    && /^\d{10}$/.test(student.nisn.trim())
    && getStudentAccountStatus(student) === "Belum Ada Akun"
  ).length;
  const visibleBulkStudents = bulkMoveMode === "graduate"
    ? bulkStudents.filter((student) => student.status === "Active")
    : bulkStudents;

  const createOrLinkTeacherAccount = async (teacher: Teacher) => {
    if (userRole !== "super_admin" || creatingTeacherAccountId) return;
    const nip = teacher.nip?.trim() ?? "";
    if (!/^\d{6,}$/.test(nip)) {
      setMasterNotice("NIP harus berisi minimal 6 angka untuk membuat atau menautkan akun.");
      return;
    }

    const existingAccount = getTeacherManagedAccount(teacher);
    const actionLabel = existingAccount ? "Tautkan akun yang sudah ada" : "Buat akun baru";
    if (!window.confirm(`${actionLabel} untuk ${teacher.full_name}? Username dan password awal adalah NIP.`)) return;

    setCreatingTeacherAccountId(teacher.id);
    setMasterNotice("");
    setTeacherAccountError("");
    try {
      const currentUsers = await getManagedUsers();
      const existing = currentUsers.find((user) =>
        normalizeAccountUsername(user.username) === normalizeAccountUsername(nip)
      );
      if (existing?.role === "siswa") {
        throw new Error("NIP ini sudah digunakan oleh akun siswa. Tautan dibatalkan agar data guru tidak terhubung ke akun yang salah.");
      }
      if (teacher.profile_id && existing && teacher.profile_id !== existing.id) {
        throw new Error("Data guru sudah tertaut ke akun lain.");
      }

      const managedUser = existing ?? await createManagedUser({
        username: nip,
        full_name: teacher.full_name,
        role: teacherRoleForPosition(teacher.employment_status),
        password: nip,
      });
      const { data, error } = await supabase
        .from("teachers")
        .update({ profile_id: managedUser.id })
        .eq("id", teacher.id)
        .select("id, profile_id, nip, full_name, employment_status")
        .single();
      if (error) {
        if (!existing) {
          setTeacherAccounts([...currentUsers, { ...managedUser, created_at: new Date().toISOString() }]);
          const auditWarning = await logMasterChange(
            "Akun guru/tendik dibuat tanpa tautan Data Induk",
            `${teacher.full_name} · NIP ${nip} · peran ${managedUser.role}`,
          );
          throw new Error(
            `Akun berhasil dibuat, tetapi profile_id gagal ditautkan: ${error.message}${auditWarning ? ` Audit aktivitas gagal: ${auditWarning}` : ""}`,
          );
        }
        throw error;
      }

      const savedTeacher = data as Teacher;
      setTeachers((current) => current.map((item) =>
        item.id === savedTeacher.id ? savedTeacher : item
      ));
      setTeacherAccounts(existing
        ? currentUsers
        : [...currentUsers, { ...managedUser, created_at: new Date().toISOString() }]);
      const auditWarning = await logMasterChange(
        existing ? "Akun guru/tendik ditautkan" : "Akun guru/tendik dibuat",
        `${teacher.full_name} · NIP ${nip} · peran ${managedUser.role}`,
      );
      setMasterNotice(
        `${existing ? "Akun yang sudah ada berhasil ditautkan" : "Akun berhasil dibuat dan ditautkan"}.${auditWarning ? ` Audit aktivitas gagal: ${auditWarning}` : ""}`,
      );
    } catch (error) {
      setTeacherAccountError(`Akun guru/tendik gagal dibuat atau ditautkan: ${formatSupabaseError(error)}`);
    } finally {
      setCreatingTeacherAccountId(null);
    }
  };

  const loadTeacherAssignments = async (teacherId: string) => {
    setTeacherAssignmentsLoading(true);
    setTeacherAssignmentError("");
    try {
      const { data, error } = await supabase
        .from("attendance_teacher_subject_assignments")
        .select("id, teacher_id, class_id, subject")
        .eq("teacher_id", teacherId)
        .order("subject")
        .order("class_id");
      if (error) throw error;
      setTeacherAssignments((data ?? []) as TeacherSubjectAssignment[]);
    } catch (error) {
      setTeacherAssignmentError(
        `Penugasan gagal dimuat: ${formatSupabaseError(error)}`,
      );
    } finally {
      setTeacherAssignmentsLoading(false);
    }
  };

  const openTeacherAssignments = (teacher: Teacher) => {
    setAssignmentTeacher(teacher);
    setTeacherAssignments([]);
    setNewAssignmentSubject("");
    setNewAssignmentClassId("");
    setTeacherAssignmentError("");
    void loadTeacherAssignments(teacher.id);
  };

  const saveTeacherAssignment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!assignmentTeacher) return;
    const subject = newAssignmentSubject.trim();
    if (!subject || !newAssignmentClassId) {
      setTeacherAssignmentError("Mata pelajaran dan kelas wajib dipilih.");
      return;
    }

    setTeacherAssignmentSaving(true);
    setTeacherAssignmentError("");
    try {
      const { error } = await supabase
        .from("attendance_teacher_subject_assignments")
        .insert({
          teacher_id: assignmentTeacher.id,
          class_id: newAssignmentClassId,
          subject,
        });
      if (error) throw error;
      const auditWarning = await logMasterChange(
        "Penugasan mata pelajaran ditambahkan",
        `${assignmentTeacher.full_name} · ${subject}`,
      );
      setTeacherAssignmentSummary((current) => [
        ...current,
        { teacher_id: assignmentTeacher.id, class_id: newAssignmentClassId, subject },
      ]);
      setNewAssignmentSubject("");
      setNewAssignmentClassId("");
      await loadTeacherAssignments(assignmentTeacher.id);
      if (auditWarning) setTeacherAssignmentError(`Penugasan tersimpan, tetapi audit gagal: ${auditWarning}`);
    } catch (error) {
      const errorCode = typeof error === "object" && error !== null && "code" in error
        ? String(error.code)
        : "";
      setTeacherAssignmentError(
        errorCode === "23505"
          ? "Penugasan mata pelajaran untuk kelas tersebut sudah ada."
          : `Penugasan gagal disimpan: ${formatSupabaseError(error)}`,
      );
    } finally {
      setTeacherAssignmentSaving(false);
    }
  };

  const deleteTeacherAssignment = async (assignment: TeacherSubjectAssignment) => {
    if (!assignmentTeacher) return;
    const className = classes.find((item) => item.id === assignment.class_id)?.name ?? "kelas";
    if (!window.confirm(`Hapus penugasan ${assignment.subject} — ${className}?`)) return;
    setTeacherAssignmentError("");
    try {
      const { error } = await supabase
        .from("attendance_teacher_subject_assignments")
        .delete()
        .eq("id", assignment.id);
      if (error) throw error;
      const auditWarning = await logMasterChange(
        "Penugasan mata pelajaran dihapus",
        `${assignmentTeacher.full_name} · ${assignment.subject}`,
      );
      setTeacherAssignmentSummary((current) =>
        current.filter((item) =>
          !(item.teacher_id === assignment.teacher_id
            && item.class_id === assignment.class_id
            && item.subject === assignment.subject)
        )
      );
      await loadTeacherAssignments(assignmentTeacher.id);
      if (auditWarning) setTeacherAssignmentError(`Penugasan dihapus, tetapi audit gagal: ${auditWarning}`);
    } catch (error) {
      setTeacherAssignmentError(
        `Penugasan gagal dihapus: ${formatSupabaseError(error)}`,
      );
    }
  };

  useEffect(() => {
    if (activeMenu !== "kelas") return;
    let cancelled = false;
    (async () => {
      setClassLoading(true);
      setMasterError("");
      try {
        const [c, y, t, st] = await Promise.all([
          supabase.from("classes").select("id, name, grade_level, academic_year_id, homeroom_teacher_id").order("grade_level").order("name"),
        supabase.from("academic_years").select("id, name, is_active, start_date, end_date").order("start_date", { ascending: false }),
        supabase.from("teachers").select("id, profile_id, full_name").not("profile_id", "is", null),
          supabase.from("students").select("class_id")
        ]);
        if (cancelled) return;
        const error = c.error || y.error || t.error || st.error;
        if (error) throw error;
        const years = y.data ?? [];
        setAcademicYears(years as AcademicYear[]);
        setClassTeacherOptions((t.data ?? []) as Array<Pick<Teacher, "id" | "profile_id" | "full_name">>);
        const teacherNames = new Map((t.data ?? []).filter(x => x.profile_id).map(x => [x.profile_id as string, x.full_name]));
        const yearNames = new Map(years.map(x => [x.id, x.name]));
        const counts = new Map<string, number>();
        (st.data ?? []).forEach(x => { if (x.class_id) counts.set(x.class_id, (counts.get(x.class_id) ?? 0) + 1); });
        setClassRows((c.data ?? []).map(x => ({ ...x, academic_year_name: yearNames.get(x.academic_year_id) ?? "—", homeroom_teacher_name: x.homeroom_teacher_id ? teacherNames.get(x.homeroom_teacher_id) ?? "Profil guru tidak ditemukan" : "Belum ditentukan", student_count: counts.get(x.id) ?? 0 })) as ClassRow[]);
      } catch (error) {
        if (!cancelled) setMasterError(`Data kelas gagal dimuat: ${formatSupabaseError(error)}`);
      } finally {
        if (!cancelled) setClassLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [activeMenu, classReloadVersion]);

  useEffect(() => {
    if (activeMenu !== "riwayat" || !canManageDataInduk) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setAuditLoading(true);
      setAuditError("");
      try {
        const { data, error } = await supabase
          .from("datainduk_change_log")
          .select("id,changed_at,actor_id,actor_name,table_name,record_id,operation,changed_fields,old_data,new_data")
          .order("changed_at", { ascending: false })
          .limit(200);
        if (error) throw error;
        if (!cancelled) setAuditEntries((data ?? []) as DataIndukAuditEntry[]);
      } catch (error) {
        if (!cancelled) {
          setAuditError(`Riwayat perubahan gagal dimuat: ${formatSupabaseError(error)}`);
        }
      } finally {
        if (!cancelled) setAuditLoading(false);
      }
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [activeMenu, auditReloadVersion, canManageDataInduk]);

  const handleSaveTeacher = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setTeacherFormError("");

    const nip = teacherForm.nip.trim();
    const full_name = teacherForm.full_name.trim();
    const employment_status = teacherForm.employment_status.trim();
    if (!full_name) {
      setTeacherFormError("Nama lengkap wajib diisi.");
      return;
    }
    if (!employment_status) {
      setTeacherFormError("Jabatan wajib dipilih.");
      return;
    }

    setSavingTeacher(true);
    setMasterNotice("");

    try {
      const payload = {
        nip: nip || null,
        full_name,
        employment_status: employment_status || null,
        updated_at: new Date().toISOString(),
      };
      const result = editingTeacher
        ? await supabase
            .from("teachers")
            .update(payload)
            .eq("id", editingTeacher.id)
            .select("id, profile_id, nip, full_name, employment_status")
            .single()
        : await supabase
            .from("teachers")
            .insert(payload)
            .select("id, profile_id, nip, full_name, employment_status")
            .single();

      if (result.error) throw result.error;
      const savedTeacher = result.data as Teacher;
      const auditWarning = await logMasterChange(
        editingTeacher ? "Data guru/tendik diperbarui" : "Data guru/tendik ditambahkan",
        `${savedTeacher.full_name}${savedTeacher.nip ? ` · NIP ${savedTeacher.nip}` : ""}`,
      );
      setTeachers((previous) =>
        [
          ...previous.filter((teacher) => teacher.id !== savedTeacher.id),
          savedTeacher,
        ].sort((a, b) => a.full_name.localeCompare(b.full_name)),
      );
      setMasterNotice(
        auditWarning
          ? `Data tersimpan, tetapi audit aktivitas gagal: ${auditWarning}`
          : editingTeacher
            ? "Data guru/tendik berhasil diperbarui."
            : "Data guru/tendik berhasil ditambahkan.",
      );
      setShowTeacherForm(false);
      setEditingTeacher(null);
      setTeacherForm(emptyTeacherForm);
    } catch (error) {
      setTeacherFormError(
        `Gagal ${editingTeacher ? "memperbarui" : "menambahkan"} data: ${formatSupabaseError(error)}`,
      );
    } finally {
      setSavingTeacher(false);
    }
  };

  const handleEditTeacher = (teacher: Teacher) => {
    setEditingTeacher(teacher);
    setTeacherForm({
      nip: teacher.nip ?? "",
      full_name: teacher.full_name,
      employment_status: teacher.employment_status ?? "",
    });
    setTeacherFormError("");
    setMasterNotice("");
    setShowTeacherForm(true);
  };

  const handleDeleteTeacher = async (teacher: Teacher) => {
    if (!window.confirm(`Hapus data ${teacher.full_name}?`)) return;
    const { error } = await supabase.from("teachers").delete().eq("id", teacher.id);
    if (error) { alert(`Gagal menghapus. Pastikan akun Anda memiliki izin super_admin. Detail: ${error.message}`); return; }
    const auditWarning = await logMasterChange(
      "Data guru/tendik dihapus",
      `${teacher.full_name}${teacher.nip ? ` · NIP ${teacher.nip}` : ""}`,
    );
    if (auditWarning) setMasterNotice(`Data terhapus, tetapi audit gagal: ${auditWarning}`);
    setTeachers(prev => prev.filter(x => x.id !== teacher.id));
  };

  const handleAddClass = () => {
    if (!academicYears.length) {
      setMasterNotice("Belum ada tahun ajaran. Tambahkan tahun ajaran terlebih dahulu.");
      return;
    }
    const activeYear = academicYears.find((year) => year.is_active) ?? academicYears[0];
    setEditingClass(null);
    setClassForm({ ...emptyClassForm, academic_year_id: activeYear.id });
    setClassFormError("");
    setMasterNotice("");
    setShowClassForm(true);
  };

  const handleEditClass = (row: ClassRow) => {
    setEditingClass(row);
    setClassForm({
      name: row.name,
      grade_level: String(row.grade_level),
      academic_year_id: row.academic_year_id,
      homeroom_teacher_id: classTeacherOptions.find((teacher) => teacher.profile_id === row.homeroom_teacher_id)?.profile_id ?? "",
    });
    setClassFormError("");
    setMasterNotice("");
    setShowClassForm(true);
  };

  const handleSaveClass = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = classForm.name.trim();
    const grade_level = Number(classForm.grade_level);
    const year = academicYears.find((item) => item.id === classForm.academic_year_id);
    if (!name) {
      setClassFormError("Nama kelas wajib diisi.");
      return;
    }
    if (![10, 11, 12].includes(grade_level)) {
      setClassFormError("Tingkat kelas harus 10, 11, atau 12.");
      return;
    }
    if (!year) {
      setClassFormError("Pilih tahun ajaran yang terdaftar.");
      return;
    }
    if (classForm.homeroom_teacher_id && !classTeacherOptions.some((teacher) => teacher.profile_id === classForm.homeroom_teacher_id)) {
      setClassFormError("Wali kelas harus dipilih dari guru yang sudah tertaut ke akun.");
      return;
    }

    setSavingClass(true);
    setClassFormError("");
    try {
      const payload = {
        name,
        grade_level,
        academic_year_id: year.id,
        homeroom_teacher_id: classForm.homeroom_teacher_id || null,
      };
      const result = editingClass
        ? await supabase.from("classes").update(payload).eq("id", editingClass.id).select("id").single()
        : await supabase.from("classes").insert(payload).select("id").single();
      if (result.error) throw result.error;

      const auditWarning = await logMasterChange(
        editingClass ? "Data kelas diperbarui" : "Kelas ditambahkan",
        `${name} · tingkat ${grade_level} · ${year.name}`,
      );
      setMasterNotice(
        `${editingClass ? "Data kelas berhasil diperbarui" : "Kelas berhasil ditambahkan"}.${auditWarning ? ` Audit aktivitas gagal: ${auditWarning}` : ""}`,
      );
      setShowClassForm(false);
      setEditingClass(null);
      setClassForm(emptyClassForm);
      setClassReloadVersion((version) => version + 1);
    } catch (error) {
      setClassFormError(`Gagal ${editingClass ? "memperbarui" : "menambahkan"} kelas: ${formatSupabaseError(error)}`);
    } finally {
      setSavingClass(false);
    }
  };

  const saveAcademicYear = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = academicYearForm.name.trim();
    if (!name) {
      setAcademicYearFormError("Nama tahun ajaran wajib diisi.");
      return;
    }
    if (academicYears.some((year) => year.name.trim().toLowerCase() === name.toLowerCase())) {
      setAcademicYearFormError("Nama tahun ajaran tersebut sudah terdaftar.");
      return;
    }
    if (academicYearForm.start_date && academicYearForm.end_date && academicYearForm.end_date < academicYearForm.start_date) {
      setAcademicYearFormError("Tanggal berakhir tidak boleh lebih awal daripada tanggal mulai.");
      return;
    }

    setSavingAcademicYear(true);
    setAcademicYearFormError("");
    try {
      const { data, error } = await supabase
        .from("academic_years")
        .insert({
          name,
          start_date: academicYearForm.start_date || null,
          end_date: academicYearForm.end_date || null,
          is_active: false,
        })
        .select("id, name, is_active, start_date, end_date")
        .single();
      if (error) throw error;

      const auditWarning = await logMasterChange("Tahun ajaran ditambahkan", name);
      setAcademicYears((current) => [...current, data as AcademicYear].sort((a, b) => (b.start_date ?? "").localeCompare(a.start_date ?? "")));
      setAcademicYearForm({ name: "", start_date: "", end_date: "" });
      setMasterNotice(`Tahun ajaran berhasil ditambahkan.${auditWarning ? ` Audit aktivitas gagal: ${auditWarning}` : ""}`);
      setClassReloadVersion((version) => version + 1);
    } catch (error) {
      setAcademicYearFormError(`Tahun ajaran gagal ditambahkan: ${formatSupabaseError(error)}`);
    } finally {
      setSavingAcademicYear(false);
    }
  };

  const activateAcademicYear = async (year: AcademicYear) => {
    if (!canManageDataInduk || year.is_active || activatingAcademicYearId) return;
    setActivatingAcademicYearId(year.id);
    setAcademicYearFormError("");
    try {
      const { error } = await supabase
        .from("academic_years")
        .update({ is_active: true })
        .eq("id", year.id)
        .select("id")
        .single();
      if (error) throw error;
      const auditWarning = await logMasterChange("Tahun ajaran diaktifkan", year.name);
      setAcademicYears((current) => current.map((item) => ({ ...item, is_active: item.id === year.id })));
      setMasterNotice(`Tahun ajaran ${year.name} sekarang aktif.${auditWarning ? ` Audit aktivitas gagal: ${auditWarning}` : ""}`);
      setClassReloadVersion((version) => version + 1);
    } catch (error) {
      setAcademicYearFormError(`Gagal mengaktifkan tahun ajaran: ${formatSupabaseError(error)}`);
    } finally {
      setActivatingAcademicYearId(null);
    }
  };

  const handleDeleteClass = async (row: ClassRow) => {
    if (row.student_count > 0) { alert("Kelas tidak dapat dihapus karena masih memiliki siswa. Pindahkan siswa terlebih dahulu."); return; }
    if (!window.confirm(`Hapus kelas ${row.name}?`)) return;
    const { error } = await supabase.from("classes").delete().eq("id", row.id);
    if (error) { alert(`Gagal menghapus. Penghapusan kelas hanya diizinkan untuk super_admin. Detail: ${error.message}`); return; }
    const auditWarning = await logMasterChange(
      "Kelas dihapus",
      `${row.name} · tingkat ${row.grade_level}`,
    );
    if (auditWarning) setMasterNotice(`Kelas dihapus, tetapi audit gagal: ${auditWarning}`);
    setClassRows(prev => prev.filter(x => x.id !== row.id));
  };

  const openBulkMove = () => {
    if (!canManageDataInduk) return;
    bulkLoadRequestRef.current += 1;
    setBulkMoveMode("move");
    setBulkSourceYearId((academicYears.find((year) => year.is_active) ?? academicYears[0])?.id ?? "");
    setBulkSourceClassId("");
    setBulkDestinationClassId("");
    setBulkStudents([]);
    setBulkSelectedIds([]);
    setBulkError("");
    setShowBulkMove(true);
  };

  const closeBulkMove = () => {
    bulkLoadRequestRef.current += 1;
    setShowBulkMove(false);
    setBulkLoading(false);
  };

  const loadBulkStudents = async (classId: string) => {
    bulkLoadRequestRef.current += 1;
    const requestId = bulkLoadRequestRef.current;
    setBulkSourceClassId(classId);
    setBulkStudents([]);
    setBulkSelectedIds([]);
    setBulkError("");
    if (!classId) {
      setBulkLoading(false);
      return;
    }

    setBulkLoading(true);
    try {
      const { data, error } = await supabase
        .from("students")
        .select("id,nisn,full_name,status")
        .eq("class_id", classId)
        .neq("status", "Graduated")
        .order("full_name");
      if (error) throw error;
      if (requestId !== bulkLoadRequestRef.current) return;
      const eligibleStudents = (data ?? []) as BulkMoveStudent[];
      setBulkStudents(eligibleStudents);
      setBulkSelectedIds(eligibleStudents.map((student) => student.id));
    } catch (error) {
      if (requestId === bulkLoadRequestRef.current) {
        setBulkError(`Daftar siswa gagal dimuat: ${formatSupabaseError(error)}`);
      }
    } finally {
      if (requestId === bulkLoadRequestRef.current) setBulkLoading(false);
    }
  };

  const handleBulkMoveStudents = async () => {
    if (!canManageDataInduk) return;
    const sourceYear = academicYears.find((year) => year.id === bulkSourceYearId);
    const sourceClass = classRows.find((row) => row.id === bulkSourceClassId);
    const destinationClass = classRows.find((row) => row.id === bulkDestinationClassId);
    const selectableStudents = bulkMoveMode === "graduate"
      ? bulkStudents.filter((student) => student.status === "Active")
      : bulkStudents;
    const selectedStudents = selectableStudents.filter((student) => bulkSelectedIds.includes(student.id));
    if (!sourceYear || !sourceClass || !selectedStudents.length) {
      setBulkError("Pilih tahun ajaran asal, kelas asal, dan minimal satu siswa.");
      return;
    }
    if (bulkMoveMode === "graduate" && sourceClass.grade_level !== 12) {
      setBulkError("Siswa hanya dapat diluluskan melalui proses massal dari kelas tingkat 12.");
      return;
    }
    if (bulkMoveMode === "graduate" && selectedStudents.some((student) => student.status !== "Active")) {
      setBulkError("Hanya siswa berstatus Active yang dapat diluluskan melalui proses ini.");
      return;
    }
    if (bulkMoveMode === "move" && !destinationClass) {
      setBulkError("Pilih kelas tujuan.");
      return;
    }
    if (bulkMoveMode === "move" && destinationClass?.id === bulkSourceClassId) {
      setBulkError("Kelas tujuan harus berbeda dari kelas asal.");
      return;
    }
    if (selectedStudents.length > 5000) {
      setBulkError("Proses dibatasi maksimal 5.000 siswa. Kurangi pilihan siswa.");
      return;
    }

    const confirmation = bulkMoveMode === "graduate"
      ? `Luluskan ${selectedStudents.length} siswa Active dari ${sourceClass.name} (${sourceYear.name})? Status mereka akan menjadi Graduated. Perubahan ini tercatat di Riwayat Perubahan.`
      : [
          `Pindahkan ${selectedStudents.length} siswa dari ${sourceClass.name} (${sourceYear.name})`,
          `ke ${destinationClass?.name} (${destinationClass?.academic_year_name})?`,
          "Perubahan ini akan tercatat di Riwayat Perubahan.",
        ].join("\n");
    if (!window.confirm(confirmation)) return;

    setBulkSaving(true);
    setBulkError("");
    try {
      if (bulkMoveMode === "graduate") {
        const { data, error } = await supabase
          .from("students")
          .update({ status: "Graduated" })
          .eq("class_id", sourceClass.id)
          .eq("status", "Active")
          .in("id", selectedStudents.map((student) => student.id))
          .select("id");
        if (error) throw error;
        if ((data ?? []).length !== selectedStudents.length) {
          throw new Error(`Server memperbarui ${(data ?? []).length} dari ${selectedStudents.length} siswa yang dipilih.`);
        }
        const auditWarning = await logMasterChange(
          "Siswa diluluskan secara massal",
          `${selectedStudents.length} siswa dari ${sourceClass.name} · tingkat ${sourceClass.grade_level} · ${sourceYear.name}`,
        );
        const graduatedIds = new Set(selectedStudents.map((student) => student.id));
        setStudents((current) => current.map((student) =>
          graduatedIds.has(student.id) ? { ...student, status: "Graduated" } : student
        ));
        setMasterNotice(
          `${selectedStudents.length} siswa berhasil ditandai Graduated.${auditWarning ? ` Audit aktivitas gagal: ${auditWarning}` : ""}`,
        );
        setClassReloadVersion((version) => version + 1);
        closeBulkMove();
        return;
      }

      const { data, error } = await supabase.rpc("datainduk_move_students_to_class", {
        p_source_academic_year_id: sourceYear.id,
        p_source_class_id: sourceClass.id,
        p_destination_class_id: destinationClass?.id ?? "",
        p_student_ids: selectedStudents.map((student) => student.id),
      });
      if (error) throw error;
      const movedCount = Number(data);
      if (!Number.isInteger(movedCount) || movedCount !== selectedStudents.length) {
        throw new Error(`Server memindahkan ${movedCount} dari ${selectedStudents.length} siswa yang dipilih.`);
      }
      const auditWarning = await logMasterChange(
        "Siswa dipindahkan secara massal",
        `${movedCount} siswa · ${sourceClass.name} → ${destinationClass?.name} · ${destinationClass?.academic_year_name}`,
      );
      setMasterNotice(
        `${movedCount} siswa berhasil dipindahkan ke ${destinationClass?.name} (${destinationClass?.academic_year_name}).${auditWarning ? ` Audit aktivitas gagal: ${auditWarning}` : ""}`
      );
      setClassReloadVersion((version) => version + 1);
      closeBulkMove();
    } catch (error) {
      setBulkError(`Pemindahan siswa gagal: ${formatSupabaseError(error)}`);
    } finally {
      setBulkSaving(false);
    }
  };

  const handleExportMaster = async () => {
    if (activeMenu === "siswa") return handleExportStudents();
    const rows = activeMenu === "guru" ? teachers.filter(t => `${t.nip ?? ""} ${t.full_name} ${t.employment_status ?? ""}`.toLowerCase().includes(search.toLowerCase())).map(t => ({ NIP: t.nip ?? "", Nama: t.full_name, "Status Akun": getTeacherAccountStatus(t), Jabatan: t.employment_status ?? "" })) : classRows.filter(c => `${c.name} ${c.academic_year_name} ${c.homeroom_teacher_name}`.toLowerCase().includes(search.toLowerCase())).map(c => ({ "Nama Kelas": c.name, Tingkat: c.grade_level, "Tahun Ajaran": c.academic_year_name, "Wali Kelas": c.homeroom_teacher_name, "Jumlah Siswa": c.student_count }));
    if (!rows.length) { alert("Tidak ada data untuk diekspor."); return; }
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), activeMenu === "guru" ? "Guru dan Tendik" : "Data Kelas");
    XLSX.writeFile(wb, activeMenu === "guru" ? "Data_Guru_Tendik_SMAN_7_Maros.xlsx" : "Data_Kelas_SMAN_7_Maros.xlsx");
  };

  const activeItem = menuItems.find(
    (item) => item.id === activeMenu
  );

  const handleExcelUpload = async (
  event: React.ChangeEvent<HTMLInputElement>
) => {
  const file = event.target.files?.[0];
    if (!file) return;

    let rows: ImportStudentRow[] = [];
    setImporting(true);
  setImportError("");
  setImportRows([]);
    setImportValidationComplete(false);
  setImportFileName(file.name);

  try {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];

    if (!sheet) {
      throw new Error("File Excel tidak memiliki lembar kerja.");
    }

    const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
      sheet,
      { defval: "" }
    );

    if (rawRows.length === 0) {
      throw new Error("File Excel tidak memiliki data siswa.");
    }

    const normalizeHeader = (value: string) =>
      value
        .trim()
        .toLowerCase()
        .replace(/[\s_-]+/g, "");

    rows = rawRows.map((raw, index) => {
      const normalized: Record<string, unknown> = {};

      Object.entries(raw).forEach(([key, value]) => {
        normalized[normalizeHeader(key)] = value;
      });

      const getValue = (...keys: string[]) => {
        for (const key of keys) {
          const value = normalized[key];
          if (value !== undefined && value !== null && value !== "") {
            return value;
          }
        }
        return "";
      };

      const nisn = String(getValue("nisn")).trim();
      const full_name = String(
        getValue("nama", "namalengkap", "fullname")
      ).trim();
      const class_name = String(getValue("kelas", "class")).trim();
      const rawBirthDate = getValue(
        "tanggallahir",
        "birthdate",
        "tgllahir"
      );
      const genderRaw = String(
        getValue("jenis kelamin", "jeniskelamin", "gender")
      )
        .trim()
        .toUpperCase();

      let birth_date = "";

      if (rawBirthDate instanceof Date) {
        birth_date = [
          rawBirthDate.getFullYear(),
          String(rawBirthDate.getMonth() + 1).padStart(2, "0"),
          String(rawBirthDate.getDate()).padStart(2, "0"),
        ].join("-");
      } else if (typeof rawBirthDate === "number") {
        const parsed = XLSX.SSF.parse_date_code(rawBirthDate);

        if (parsed) {
          birth_date = [
            parsed.y,
            String(parsed.m).padStart(2, "0"),
            String(parsed.d).padStart(2, "0"),
          ].join("-");
        }
      } else if (rawBirthDate) {
        const dateText = String(rawBirthDate).trim();
        const match = dateText.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);

        if (match) {
          birth_date = `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
        } else {
          const localMatch = dateText.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);

          if (localMatch) {
            birth_date = `${localMatch[3]}-${localMatch[2].padStart(2, "0")}-${localMatch[1].padStart(2, "0")}`;
          }
        }
      }

      const gender =
        ["L", "LAKI-LAKI", "LAKI LAKI"].includes(genderRaw)
          ? "L"
          : ["P", "PEREMPUAN"].includes(genderRaw)
            ? "P"
            : genderRaw;

      const errors: string[] = [];

      if (!/^\d{10}$/.test(nisn)) {
        errors.push("NISN harus 10 angka");
      }

      if (!full_name) {
        errors.push("Nama wajib diisi");
      }

      if (!class_name) {
        errors.push("Kelas wajib diisi");
      }

      if (rawBirthDate && !birth_date) {
        errors.push("Format tanggal lahir tidak dikenali");
      }

      if (gender && !["L", "P"].includes(gender)) {
        errors.push("Jenis kelamin harus L atau P");
      }

      return {
        source_row: index + 2,
        nisn,
        full_name,
        class_name,
        birth_date,
        gender,
        errors,
      };
    });

    const rowNumbersByNisn = new Map<string, number[]>();
    rows.forEach((row) => {
      if (!row.nisn) return;
      const rowNumbers = rowNumbersByNisn.get(row.nisn) ?? [];
      rowNumbers.push(row.source_row);
      rowNumbersByNisn.set(row.nisn, rowNumbers);
    });
    rows.forEach((row) => {
      const duplicateRowNumbers = rowNumbersByNisn.get(row.nisn) ?? [];
      if (duplicateRowNumbers.length > 1) {
        row.errors.push(
          `NISN duplikat di dalam file (baris ${duplicateRowNumbers.join(", ")})`
        );
      }
    });

    const nisns = [...new Set(rows.filter((row) => /^\d{10}$/.test(row.nisn)).map((row) => row.nisn))];
    const existingNisns = new Set<string>();
    for (let offset = 0; offset < nisns.length; offset += 500) {
      const { data: existing, error: existingError } = await supabase
        .from("students")
        .select("nisn")
        .in("nisn", nisns.slice(offset, offset + 500));
      if (existingError) throw existingError;
      (existing ?? []).forEach((item) => existingNisns.add(item.nisn.trim()));
    }

    const { data: registeredClasses, error: classError } = await supabase
      .from("classes")
      .select("name");
    if (classError) throw classError;

    const classNames = new Set(
      (registeredClasses ?? []).map((item) => item.name.trim().toLowerCase())
    );
    rows.forEach((row) => {
      if (existingNisns.has(row.nisn)) {
        row.errors.push("NISN sudah terdaftar di database");
      }
      if (row.class_name && !classNames.has(row.class_name.toLowerCase())) {
        row.errors.push("Kelas tidak terdaftar di database");
      }
    });

    setImportRows(rows);
    setImportValidationComplete(true);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Kesalahan tidak diketahui.";
    if (rows.length) {
      rows = rows.map((row) => ({
        ...row,
        errors: [...row.errors, "Validasi database gagal; baris ini belum dapat diimpor."],
      }));
      setImportRows(rows);
    }
    setImportValidationComplete(false);
    setImportError(`Gagal memvalidasi file Excel: ${message}`);
  } finally {
    setImporting(false);
    event.target.value = "";
  }
};

const handleDownloadImportReport = () => {
  if (!importRows.length) return;
  const reportRows = importRows.map((row) => ({
    "Baris Excel": row.source_row,
    NISN: row.nisn,
    "Nama Lengkap": row.full_name,
    Kelas: row.class_name,
    "Tanggal Lahir": row.birth_date,
    "Jenis Kelamin": row.gender,
    Status: row.errors.length ? "Perlu diperbaiki" : "Valid",
    Kesalahan: row.errors.join("; "),
  }));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(reportRows),
    "Laporan Validasi"
  );
  XLSX.writeFile(
    workbook,
    `Laporan_Validasi_Impor_Siswa_${new Date().toISOString().slice(0, 10)}.xlsx`
  );
};


const handleDownloadStudentTemplate = () => {
  const headers = [
    "NISN",
    "Nama",
    "Kelas",
    "Tanggal Lahir",
    "Jenis Kelamin",
  ];

  const exampleRows = [
    ["0012345678", "Contoh Nama Siswa", "X A", "15/05/2009", "L"],
    ["0098765432", "Contoh Nama Siswi", "X B", "21/08/2009", "P"],
  ];

  const worksheet = XLSX.utils.aoa_to_sheet([
    headers,
    ...exampleRows,
  ]);

  // Pertahankan NISN sebagai teks agar angka nol di depan tidak hilang.
  worksheet["!cols"] = [
    { wch: 16 },
    { wch: 30 },
    { wch: 16 },
    { wch: 18 },
    { wch: 18 },
  ];

  // Beri petunjuk pengisian di lembar terpisah.
  const instructions = XLSX.utils.aoa_to_sheet([
    ["PETUNJUK TEMPLATE IMPOR SISWA SMAN 7 MAROS"],
    ["1. Isi satu baris untuk satu siswa."],
    ["2. NISN harus berupa teks dan terdiri dari 10 angka."],
    ["3. Nama wajib diisi."],
    ["4. Kelas harus sama dengan nama kelas yang terdaftar di aplikasi."],
    ["5. Tanggal lahir gunakan format DD/MM/YYYY, contoh 15/05/2009."],
    ["6. Jenis Kelamin hanya menggunakan L atau P."],
    ["7. Hapus baris contoh sebelum mengunggah data sebenarnya."],
    ["8. Jangan mengubah nama kolom pada baris pertama lembar Data Siswa."],
  ]);

  instructions["!cols"] = [{ wch: 100 }];

  const workbook = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(
    workbook,
    worksheet,
    "Data Siswa"
  );

  XLSX.utils.book_append_sheet(
    workbook,
    instructions,
    "Petunjuk"
  );

  XLSX.writeFile(
    workbook,
    "Template_Impor_Siswa_SMAN_7_Maros.xlsx"
  );
};

const handleDownloadTeacherTemplate = () => {
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.aoa_to_sheet([
    ["NIP", "Nama Lengkap", "Jabatan"],
    ["000000000000000001", "Contoh Nama Guru", "Guru Mata Pelajaran"],
    ["000000000000000002", "Contoh Nama Konselor", "Guru BK / Konselor"],
  ]);
  worksheet["!cols"] = [{ wch: 24 }, { wch: 32 }, { wch: 34 }];
  const instructions = XLSX.utils.aoa_to_sheet([
    ["PETUNJUK TEMPLATE IMPOR GURU/TENDIK"],
    ["1. Isi satu baris untuk satu guru atau tenaga kependidikan."],
    ["2. NIP harus berupa teks dan minimal 6 angka."],
    ["3. Nama Lengkap dan Jabatan wajib diisi."],
    ["4. NIP duplikat di dalam file atau database akan ditolak."],
    ["5. Hapus baris contoh sebelum mengunggah data sebenarnya."],
  ]);
  instructions["!cols"] = [{ wch: 100 }];
  XLSX.utils.book_append_sheet(workbook, worksheet, "Data Guru");
  XLSX.utils.book_append_sheet(workbook, instructions, "Petunjuk");
  XLSX.writeFile(workbook, "Template_Impor_Guru_Tendik_SMAN_7_Maros.xlsx");
};

const handleTeacherExcelUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
  const file = event.target.files?.[0];
  if (!file) return;
  if (!canManageDataInduk) {
    setTeacherImportError("Impor guru/tendik hanya dapat dilakukan operator atau super admin.");
    event.target.value = "";
    return;
  }

  setImporting(true);
  setTeacherImportError("");
  setTeacherImportNotice("");
  setTeacherImportRows([]);
  setTeacherImportValidationComplete(false);
  setTeacherImportFileName(file.name);
  let rows: ImportTeacherRow[] = [];

  try {
    const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    if (!sheet) throw new Error("File Excel tidak memiliki lembar kerja.");
    const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
    if (!rawRows.length) throw new Error("File Excel tidak memiliki data guru/tendik.");

    const normalizeHeader = (value: string) => value.trim().toLowerCase().replace(/[\s_-]+/g, "");
    rows = rawRows.map((raw, index) => {
      const normalized: Record<string, unknown> = {};
      Object.entries(raw).forEach(([key, value]) => { normalized[normalizeHeader(key)] = value; });
      const nip = String(normalized.nip ?? "").trim();
      const full_name = String(normalized.namalengkap ?? normalized.nama ?? normalized.fullname ?? "").trim();
      const employment_status = String(normalized.jabatan ?? normalized.posisi ?? "").trim();
      const errors: string[] = [];
      if (!/^\d{6,}$/.test(nip)) errors.push("NIP harus minimal 6 angka");
      if (full_name.length < 2 || full_name.length > 150) errors.push("Nama harus 2–150 karakter");
      if (!employment_status) errors.push("Jabatan wajib diisi");
      return { source_row: index + 2, nip, full_name, employment_status, errors };
    });

    const rowNumbersByNip = new Map<string, number[]>();
    rows.forEach((row) => {
      if (!row.nip) return;
      rowNumbersByNip.set(row.nip, [...(rowNumbersByNip.get(row.nip) ?? []), row.source_row]);
    });
    rows.forEach((row) => {
      const duplicateRows = rowNumbersByNip.get(row.nip) ?? [];
      if (duplicateRows.length > 1) row.errors.push(`NIP duplikat di dalam file (baris ${duplicateRows.join(", ")})`);
    });

    const nips = [...new Set(rows.filter((row) => /^\d{6,}$/.test(row.nip)).map((row) => row.nip))];
    const existingNips = new Set<string>();
    for (let offset = 0; offset < nips.length; offset += 500) {
      const { data, error } = await supabase.from("teachers").select("nip").in("nip", nips.slice(offset, offset + 500));
      if (error) throw error;
      (data ?? []).forEach((item) => { if (item.nip) existingNips.add(item.nip.trim()); });
    }
    rows.forEach((row) => {
      if (existingNips.has(row.nip)) row.errors.push("NIP sudah terdaftar di database");
    });
    setTeacherImportRows(rows);
    setTeacherImportValidationComplete(true);
  } catch (error) {
    if (rows.length) {
      setTeacherImportRows(rows.map((row) => ({
        ...row,
        errors: [...row.errors, "Validasi database gagal; baris ini belum dapat diimpor."],
      })));
    }
    setTeacherImportError(`Gagal memvalidasi file Excel guru/tendik: ${formatSupabaseError(error)}`);
  } finally {
    setImporting(false);
    event.target.value = "";
  }
};

const handleImportTeachers = async () => {
  if (!canManageDataInduk || !teacherImportValidationComplete) {
    setTeacherImportError("Validasi belum selesai atau Anda tidak memiliki izin impor.");
    return;
  }
  const validRows = teacherImportRows.filter((row) => row.errors.length === 0);
  if (!validRows.length) {
    setTeacherImportError("Tidak ada baris guru/tendik valid untuk diimpor.");
    return;
  }

  setImporting(true);
  setTeacherImportError("");
  setTeacherImportNotice("");
  try {
    const nips = validRows.map((row) => row.nip);
    const { data: existing, error: existingError } = await supabase
      .from("teachers")
      .select("nip")
      .in("nip", nips);
    if (existingError) throw existingError;
    const existingNips = new Set((existing ?? []).map((item) => item.nip?.trim()).filter((nip): nip is string => Boolean(nip)));
    const duplicateNips = new Set(nips.filter((nip) => existingNips.has(nip)));
    const rowsToInsert = validRows.filter((row) => !duplicateNips.has(row.nip));
    if (!rowsToInsert.length) {
      setTeacherImportRows((current) => current.map((row) =>
        duplicateNips.has(row.nip) ? { ...row, errors: [...row.errors, "NIP sudah terdaftar di database"] } : row
      ));
      setTeacherImportError("Semua NIP valid pada file ini sudah terdaftar. Tidak ada data baru yang ditambahkan.");
      return;
    }

    const { error: insertError } = await supabase.from("teachers").insert(rowsToInsert.map((row) => ({
      nip: row.nip,
      full_name: row.full_name,
      employment_status: row.employment_status,
    })));
    if (insertError) throw insertError;

    const auditWarning = await logMasterChange(
      "Data guru/tendik diimpor",
      `${rowsToInsert.length} guru/tendik berhasil diimpor.`,
    );
    setTeacherImportRows((current) => current
      .filter((row) => duplicateNips.has(row.nip))
      .map((row) => ({ ...row, errors: [...row.errors, "NIP sudah terdaftar di database"] })));
    setTeacherImportValidationComplete(true);
    setTeacherImportNotice(
      `${rowsToInsert.length} guru/tendik berhasil diimpor.${duplicateNips.size ? ` ${duplicateNips.size} baris dilewati karena NIP sudah terdaftar.` : ""}${auditWarning ? ` Audit aktivitas gagal: ${auditWarning}` : ""}`,
    );
    if (!duplicateNips.size) setTeacherImportFileName("");
  } catch (error) {
    setTeacherImportError(`Impor guru/tendik gagal: ${formatSupabaseError(error)}`);
  } finally {
    setImporting(false);
  }
};


const handleImportStudents = async () => {
  if (!importValidationComplete) {
    setImportError("Validasi data belum selesai. Unggah ulang file sebelum mengimpor.");
    return;
  }

  const validRows = importRows.filter(
    (row) => row.errors.length === 0
  );

  if (validRows.length === 0) {
    setImportError("Tidak ada baris valid untuk diimpor.");
    return;
  }

  setImporting(true);
  setImportError("");

  try {
    // Pastikan nama variabel client Supabase sesuai dengan file Anda.
    const { data: classes, error: classError } = await supabase
      .from("classes")
      .select("id, name");

    if (classError) throw classError;

    const classMap = new Map(
      (classes ?? []).map((item) => [
        item.name.trim().toLowerCase(),
        item.id,
      ])
    );

    const prepared = validRows.map((row) => ({
      row,
      classId: classMap.get(row.class_name.trim().toLowerCase()),
    }));

    const missingClasses = prepared.filter(
      (item) => !item.classId
    );

    if (missingClasses.length > 0) {
      const missingClassNames = new Set(
        missingClasses.map((item) => item.row.class_name.trim().toLowerCase())
      );
      setImportRows((current) => current.map((row) =>
        missingClassNames.has(row.class_name.trim().toLowerCase())
          ? { ...row, errors: [...row.errors, "Kelas tidak terdaftar di database"] }
          : row
      ));
      setImportError(
        "Kelas berikut belum terdaftar di database: " +
        [...new Set(missingClasses.map((item) => item.row.class_name))]
          .join(", ") +
        ". Daftarkan kelas terlebih dahulu, lalu unggah kembali."
      );
      return;
    }

    const nisns = prepared.map((item) => item.row.nisn);

    const { data: existing, error: existingError } = await supabase
      .from("students")
      .select("nisn")
      .in("nisn", nisns);

    if (existingError) throw existingError;

    const existingSet = new Set(
      (existing ?? []).map((item) => item.nisn)
    );

    const duplicateRows = prepared.filter(
      (item) => existingSet.has(item.row.nisn)
    );

    const rowsToInsert = prepared.filter(
      (item) => !existingSet.has(item.row.nisn)
    );

    if (rowsToInsert.length === 0) {
      const duplicateNisns = new Set(duplicateRows.map((item) => item.row.nisn));
      setImportRows((current) => current.map((row) =>
        duplicateNisns.has(row.nisn)
          ? { ...row, errors: [...row.errors, "NISN sudah terdaftar di database"] }
          : row
      ));
      setImportError(
        "Semua NISN valid pada file ini sudah ada di database. Tidak ada data baru yang ditambahkan."
      );
      return;
    }

    const records = rowsToInsert.map(({ row, classId }) => ({
      nisn: row.nisn,
      full_name: row.full_name,
      class_id: classId,
      birth_date: row.birth_date || null,
      gender: row.gender || null,
      status: "Active",
    }));

    const { error: insertError } = await supabase
      .from("students")
      .insert(records);

    if (insertError) throw insertError;
    const auditWarning = await logMasterChange(
      "Data siswa diimpor",
      `${rowsToInsert.length} siswa berhasil diimpor.`,
    );

    const duplicateMessage = duplicateRows.length
      ? ` ${duplicateRows.length} siswa dilewati karena NISN sudah terdaftar.`
      : "";

    const duplicateNisns = new Set(duplicateRows.map((item) => item.row.nisn));
    const rowsWithErrors = importRows
      .map((row) => duplicateNisns.has(row.nisn)
        ? { ...row, errors: [...row.errors, "NISN sudah terdaftar di database"] }
        : row)
      .filter((row) => row.errors.length > 0);

    alert(
      `${rowsToInsert.length} siswa berhasil diimpor ke database.` +
      duplicateMessage +
      (auditWarning ? ` Audit aktivitas gagal: ${auditWarning}` : "") +
      (rowsWithErrors.length
        ? ` ${rowsWithErrors.length} baris bermasalah tetap tersedia untuk diunduh pada laporan validasi.`
        : "")
    );

    setImportRows(rowsWithErrors);
    setImportValidationComplete(true);
    if (rowsWithErrors.length === 0) {
      setImportFileName("");
      setActiveMenu("siswa");
    }
  } catch (error) {
    setImportError(
      error instanceof Error
        ? error.message
        : "Impor gagal. Periksa koneksi dan izin database."
    );
  } finally {
    setImporting(false);
  }
};

const handleExportStudents = async () => {
  const getClassName = (relation: unknown) => {
    const classRow = Array.isArray(relation) ? relation[0] : relation;
    if (
      classRow === null ||
      typeof classRow !== "object" ||
      !("name" in classRow) ||
      typeof classRow.name !== "string"
    ) {
      return "";
    }

    return classRow.name;
  };

  try {
    const { data, error } = await supabase
      .from("students")
      .select(
        "nisn, full_name, class:classes!students_class_id_fkey(name), birth_date, gender, status"
      )
      .order("full_name");

    if (error) throw error;

    if (!data || data.length === 0) {
      alert("Belum ada data siswa di database untuk diekspor.");
      return;
    }

    const rows = data.map((student) => ({
      NISN: student.nisn,
      Nama: student.full_name,
      Kelas: getClassName(student.class),
      "Tanggal Lahir": student.birth_date ?? "",
      "Jenis Kelamin": student.gender ?? "",
      Status: student.status,
    }));

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(
      workbook,
      worksheet,
      "Data Siswa"
    );

    XLSX.writeFile(
      workbook,
      "Data_Siswa_SMAN_7_Maros.xlsx"
    );
  } catch (error) {
    alert(
      error instanceof Error
        ? `Ekspor gagal: ${error.message}`
        : "Ekspor gagal. Periksa koneksi database."
    );
  }
};

const filteredAuditEntries = auditEntries.filter((entry) => {
  const searchText = [
    entry.actor_name ?? "",
    entry.actor_id ?? "",
    entry.table_name,
    entry.record_id,
    entry.operation,
    ...(entry.changed_fields ?? []),
    entry.old_data?.full_name ?? "",
    entry.new_data?.full_name ?? "",
    entry.old_data?.nisn ?? "",
    entry.new_data?.nisn ?? "",
    entry.old_data?.nip ?? "",
    entry.new_data?.nip ?? "",
  ].join(" ").toLowerCase();
  return searchText.includes(search.trim().toLowerCase());
});

  return (
    <div className="di-page">
      <style>{`
        .di-page {
          --di-accent: #0b6951;
          --di-accent-strong: #075442;
          --di-accent-soft: #eaf5f1;
          --di-focus-ring: rgba(11, 105, 81, .16);
          color: #172b4d;
          display: flex;
          flex-direction: column;
          gap: 24px;
          width: 100%;
        }

        .di-heading {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 16px;
          flex-wrap: wrap;
        }

        .di-eyebrow {
          color: #64748b;
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 1.4px;
          text-transform: uppercase;
          margin-bottom: 8px;
        }

        .di-heading h2 {
          margin: 0;
          font-size: 26px;
          font-weight: 800;
        }

        .di-heading p {
          color: #64748b;
          margin: 8px 0 0;
          line-height: 1.6;
        }

        .di-menu-grid {
          display: grid;
          grid-template-columns: repeat(5, minmax(0, 1fr));
          gap: 14px;
        }

        .di-menu-card {
          text-align: left;
          padding: 20px;
          min-width: 0;
          border: 1px solid #e2e8f0;
          border-radius: 16px;
          background: white;
          cursor: pointer;
          transition: border-color .2s, transform .2s,
            box-shadow .2s;
        }

        .di-menu-card:hover {
          border-color: #a7d6c9;
          transform: translateY(-2px);
          box-shadow: 0 12px 28px rgba(15, 23, 42, .08);
        }

        .di-menu-card:focus-visible {
          outline: 3px solid var(--di-focus-ring);
          outline-offset: 2px;
        }

        .di-menu-card.di-selected {
          border-color: var(--di-accent);
          box-shadow: 0 0 0 3px var(--di-accent-soft);
          background: #f7fbf9;
        }

        .di-icon {
          width: 44px;
          height: 44px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 12px;
          background: var(--di-accent-soft);
          color: var(--di-accent);
          margin-bottom: 18px;
        }

        .di-menu-card strong {
          display: block;
          font-size: 14px;
          margin-bottom: 7px;
        }

        .di-menu-card p {
          font-size: 12px;
          line-height: 1.6;
          color: #64748b;
          margin: 0;
        }

        .di-content {
          border: 1px solid #e2e8f0;
          background: white;
          border-radius: 18px;
          overflow: hidden;
        }

        .di-content-head {
          padding: 22px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 16px;
          border-bottom: 1px solid #e2e8f0;
        }

        .di-content-head h3 {
          margin: 0;
          font-size: 18px;
        }

        .di-content-head p {
          color: #64748b;
          font-size: 13px;
          margin: 6px 0 0;
        }

        .di-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
        }

        .di-button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 10px 15px;
          border: 1px solid #d9e4e0;
          border-radius: 13px;
          background: white;
          color: #334155;
          font-weight: 650;
          font-size: 13px;
          cursor: pointer;
          min-height: 42px;
          box-shadow: 0 2px 5px rgba(15, 23, 42, .05);
          transition: background .18s ease, border-color .18s ease,
            box-shadow .18s ease, color .18s ease, transform .18s ease;
        }

        .di-button svg {
          flex-shrink: 0;
        }

        .di-button:hover:not(:disabled) {
          background: #f3faf7;
          border-color: #a7d6c9;
          color: var(--di-accent-strong);
          box-shadow: 0 8px 18px rgba(15, 23, 42, .09);
          transform: translateY(-1px);
        }

        .di-button:active:not(:disabled) {
          transform: translateY(0);
          box-shadow: 0 1px 2px #0f172a0a;
        }

        .di-button:focus-visible {
          outline: 3px solid var(--di-focus-ring);
          outline-offset: 2px;
        }

        .di-button:disabled {
          opacity: .5;
          cursor: not-allowed;
          box-shadow: none;
        }

        .di-button-primary {
          background: linear-gradient(135deg, var(--di-accent), var(--di-accent-strong));
          border-color: var(--di-accent-strong);
          color: white;
          box-shadow: 0 6px 14px rgba(11, 105, 81, .2);
        }

        .di-button-primary:hover:not(:disabled) {
          background: linear-gradient(135deg, #096148, #064534);
          border-color: #064534;
          color: white;
          box-shadow: 0 9px 20px rgba(11, 105, 81, .25);
        }

        .di-button-danger {
          color: #a43c42;
          border-color: #f0d7d8;
          background: #fff;
        }

        .di-button-danger:hover:not(:disabled) {
          color: #8d2930;
          border-color: #e8bfc1;
          background: #fff7f7;
        }

        .di-button-icon {
          width: 42px;
          min-width: 42px;
          padding: 0;
          border-radius: 12px;
        }

        .di-search-wrap {
          position: relative;
          max-width: 360px;
          width: 100%;
        }

        .di-search-wrap svg {
          position: absolute;
          left: 13px;
          top: 50%;
          transform: translateY(-50%);
          color: #94a3b8;
        }

        .di-search {
          width: 100%;
          box-sizing: border-box;
          padding: 12px 12px 12px 40px;
          border: 1px solid #dbe3ef;
          border-radius: 10px;
          font: inherit;
          font-size: 13px;
          outline: none;
        }

        .di-search:focus {
          border-color: #60a5fa;
          box-shadow: 0 0 0 3px #dbeafe;
        }

        .di-page form .di-form-label {
          display: block;
          margin: 8px 0 6px;
          color: #344b45;
          font-size: 12px;
          font-weight: 700;
        }

        .di-page form .di-search {
          padding: 11px 14px;
          min-height: 46px;
          border: 1px solid #d8e4df;
          border-radius: 13px;
          background-color: #f9fbfa;
          color: #203b34;
          transition: border-color .18s ease, box-shadow .18s ease,
            background-color .18s ease, transform .18s ease;
        }

        .di-page form .di-search:hover:not(:disabled):not(:focus) {
          border-color: #b7cec5;
          background-color: white;
        }

        .di-page form .di-search:focus {
          border-color: var(--di-accent);
          background-color: white;
          box-shadow: 0 0 0 4px var(--di-focus-ring);
        }

        .di-page form select.di-search {
          appearance: none;
          padding-right: 46px;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='%230b6951' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m7 10 5 5 5-5'/%3E%3C/svg%3E");
          background-repeat: no-repeat;
          background-position: right 15px center;
          cursor: pointer;
        }

        .di-page form select.di-search:disabled {
          cursor: not-allowed;
          color: #94a3a0;
          background-color: #f1f5f3;
        }

        .di-page form select.di-search option {
          color: #203b34;
          background: white;
        }

        .di-select-trigger {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          text-align: left;
          cursor: pointer;
        }

        .di-select-trigger > span {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .di-select-trigger > svg {
          flex-shrink: 0;
          color: var(--di-accent);
          transition: transform .18s ease;
        }

        .di-select-trigger.is-open > svg {
          transform: rotate(180deg);
        }

        .di-select-popover {
          position: fixed;
          z-index: 1300;
          overflow-y: auto;
          padding: 6px;
          box-sizing: border-box;
          border: 1px solid #dfe9e5;
          border-radius: 14px;
          background: white;
          box-shadow: 0 18px 48px rgba(15, 35, 29, .2);
          overscroll-behavior: contain;
          animation: di-select-enter .12s ease-out;
        }

        .di-select-option {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          min-height: 40px;
          padding: 10px 12px;
          border-radius: 9px;
          color: #344b45;
          font-size: 13px;
          font-weight: 550;
          cursor: pointer;
          outline: none;
          transition: background .14s ease, color .14s ease;
        }

        .di-select-option:hover,
        .di-select-option:focus-visible {
          background: #f2f8f6;
          color: #075442;
        }

        .di-select-option[aria-selected="true"] {
          background: #eaf5f1;
          color: #075442;
          font-weight: 700;
        }

        .di-select-option > svg {
          flex-shrink: 0;
          color: #0b6951;
        }

        @keyframes di-select-enter {
          from { opacity: 0; transform: translateY(-4px) scale(.99); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }

        .di-student-form {
          border: 1px solid #e3ece8;
          box-shadow: 0 28px 80px rgba(15, 35, 29, .25);
        }

        .di-student-form h3 {
          margin: 0 0 20px;
          color: #163d32;
          font-size: 21px;
          letter-spacing: -.025em;
        }

        .di-table-wrap {
          overflow-x: auto;
        }

        .di-table {
          width: 100%;
          border-collapse: collapse;
          text-align: left;
        }

        .di-table th {
          background: #f8fafc;
          color: #64748b;
          font-size: 11px;
          letter-spacing: .4px;
          text-transform: uppercase;
        }

        .di-table th, .di-table td {
          padding: 15px 20px;
          border-bottom: 1px solid #eef2f7;
          white-space: nowrap;
        }

        .di-empty {
          text-align: center;
          padding: 48px 20px;
          color: #64748b;
        }

        .di-empty-icon {
          margin: 0 auto 14px;
          width: 52px;
          height: 52px;
          display: flex;
          justify-content: center;
          align-items: center;
          border-radius: 16px;
          background: #f1f5f9;
          color: #64748b;
        }

        .di-empty strong {
          display: block;
          color: #334155;
          margin-bottom: 8px;
        }

        .di-empty p {
          margin: 0 auto 18px;
          max-width: 440px;
          font-size: 13px;
          line-height: 1.7;
        }

        .di-notice {
          margin: 18px 22px;
          padding: 13px 15px;
          background: #fffbeb;
          border: 1px solid #fde68a;
          color: #92400e;
          border-radius: 10px;
          font-size: 12px;
          line-height: 1.6;
        }

        .di-modal-backdrop {
          position: fixed;
          inset: 0;
          z-index: 1100;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 18px;
          overflow-y: auto;
          background: #0f172a80;
        }

        .di-bulk-form {
          width: min(100%, 680px);
          max-height: 92vh;
          overflow-y: auto;
          box-sizing: border-box;
          padding: 24px;
          border: 1px solid #e2e8f0;
          border-radius: 20px;
          background: white;
          box-shadow: 0 24px 70px #0f172a35;
        }

        .di-bulk-form h3 {
          margin: 0;
          color: #172b4d;
          font-size: 19px;
        }

        .di-bulk-description {
          margin: 8px 0 16px;
          color: #64748b;
          font-size: 13px;
          line-height: 1.6;
        }

        .di-bulk-fields {
          display: flex;
          flex-direction: column;
          gap: 3px;
        }

        .di-assignment-error {
          margin: 12px 0 0;
          color: #b91c1c;
          font-size: 13px;
        }

        .di-assignment-list {
          display: grid;
          gap: 9px;
          margin-top: 20px;
          padding-top: 16px;
          border-top: 1px solid #e8edf4;
          color: #334155;
          font-size: 13px;
        }

        .di-assignment-list > p {
          margin: 0;
          color: #64748b;
        }

        .di-assignment-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 11px 12px;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          background: #f8fafc;
        }

        .di-assignment-item > span {
          display: grid;
          gap: 3px;
        }

        .di-assignment-item small {
          color: #64748b;
        }

        .di-bulk-students {
          margin-top: 18px;
          overflow: hidden;
          border: 1px solid #e2e8f0;
          border-radius: 14px;
        }

        .di-bulk-students-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 12px 14px;
          background: #f8fafc;
          color: #334155;
          font-size: 13px;
        }

        .di-bulk-students-head label {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          color: #475569;
          font-size: 12px;
        }

        .di-bulk-students-list {
          max-height: 230px;
          overflow-y: auto;
        }

        .di-bulk-student {
          display: flex;
          align-items: center;
          gap: 11px;
          padding: 10px 14px;
          border-top: 1px solid #eef2f7;
          cursor: pointer;
        }

        .di-bulk-student:hover {
          background: #f8fafc;
        }

        .di-bulk-student input,
        .di-bulk-students-head input {
          accent-color: #2563eb;
        }

        .di-bulk-student span {
          display: flex;
          flex-direction: column;
          gap: 3px;
        }

        .di-bulk-student strong {
          color: #1e293b;
          font-size: 13px;
        }

        .di-bulk-student small,
        .di-bulk-empty {
          color: #64748b;
          font-size: 12px;
        }

        .di-bulk-empty {
          margin: 0;
          padding: 20px 14px;
          text-align: center;
        }

        .di-bulk-error {
          margin: 14px 0 0;
          color: #b91c1c;
          font-size: 13px;
        }

        .di-bulk-actions {
          justify-content: flex-end;
          margin-top: 20px;
        }

        .di-audit-panel {
          padding: 20px 22px;
        }

        .di-audit-toolbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 16px;
        }

        .di-audit-toolbar .di-search-wrap {
          max-width: 460px;
        }

        .di-audit-error {
          margin: 0 0 16px;
        }

        .di-audit-action {
          display: inline-flex;
          padding: 5px 9px;
          border-radius: 999px;
          font-size: 11px;
          font-weight: 700;
        }

        .di-audit-action.is-insert {
          background: #dcfce7;
          color: #166534;
        }

        .di-audit-action.is-update {
          background: #dbeafe;
          color: #1d4ed8;
        }

        .di-audit-action.is-delete {
          background: #fee2e2;
          color: #b91c1c;
        }

        .di-audit-details summary {
          color: #1d4ed8;
          cursor: pointer;
          font-size: 12px;
          font-weight: 700;
        }

        .di-audit-details ul {
          min-width: 300px;
          margin: 8px 0 0;
          padding: 0;
          list-style: none;
        }

        .di-audit-details li {
          display: grid;
          grid-template-columns: minmax(90px, 1fr) minmax(70px, 1fr) auto minmax(70px, 1fr);
          align-items: start;
          gap: 7px;
          padding: 6px 0;
          border-top: 1px solid #eef2f7;
          white-space: normal;
          font-size: 11px;
        }

        .di-audit-details li strong {
          color: #334155;
        }

        .di-audit-details li span {
          overflow-wrap: anywhere;
          color: #64748b;
        }

        .di-hint {
          margin: 14px 0 0;
          color: #64748b;
          font-size: 12px;
        }

        .di-import-summary {
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 12px;
        }

        .di-import-summary > div {
          display: flex;
          flex-wrap: wrap;
          gap: 14px;
          color: #475569;
          font-size: 12px;
        }

        .di-import-summary > div span {
          display: inline-flex;
          align-items: center;
          gap: 5px;
        }

        .di-import-summary > div span:first-child {
          color: #15803d;
        }

        .di-import-summary > div span:last-child {
          color: #b91c1c;
        }

        .di-excel-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 16px;
          padding: 22px;
        }

        .di-excel-card {
          padding: 22px;
          border: 1px solid #e2e8f0;
          border-radius: 14px;
        }

        .di-excel-card h4 {
          margin: 12px 0 8px;
        }

        .di-excel-card p {
          color: #64748b;
          font-size: 13px;
          line-height: 1.7;
        }

        @media (max-width: 1050px) {
          .di-menu-grid {
            grid-template-columns: repeat(3, minmax(0, 1fr));
          }
        }

        @media (max-width: 600px) {
          .di-menu-grid, .di-excel-grid {
            grid-template-columns: 1fr;
          }

          .di-audit-toolbar,
          .di-bulk-students-head {
            align-items: stretch;
            flex-direction: column;
          }

          .di-audit-panel {
            padding: 16px;
          }

          .di-bulk-form {
            padding: 18px;
          }

          .di-heading h2 {
            font-size: 22px;
          }

          .di-content-head {
            padding: 17px;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .di-select-trigger > svg,
          .di-select-option {
            transition: none;
          }

          .di-select-popover {
            animation: none;
          }
        }
      `}</style>

      <div className="di-heading">
        <div>
          <div className="di-eyebrow">Administrasi Sekolah</div>
          <h2>Data Induk</h2>
          <p>
            Pusat pengelolaan data siswa, guru, tenaga
            kependidikan, dan kelas SMAN 7 Maros.
          </p>
        </div>

      </div>

      {showStudentForm && activeMenu === "siswa" && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1000,
            background: "#0f172a80",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <form
            className="di-student-form"
            role="dialog"
            aria-modal="true"
            aria-labelledby="student-form-title"
            onSubmit={handleSaveStudent}
            style={{
              width: "100%",
              maxWidth: 560,
              maxHeight: "90vh",
              overflowY: "auto",
              background: "white",
              borderRadius: 22,
              padding: 24,
              boxSizing: "border-box",
            }}
          >
      <h3 id="student-form-title" style={{ marginTop: 0 }}>
        {editingStudent ? "Edit Data Siswa" : "Tambah Data Siswa"}
      </h3>

      <label className="di-form-label" htmlFor="student-nisn">NISN *</label>
      <input
        id="student-nisn"
        className="di-search"
        value={studentForm.nisn}
        onChange={(e) =>
          setStudentForm({ ...studentForm, nisn: e.target.value })
        }
        maxLength={10}
        inputMode="numeric"
        required
      />

      <label className="di-form-label" htmlFor="student-full-name">Nama Lengkap *</label>
      <input
        id="student-full-name"
        className="di-search"
        value={studentForm.full_name}
        onChange={(e) =>
          setStudentForm({
            ...studentForm,
            full_name: e.target.value,
          })
        }
        required
      />

      <label className="di-form-label" id="student-class-label" htmlFor="student-class">Kelas</label>
      <DataIndukSelect
        id="student-class"
        labelId="student-class-label"
        value={studentForm.class_id}
        onChange={(value) => setStudentForm({ ...studentForm, class_id: value })}
        options={[
          { value: "", label: "Belum ditempatkan di kelas" },
          ...classes.map((item) => ({
            value: item.id,
            label: `${item.name} — Tingkat ${item.grade_level}`,
          })),
        ]}
      />

      <label className="di-form-label" htmlFor="student-birth-date">Tanggal Lahir</label>
      <input
        id="student-birth-date"
        className="di-search"
        type="date"
        value={studentForm.birth_date}
        onChange={(e) =>
          setStudentForm({
            ...studentForm,
            birth_date: e.target.value,
          })
        }
      />

      <label className="di-form-label" id="student-gender-label" htmlFor="student-gender">Jenis Kelamin</label>
      <DataIndukSelect
        id="student-gender"
        labelId="student-gender-label"
        value={studentForm.gender}
        onChange={(value) => setStudentForm({ ...studentForm, gender: value })}
        options={[
          { value: "", label: "Belum diisi" },
          { value: "L", label: "Laki-laki" },
          { value: "P", label: "Perempuan" },
        ]}
      />

      <label className="di-form-label" htmlFor="student-parent-phone">Nomor WhatsApp Orang Tua</label>
      <input
        id="student-parent-phone"
        className="di-search"
        value={studentForm.parent_phone}
        onChange={(e) =>
          setStudentForm({
            ...studentForm,
            parent_phone: e.target.value.replace(/[^\d+]/g, ""),
          })
        }
        placeholder="Contoh: 6281234567890"
        inputMode="tel"
      />

      <label className="di-form-label" id="student-status-label" htmlFor="student-status">Status</label>
      <DataIndukSelect
        id="student-status"
        labelId="student-status-label"
        value={studentForm.status}
        onChange={(value) => setStudentForm({ ...studentForm, status: value as StudentForm["status"] })}
        options={[
          { value: "Active", label: "Aktif" },
          { value: "Inactive", label: "Tidak aktif" },
          { value: "Graduated", label: "Lulus" },
        ]}
      />

      {studentFormError && (
        <p style={{ color: "#b91c1c", fontSize: 13 }}>
          {studentFormError}
        </p>
      )}

      <div className="di-actions" style={{ marginTop: 20 }}>
        <button
          type="button"
          className="di-button"
          onClick={() => setShowStudentForm(false)}
          disabled={savingStudent}
        >
          Batal
        </button>
        <button
          type="submit"
          className="di-button di-button-primary"
          disabled={savingStudent}
        >
          {savingStudent ? "Menyimpan..." : "Simpan Data"}
        </button>
      </div>
      {studentNotice && (
        <div className="di-notice">{studentNotice}</div>
      )}
          </form>
        </div>
      )}

      {showTeacherForm && activeMenu === "guru" && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1000,
            background: "#0f172a80",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <form
            role="dialog"
            aria-modal="true"
            aria-labelledby="teacher-form-title"
            onSubmit={handleSaveTeacher}
            style={{
              width: "100%",
              maxWidth: 560,
              maxHeight: "90vh",
              overflowY: "auto",
              background: "white",
              borderRadius: 18,
              padding: 24,
              boxSizing: "border-box",
            }}
          >
            <h3 id="teacher-form-title" style={{ marginTop: 0 }}>
              {editingTeacher ? "Edit Data Guru & Tendik" : "Tambah Data Guru & Tendik"}
            </h3>

            <label className="di-form-label" htmlFor="teacher-nip">
              NIP / NUPTK
            </label>
            <input
              id="teacher-nip"
              className="di-search"
              value={teacherForm.nip}
              onChange={(event) =>
                setTeacherForm({ ...teacherForm, nip: event.target.value })
              }
              placeholder="Masukkan NIP atau NUPTK"
              inputMode="numeric"
            />

            <label className="di-form-label" htmlFor="teacher-full-name">
              Nama Lengkap *
            </label>
            <input
              id="teacher-full-name"
              className="di-search"
              value={teacherForm.full_name}
              onChange={(event) =>
                setTeacherForm({ ...teacherForm, full_name: event.target.value })
              }
              required
            />

            <label className="di-form-label" htmlFor="teacher-employment-status">
              Jabatan
            </label>
            <select
              id="teacher-employment-status"
              className="di-search"
              value={teacherForm.employment_status}
              onChange={(event) =>
                setTeacherForm({
                  ...teacherForm,
                  employment_status: event.target.value,
                })
              }
              required
            >
              <option value="">Pilih jabatan</option>
              {teacherForm.employment_status &&
                !teacherPositionOptions.includes(teacherForm.employment_status) && (
                  <option value={teacherForm.employment_status}>
                    Jabatan saat ini: {teacherForm.employment_status}
                  </option>
                )}
              {teacherPositionOptions.map((position) => (
                <option key={position} value={position}>
                  {position}
                </option>
              ))}
            </select>

            {teacherFormError && (
              <p role="alert" style={{ color: "#b91c1c", fontSize: 13 }}>
                {teacherFormError}
              </p>
            )}

            <div className="di-actions" style={{ marginTop: 20 }}>
              <button
                type="button"
                className="di-button"
                onClick={() => {
                  setShowTeacherForm(false);
                  setEditingTeacher(null);
                  setTeacherFormError("");
                }}
                disabled={savingTeacher}
              >
                Batal
              </button>
              <button
                type="submit"
                className="di-button di-button-primary"
                disabled={savingTeacher}
              >
                {savingTeacher ? "Menyimpan..." : "Simpan Data"}
              </button>
            </div>
          </form>
        </div>
      )}

      {showClassForm && canManageDataInduk && (
        <div className="di-modal-backdrop">
          <form
            className="di-bulk-form"
            role="dialog"
            aria-modal="true"
            aria-labelledby="class-form-title"
            onSubmit={(event) => void handleSaveClass(event)}
          >
            <h3 id="class-form-title">{editingClass ? "Edit Data Kelas" : "Tambah Data Kelas"}</h3>
            <div className="di-bulk-fields">
              <label className="di-form-label" htmlFor="class-form-name">Nama Kelas</label>
              <input
                id="class-form-name"
                className="di-search"
                value={classForm.name}
                onChange={(event) => setClassForm((current) => ({ ...current, name: event.target.value }))}
                placeholder="Contoh: X A"
                maxLength={80}
                required
              />
              <label className="di-form-label" htmlFor="class-form-grade">Tingkat</label>
              <select
                id="class-form-grade"
                className="di-search"
                value={classForm.grade_level}
                onChange={(event) => setClassForm((current) => ({ ...current, grade_level: event.target.value }))}
                required
              >
                <option value="10">10</option>
                <option value="11">11</option>
                <option value="12">12</option>
              </select>
              <label className="di-form-label" htmlFor="class-form-year">Tahun Ajaran</label>
              <select
                id="class-form-year"
                className="di-search"
                value={classForm.academic_year_id}
                onChange={(event) => setClassForm((current) => ({ ...current, academic_year_id: event.target.value }))}
                required
              >
                <option value="">Pilih tahun ajaran</option>
                {academicYears.map((year) => (
                  <option key={year.id} value={year.id}>{year.name}{year.is_active ? " · Aktif" : ""}</option>
                ))}
              </select>
              <label className="di-form-label" htmlFor="class-form-homeroom">Wali Kelas</label>
              <select
                id="class-form-homeroom"
                className="di-search"
                value={classForm.homeroom_teacher_id}
                onChange={(event) => setClassForm((current) => ({ ...current, homeroom_teacher_id: event.target.value }))}
              >
                <option value="">Belum ditentukan</option>
                {classTeacherOptions.map((teacher) => (
                  <option key={teacher.id} value={teacher.profile_id ?? ""}>{teacher.full_name}</option>
                ))}
              </select>
            </div>
            {classFormError && <p className="di-bulk-error" role="alert">{classFormError}</p>}
            <div className="di-actions di-bulk-actions">
              <button
                type="button"
                className="di-button"
                onClick={() => { setShowClassForm(false); setClassFormError(""); }}
                disabled={savingClass}
              >
                Batal
              </button>
              <button type="submit" className="di-button di-button-primary" disabled={savingClass}>
                {savingClass ? "Menyimpan..." : "Simpan Kelas"}
              </button>
            </div>
          </form>
        </div>
      )}

      {showAcademicYearManager && canManageDataInduk && (
        <div className="di-modal-backdrop">
          <section
            className="di-bulk-form"
            role="dialog"
            aria-modal="true"
            aria-labelledby="academic-year-title"
          >
            <h3 id="academic-year-title">Kelola Tahun Ajaran</h3>
            <p className="di-bulk-description">Tahun ajaran aktif digunakan sebagai pilihan utama saat membuat kelas.</p>
            <form onSubmit={(event) => void saveAcademicYear(event)}>
              <div className="di-bulk-fields">
                <label className="di-form-label" htmlFor="academic-year-name">Nama Tahun Ajaran</label>
                <input
                  id="academic-year-name"
                  className="di-search"
                  value={academicYearForm.name}
                  onChange={(event) => setAcademicYearForm((current) => ({ ...current, name: event.target.value }))}
                  placeholder="Contoh: 2026/2027"
                  maxLength={40}
                  required
                />
                <label className="di-form-label" htmlFor="academic-year-start">Tanggal Mulai</label>
                <input
                  id="academic-year-start"
                  className="di-search"
                  type="date"
                  value={academicYearForm.start_date}
                  onChange={(event) => setAcademicYearForm((current) => ({ ...current, start_date: event.target.value }))}
                />
                <label className="di-form-label" htmlFor="academic-year-end">Tanggal Berakhir</label>
                <input
                  id="academic-year-end"
                  className="di-search"
                  type="date"
                  value={academicYearForm.end_date}
                  onChange={(event) => setAcademicYearForm((current) => ({ ...current, end_date: event.target.value }))}
                />
              </div>
              <div className="di-actions" style={{ marginTop: 16 }}>
                <button type="submit" className="di-button di-button-primary" disabled={savingAcademicYear}>
                  {savingAcademicYear ? "Menyimpan..." : "Tambah Tahun Ajaran"}
                </button>
              </div>
            </form>
            {academicYearFormError && <p className="di-bulk-error" role="alert">{academicYearFormError}</p>}
            <div className="di-table-wrap" style={{ marginTop: 18 }}>
              <table className="di-table">
                <thead>
                  <tr><th>Tahun Ajaran</th><th>Periode</th><th>Status</th><th>Aksi</th></tr>
                </thead>
                <tbody>
                  {academicYears.map((year) => (
                    <tr key={year.id}>
                      <td>{year.name}</td>
                      <td>{year.start_date ?? "—"} – {year.end_date ?? "—"}</td>
                      <td>{year.is_active ? "Aktif" : "Tidak aktif"}</td>
                      <td>
                        <button
                          type="button"
                          className="di-button"
                          onClick={() => void activateAcademicYear(year)}
                          disabled={year.is_active || activatingAcademicYearId !== null}
                        >
                          {activatingAcademicYearId === year.id ? "Mengaktifkan..." : year.is_active ? "Aktif" : "Jadikan aktif"}
                        </button>
                      </td>
                    </tr>
                  ))}
                  {!academicYears.length && <tr><td colSpan={4}>Belum ada tahun ajaran.</td></tr>}
                </tbody>
              </table>
            </div>
            <div className="di-actions di-bulk-actions">
              <button
                type="button"
                className="di-button"
                onClick={() => { setShowAcademicYearManager(false); setAcademicYearFormError(""); }}
                disabled={savingAcademicYear || activatingAcademicYearId !== null}
              >
                Tutup
              </button>
            </div>
          </section>
        </div>
      )}

      {assignmentTeacher && canManageDataInduk && (
        <div className="di-modal-backdrop">
          <section
            className="di-bulk-form"
            role="dialog"
            aria-modal="true"
            aria-labelledby="teacher-assignment-title"
          >
            <h3 id="teacher-assignment-title">Penugasan Mata Pelajaran &amp; Kelas</h3>
            <p className="di-bulk-description">
              Atur pasangan mata pelajaran dan kelas untuk {assignmentTeacher.full_name}.
              Guru akan melihat pilihan ini saat membuat QR kehadiran mapel.
            </p>

            <form onSubmit={saveTeacherAssignment}>
              <div className="di-bulk-fields">
                <label className="di-form-label" htmlFor="teacher-assignment-subject">
                  Mata pelajaran
                </label>
                <input
                  id="teacher-assignment-subject"
                  className="di-search"
                  list="teacher-subject-suggestions"
                  value={newAssignmentSubject}
                  onChange={(event) => setNewAssignmentSubject(event.target.value)}
                  maxLength={120}
                  required
                  placeholder="Contoh: Matematika Tingkat Lanjut"
                />
                <datalist id="teacher-subject-suggestions">
                  {subjectSuggestions.map((subject) => <option key={subject} value={subject} />)}
                </datalist>
                <label className="di-form-label" htmlFor="teacher-assignment-class">
                  Kelas
                </label>
                <select
                  id="teacher-assignment-class"
                  className="di-search"
                  value={newAssignmentClassId}
                  onChange={(event) => setNewAssignmentClassId(event.target.value)}
                  required
                >
                  <option value="">Pilih kelas</option>
                  {classes.map((classOption) => (
                    <option key={classOption.id} value={classOption.id}>
                      {classOption.name} · Tingkat {classOption.grade_level}
                    </option>
                  ))}
                </select>
              </div>
              {teacherAssignmentError && (
                <p className="di-assignment-error" role="alert">
                  {teacherAssignmentError}
                </p>
              )}
              <div className="di-actions" style={{ marginTop: 16 }}>
                <button
                  type="submit"
                  className="di-button di-button-primary"
                  disabled={
                    teacherAssignmentSaving ||
                    !classes.length ||
                    !newAssignmentSubject.trim() ||
                    !newAssignmentClassId
                  }
                >
                  {teacherAssignmentSaving ? "Menyimpan..." : "Tambah Penugasan"}
                </button>
                <button
                  type="button"
                  className="di-button"
                  onClick={() => setAssignmentTeacher(null)}
                  disabled={teacherAssignmentSaving}
                >
                  Tutup
                </button>
              </div>
            </form>

            <div className="di-assignment-list" aria-live="polite">
              <strong>Daftar penugasan</strong>
              {teacherAssignmentsLoading ? (
                <p>Memuat penugasan...</p>
              ) : teacherAssignments.length ? (
                teacherAssignments.map((assignment) => (
                  <div className="di-assignment-item" key={assignment.id}>
                    <span>
                      <b>{assignment.subject}</b>
                      <small>
                        {classes.find((item) => item.id === assignment.class_id)?.name ??
                          "Kelas tidak ditemukan"}
                      </small>
                    </span>
                    <button
                      type="button"
                      className="di-button di-button-danger"
                      onClick={() => void deleteTeacherAssignment(assignment)}
                    >
                      <Trash2 size={14} />
                      Hapus
                    </button>
                  </div>
                ))
              ) : (
                <p>Belum ada penugasan mapel dan kelas.</p>
              )}
            </div>
          </section>
        </div>
      )}

      {showBulkMove && canManageDataInduk && (
        <div className="di-modal-backdrop">
          <form
            className="di-bulk-form"
            role="dialog"
            aria-modal="true"
            aria-labelledby="bulk-move-title"
            onSubmit={(event) => {
              event.preventDefault();
              void handleBulkMoveStudents();
            }}
          >
            <h3 id="bulk-move-title">Pemindahan Siswa Massal</h3>
            <p className="di-bulk-description">
              Pilih tahun dan kelas asal, tandai siswa, lalu tentukan kelas tujuan.
              Pemindahan diproses sekaligus dan masuk ke riwayat perubahan.
            </p>

            <div className="di-bulk-fields">
              <label className="di-form-label" htmlFor="bulk-source-year">
                Tahun ajaran asal
              </label>
              <select
                id="bulk-source-year"
                className="di-search"
                value={bulkSourceYearId}
                onChange={(event) => {
                  bulkLoadRequestRef.current += 1;
                  setBulkSourceYearId(event.target.value);
                  setBulkSourceClassId("");
                  setBulkStudents([]);
                  setBulkSelectedIds([]);
                  setBulkError("");
                  setBulkLoading(false);
                }}
                required
              >
                <option value="">Pilih tahun ajaran</option>
                {academicYears.map((year) => (
                  <option key={year.id} value={year.id}>
                    {year.name}{year.is_active ? " · Aktif" : ""}
                  </option>
                ))}
              </select>

              <label className="di-form-label" htmlFor="bulk-source-class">
                Kelas asal
              </label>
              <select
                id="bulk-source-class"
                className="di-search"
                value={bulkSourceClassId}
                onChange={(event) => {
                  if (event.target.value === bulkDestinationClassId) {
                    setBulkDestinationClassId("");
                  }
                  setBulkMoveMode("move");
                  void loadBulkStudents(event.target.value);
                }}
                disabled={!bulkSourceYearId}
                required
              >
                <option value="">Pilih kelas asal</option>
                {classRows
                  .filter((row) => row.academic_year_id === bulkSourceYearId)
                  .map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.name} · Tingkat {row.grade_level}
                    </option>
                  ))}
              </select>

              <span className="di-form-label">Mode proses</span>
              <div className="di-actions" style={{ gridColumn: "1 / -1" }}>
                  <label>
                    <input
                      type="radio"
                      name="bulk-move-mode"
                      checked={bulkMoveMode === "move"}
                      onChange={() => {
                        setBulkMoveMode("move");
                        setBulkSelectedIds(bulkStudents.map((student) => student.id));
                      }}
                    />
                    Pindahkan ke kelas
                  </label>
                  {classRows.find((row) => row.id === bulkSourceClassId)?.grade_level === 12 && (
                    <label>
                      <input
                        type="radio"
                        name="bulk-move-mode"
                        checked={bulkMoveMode === "graduate"}
                        onChange={() => {
                          setBulkMoveMode("graduate");
                          setBulkSelectedIds(bulkStudents.filter((student) => student.status === "Active").map((student) => student.id));
                        }}
                      />
                      Luluskan siswa (status: Graduated)
                    </label>
                  )}
              </div>
              {bulkMoveMode === "move" && (
                  <>
                    <label className="di-form-label" htmlFor="bulk-destination-class">Kelas tujuan</label>
                    <select
                      id="bulk-destination-class"
                      className="di-search"
                      value={bulkDestinationClassId}
                      onChange={(event) => setBulkDestinationClassId(event.target.value)}
                      required
                    >
                      <option value="">Pilih kelas tujuan</option>
                      {classRows
                        .filter((row) => row.id !== bulkSourceClassId)
                        .map((row) => (
                          <option key={row.id} value={row.id}>
                            {row.name} · {row.academic_year_name}
                          </option>
                        ))}
                    </select>
                  </>
              )}
            </div>

            <div className="di-bulk-students">
              <div className="di-bulk-students-head">
                  <strong>{bulkMoveMode === "graduate" ? "Siswa yang diluluskan" : "Siswa yang dipindahkan"}</strong>
                <label>
                  <input
                    type="checkbox"
                      checked={visibleBulkStudents.length > 0 && visibleBulkStudents.every((student) => bulkSelectedIds.includes(student.id))}
                    onChange={(event) => setBulkSelectedIds(
                        event.target.checked ? visibleBulkStudents.map((student) => student.id) : []
                    )}
                      disabled={bulkLoading || visibleBulkStudents.length === 0}
                  />
                    Pilih semua ({visibleBulkStudents.filter((student) => bulkSelectedIds.includes(student.id)).length}/{visibleBulkStudents.length})
                </label>
              </div>
              <div className="di-bulk-students-list">
                {bulkLoading ? (
                  <p className="di-bulk-empty">Memuat daftar siswa...</p>
                  ) : visibleBulkStudents.length ? (
                    visibleBulkStudents.map((student) => (
                    <label className="di-bulk-student" key={student.id}>
                      <input
                        type="checkbox"
                        checked={bulkSelectedIds.includes(student.id)}
                        onChange={(event) => setBulkSelectedIds((current) =>
                          event.target.checked
                            ? [...current, student.id]
                            : current.filter((id) => id !== student.id)
                        )}
                      />
                      <span>
                        <strong>{student.full_name}</strong>
                        <small>{student.nisn} · {student.status}</small>
                      </span>
                    </label>
                  ))
                ) : (
                  <p className="di-bulk-empty">
                    {bulkSourceClassId
                      ? bulkMoveMode === "graduate"
                        ? "Tidak ada siswa Active yang dapat diluluskan."
                        : "Tidak ada siswa yang dapat dipindahkan pada kelas ini."
                      : "Pilih kelas asal untuk memuat daftar siswa."}
                  </p>
                )}
              </div>
            </div>

            {bulkError && <p className="di-bulk-error" role="alert">{bulkError}</p>}

            <div className="di-actions di-bulk-actions">
              <button
                type="button"
                className="di-button"
                onClick={closeBulkMove}
                disabled={bulkSaving}
              >
                Batal
              </button>
              <button
                type="submit"
                className="di-button di-button-primary"
                disabled={bulkSaving || bulkLoading || !visibleBulkStudents.some((student) => bulkSelectedIds.includes(student.id)) || (bulkMoveMode === "move" && !bulkDestinationClassId)}
              >
                {bulkSaving
                  ? bulkMoveMode === "graduate" ? "Meluluskan..." : "Memindahkan..."
                  : bulkMoveMode === "graduate"
                    ? `Luluskan ${visibleBulkStudents.filter((student) => bulkSelectedIds.includes(student.id)).length} Siswa`
                    : `Pindahkan ${visibleBulkStudents.filter((student) => bulkSelectedIds.includes(student.id)).length} Siswa`}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="di-menu-grid">
        {menuItems
          .filter((item) => canManageDataInduk || item.id !== "riwayat")
          .map((item) => {
          const Icon = item.icon;

          return (
            <button
              key={item.id}
              type="button"
              className={`di-menu-card ${activeMenu === item.id ? "di-selected" : ""}`}
              onClick={() => {
                setActiveMenu(item.id);
                setSearch("");
                if (item.id === "guru") {
                  setTeacherAccounts(null);
                  setTeacherAccountError("");
                }
              }}
            >
              <div className="di-icon">
                <Icon size={22} />
              </div>
              <strong>{item.title}</strong>
              <p>{item.description}</p>
            </button>
          );
        })}
      </div>

      <section className="di-content">
        <div className="di-content-head">
          <div>
            <h3>{activeItem?.title}</h3>
            <p>
              {activeMenu === "siswa"
                ? "Data identitas dan status peserta didik."
                : activeMenu === "guru"
                ? "Data guru dan tenaga kependidikan."
                : activeMenu === "kelas"
                ? "Data rombongan belajar dan tahun ajaran."
                : activeMenu === "riwayat"
                ? "Audit perubahan siswa, guru/tendik, dan kelas. Menampilkan 200 catatan terbaru."
                : activeMenu === "sekolah"
                ? "Kelola profil satuan pendidikan, kalender non-KBM, dan pantau koneksi Data Induk dengan Akademik serta Inventaris."
                : "Impor data siswa atau guru/tendik dari Excel dan ekspor data sesuai kategori yang dipilih."}
            </p>
          </div>

          {["siswa", "guru", "kelas"].includes(activeMenu) && (
            <div className="di-actions">
              <button
                type="button"
                className="di-button"
                onClick={() => void handleExportMaster()}
              >
                <Download size={15} />
                Ekspor Excel
              </button>
              {activeMenu === "kelas" && canManageDataInduk && (
                <>
                  <button
                    type="button"
                    className="di-button"
                    onClick={() => { setAcademicYearFormError(""); setShowAcademicYearManager(true); }}
                    disabled={classLoading}
                  >
                    <School size={15} />
                    Tahun Ajaran
                  </button>
                  <button
                    type="button"
                    className="di-button"
                    onClick={openBulkMove}
                    disabled={classLoading || !academicYears.length || !classRows.length}
                  >
                    <GraduationCap size={15} />
                    Pemindahan Massal
                  </button>
                </>
              )}

              {activeMenu === "siswa" && userRole === "super_admin" && (
                <button
                  type="button"
                  className="di-button"
                  onClick={() => void generateStudentAccountsBulk()}
                  disabled={
                    loadingStudents ||
                    studentAccounts === null ||
                    Boolean(studentAccountError) ||
                    eligibleStudentAccountCount === 0 ||
                    bulkAccountProgress !== null
                  }
                >
                  <UserRoundPlus size={15} />
                  {bulkAccountProgress
                    ? `Memproses ${bulkAccountProgress.completed}/${bulkAccountProgress.total}`
                    : `Generate Akun Massal${eligibleStudentAccountCount ? ` (${eligibleStudentAccountCount})` : ""}`}
                </button>
              )}

              <button
                type="button"
                className="di-button di-button-primary"
                onClick={() => {
                  if (activeMenu === "guru") {
                    setEditingTeacher(null);
                    setTeacherForm(emptyTeacherForm);
                    setTeacherFormError("");
                    setMasterNotice("");
                    setShowTeacherForm(true);
                    return;
                  }
                  if (activeMenu === "kelas") {
                    void handleAddClass();
                    return;
                  }
                  setEditingStudent(null);
                  setStudentForm(emptyStudentForm);
                  setStudentFormError("");
                  setShowStudentForm(true);
                }}
              >
                <Plus size={16} />
                Tambah Data
              </button>
            </div>
          )}
        </div>

        {masterNotice && activeMenu !== "excel" && activeMenu !== "riwayat" && <div className="di-notice">{masterNotice}</div>}
        {activeMenu === "siswa" && userRole === "super_admin" && studentAccountError && (
          <div className="di-notice di-audit-error" role="alert">{studentAccountError}</div>
        )}
        {activeMenu === "guru" && teacherAccountError && (
          <div className="di-notice">
            Status akun belum dapat diverifikasi: {teacherAccountError}
          </div>
        )}
        {activeMenu === "guru" && teacherSummaryError && (
          <div className="di-notice di-audit-error" role="alert">{teacherSummaryError}</div>
        )}
        {activeMenu === "sekolah" ? (
          <DataIndukSekolahPanel userRole={userRole} />
        ) : activeMenu === "riwayat" ? (
          <div className="di-audit-panel">
            <div className="di-audit-toolbar">
              <div className="di-search-wrap">
                <Search size={17} />
                <input
                  className="di-search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Cari nama, ID, jenis perubahan..."
                  aria-label="Cari riwayat perubahan"
                />
              </div>
              <button
                type="button"
                className="di-button"
                onClick={() => setAuditReloadVersion((version) => version + 1)}
                disabled={auditLoading}
              >
                <History size={15} />
                {auditLoading ? "Memuat..." : "Muat ulang"}
              </button>
            </div>

            {auditError && <div className="di-notice di-audit-error" role="alert">{auditError}</div>}

            <div className="di-table-wrap">
              <table className="di-table">
                <thead>
                  <tr>
                    <th>Waktu (WITA)</th>
                    <th>Pengguna</th>
                    <th>Data</th>
                    <th>Perubahan</th>
                    <th>Rincian</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLoading ? (
                    <tr><td colSpan={5}><div className="di-empty">Memuat riwayat perubahan...</div></td></tr>
                  ) : filteredAuditEntries.length ? (
                    filteredAuditEntries.map((entry) => {
                      const record = entry.new_data ?? entry.old_data ?? {};
                      const entityName = entry.table_name === "students"
                        ? "Siswa"
                        : entry.table_name === "teachers"
                          ? "Guru / Tendik"
                          : "Kelas";
                      const recordTitle = String(
                        record.full_name ?? record.name ?? record.nisn ?? record.nip ?? entry.record_id
                      );
                      const operationLabel = entry.operation === "INSERT"
                        ? "Ditambahkan"
                        : entry.operation === "UPDATE"
                          ? "Diubah"
                          : "Dihapus";
                      const operationClass = entry.operation.toLowerCase();
                      return (
                        <tr key={entry.id}>
                          <td>{new Date(entry.changed_at).toLocaleString("id-ID", {
                            timeZone: "Asia/Makassar",
                            dateStyle: "medium",
                            timeStyle: "short",
                          })}</td>
                          <td>{entry.actor_name || (entry.actor_id ? `Akun ${entry.actor_id.slice(0, 8)}` : "Sistem")}</td>
                          <td>
                            <strong>{recordTitle}</strong>
                            <small>{entityName} · ID {entry.record_id.slice(0, 8)}</small>
                          </td>
                          <td><span className={`di-audit-action is-${operationClass}`}>{operationLabel}</span></td>
                          <td>
                            <details className="di-audit-details">
                              <summary>{entry.changed_fields.length} kolom</summary>
                              <ul>
                                {entry.changed_fields.map((field) => (
                                  <li key={field}>
                                    <strong>{auditFieldLabels[field] ?? field}</strong>
                                    <span>{formatAuditValue(entry.old_data?.[field])}</span>
                                    <span aria-hidden="true">→</span>
                                    <span>{formatAuditValue(entry.new_data?.[field])}</span>
                                  </li>
                                ))}
                              </ul>
                            </details>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={5}>
                        <div className="di-empty">
                          <div className="di-empty-icon"><History size={24} /></div>
                          <strong>{auditError ? "Riwayat belum dapat ditampilkan" : "Belum ada riwayat perubahan"}</strong>
                          <p>
                            {auditError
                              ? "Periksa apakah migrasi riwayat perubahan sudah diterapkan."
                              : "Perubahan data siswa, guru/tendik, dan kelas akan tercatat di sini."}
                          </p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <p className="di-hint">Daftar menampilkan maksimal 200 perubahan terbaru. Detail hanya dapat diakses operator dan admin Super App.</p>
          </div>
        ) : activeMenu === "excel" ? (
  <div style={{ padding: 22 }}>
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 12,
        flexWrap: "wrap",
        marginBottom: 20,
      }}
    >
      <div>
        <h3 style={{ margin: 0 }}>Impor Data Siswa</h3>
        <p style={{ color: "#64748b", fontSize: 13 }}>
          Unggah file Excel, periksa validasi data, lalu impor ke Data Induk.
        </p>
      </div>

      <button
        type="button"
        className="di-button"
        onClick={handleDownloadStudentTemplate}
      >
        <FileSpreadsheet size={17} />
        Unduh Template Excel
      </button>
    </div>

    <label
      htmlFor="excel-student-upload"
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 12,
        padding: 30,
        border: "2px dashed #93c5fd",
        borderRadius: 16,
        background: "#f8fbff",
        cursor: importing ? "wait" : "pointer",
        textAlign: "center",
      }}
    >
      <FileSpreadsheet size={34} color="#2563eb" />
      <strong>Pilih file Excel siswa</strong>
      <span style={{ color: "#64748b", fontSize: 13 }}>
        Format .xlsx atau .xls
      </span>
      <span className="di-button di-button-primary">
        <Upload size={16} />
        {importing ? "Sedang membaca..." : "Pilih File Excel"}
      </span>
    </label>

    <input
      id="excel-student-upload"
      type="file"
      accept=".xlsx,.xls"
      onChange={handleExcelUpload}
      disabled={importing}
      style={{ display: "none" }}
    />

    {importFileName && (
      <p style={{ marginTop: 18 }}>
        File dipilih: <strong>{importFileName}</strong>
      </p>
    )}

    {importError && (
      <p style={{ color: "#b91c1c" }}>{importError}</p>
    )}

    {importRows.length > 0 && (
      <>
        <div
          style={{
            margin: "20px 0",
            padding: 16,
            borderRadius: 12,
            background: "#eff6ff",
          }}
        >
          <div className="di-import-summary">
            <strong>{importRows.length} baris terbaca</strong>
            <div>
              <span><CheckCircle2 size={15}/>{importRows.filter((row) => row.errors.length === 0).length} valid</span>
              <span><XCircle size={15}/>{importRows.filter((row) => row.errors.length > 0).length} perlu diperbaiki</span>
            </div>
            <button type="button" className="di-button" onClick={handleDownloadImportReport}>
              <Download size={15}/>
              Unduh Laporan Validasi
            </button>
          </div>
        </div>

        <div className="di-table-wrap">
          <table className="di-table">
            <thead>
              <tr>
                <th>Baris</th>
                <th>NISN</th>
                <th>Nama Siswa</th>
                <th>Kelas</th>
                <th>Tanggal Lahir</th>
                <th>Jenis Kelamin</th>
                <th>Validasi</th>
              </tr>
            </thead>
            <tbody>
              {importRows.map((row, index) => (
                <tr key={`${row.nisn}-${row.source_row}-${index}`}>
                  <td>{row.source_row}</td>
                  <td>{row.nisn}</td>
                  <td>{row.full_name}</td>
                  <td>{row.class_name}</td>
                  <td>{row.birth_date || "—"}</td>
                  <td>{row.gender || "—"}</td>
                  <td>
                    {row.errors.length === 0 ? (
                      <span style={{ color: "#15803d" }}>
                        Valid
                      </span>
                    ) : (
                      <span style={{ color: "#b91c1c" }}>
                        {row.errors.join(", ")}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>


<div style={{ display: "flex", gap: 12, marginTop: 20 }}>
  <button
    type="button"
    className="di-button di-button-primary"
    onClick={handleImportStudents}
    disabled={
      importing ||
        !importValidationComplete ||
      importRows.length === 0 ||
      importRows.every((row) => row.errors.length > 0)
    }
  >
    <Upload size={16} />
    {importing ? "Sedang menyimpan..." : "Impor ke Data Siswa"}
  </button>
</div>

        <p style={{ color: "#64748b", fontSize: 13 }}>
          Periksa data pada tabel sebelum melanjutkan proses impor.
        </p>
      </>
    )}
    {canManageDataInduk && (
      <section style={{ marginTop: 32, paddingTop: 24, borderTop: "1px solid #e2e8f0" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
            marginBottom: 16,
          }}
        >
          <div>
            <h3 style={{ margin: 0 }}>Impor Data Guru &amp; Tendik</h3>
            <p style={{ color: "#64748b", fontSize: 13 }}>
              Unduh template berisi NIP, Nama Lengkap, dan Jabatan. NIP duplikat akan ditolak.
            </p>
          </div>
          <button type="button" className="di-button" onClick={handleDownloadTeacherTemplate}>
            <FileSpreadsheet size={17} />
            Unduh Template Guru/Tendik
          </button>
        </div>

        <label
          htmlFor="excel-teacher-upload"
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 12,
            padding: 26,
            border: "2px dashed #93c5fd",
            borderRadius: 16,
            background: "#f8fbff",
            cursor: importing ? "wait" : "pointer",
            textAlign: "center",
          }}
        >
          <FileSpreadsheet size={32} color="#2563eb" />
          <strong>Pilih file Excel guru/tendik</strong>
          <span style={{ color: "#64748b", fontSize: 13 }}>Format .xlsx atau .xls</span>
          <span className="di-button di-button-primary">
            <Upload size={16} />
            {importing ? "Sedang membaca..." : "Pilih File Excel"}
          </span>
        </label>
        <input
          id="excel-teacher-upload"
          type="file"
          accept=".xlsx,.xls"
          onChange={handleTeacherExcelUpload}
          disabled={importing}
          style={{ display: "none" }}
        />
        {teacherImportFileName && <p style={{ marginTop: 14 }}>File dipilih: <strong>{teacherImportFileName}</strong></p>}
        {teacherImportError && <p className="di-bulk-error" role="alert">{teacherImportError}</p>}
        {teacherImportNotice && <div className="di-notice" role="status">{teacherImportNotice}</div>}
        {teacherImportRows.length > 0 && (
          <>
            <div className="di-notice" style={{ marginTop: 16 }}>
              {teacherImportRows.length} baris terbaca · {teacherImportRows.filter((row) => row.errors.length === 0).length} valid · {teacherImportRows.filter((row) => row.errors.length > 0).length} perlu diperbaiki
            </div>
            <div className="di-table-wrap">
              <table className="di-table">
                <thead>
                  <tr><th>Baris</th><th>NIP</th><th>Nama Lengkap</th><th>Jabatan</th><th>Validasi</th></tr>
                </thead>
                <tbody>
                  {teacherImportRows.map((row, index) => (
                    <tr key={`${row.nip}-${row.source_row}-${index}`}>
                      <td>{row.source_row}</td>
                      <td>{row.nip}</td>
                      <td>{row.full_name}</td>
                      <td>{row.employment_status}</td>
                      <td>{row.errors.length ? <span style={{ color: "#b91c1c" }}>{row.errors.join(", ")}</span> : <span style={{ color: "#15803d" }}>Valid</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="di-actions" style={{ marginTop: 18 }}>
              <button
                type="button"
                className="di-button di-button-primary"
                onClick={() => void handleImportTeachers()}
                disabled={importing || !teacherImportValidationComplete || teacherImportRows.every((row) => row.errors.length > 0)}
              >
                <Upload size={16} />
                {importing ? "Sedang menyimpan..." : "Impor Guru/Tendik"}
              </button>
            </div>
          </>
        )}
      </section>
    )}
  </div>
) : (
  <>
            <div style={{ padding: "20px 22px 0" }}>
              <div className="di-actions" style={{ alignItems: "center", marginBottom: 10 }}>
                <div className="di-search-wrap">
                  <Search size={17} />
                  <input
                    className="di-search"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder={`Cari ${activeMenu === "siswa"
                      ? "nama atau NISN siswa"
                      : activeMenu === "guru"
                      ? "nama atau NIP guru"
                      : "nama kelas"}...`}
                    aria-label="Cari data"
                  />
                </div>
                {activeMenu === "siswa" && (
                  <>
                    <select
                      className="di-search"
                      value={studentClassFilter}
                      onChange={(event) => setStudentClassFilter(event.target.value)}
                      aria-label="Filter kelas siswa"
                      style={{ width: "auto", minWidth: 150 }}
                    >
                      <option value="all">Semua Kelas</option>
                      <option value="unassigned">Belum Punya Kelas</option>
                      {classes.map((classOption) => (
                        <option key={classOption.id} value={classOption.id}>{classOption.name}</option>
                      ))}
                    </select>
                    <select
                      className="di-search"
                      value={studentStatusFilter}
                      onChange={(event) => setStudentStatusFilter(event.target.value)}
                      aria-label="Filter status siswa"
                      style={{ width: "auto", minWidth: 130 }}
                    >
                      <option value="all">Semua Status</option>
                      <option value="Active">Active</option>
                      <option value="Inactive">Inactive</option>
                      <option value="Graduated">Graduated</option>
                    </select>
                    {userRole === "super_admin" && (
                      <select
                        className="di-search"
                        value={studentAccountFilter}
                        onChange={(event) => setStudentAccountFilter(event.target.value)}
                        aria-label="Filter status akun siswa"
                        style={{ width: "auto", minWidth: 150 }}
                        disabled={studentAccounts === null}
                      >
                        <option value="all">Semua</option>
                        <option value="linked">Sudah Ada Akun</option>
                        <option value="unlinked">Belum Ada Akun</option>
                      </select>
                    )}
                  </>
                )}
                {activeMenu === "guru" && (
                  <>
                    <select
                      className="di-search"
                      value={teacherFilterPosition}
                      onChange={(event) => setTeacherFilterPosition(event.target.value)}
                      aria-label="Filter jabatan guru"
                      style={{ width: "auto", minWidth: 170 }}
                    >
                      <option value="all">Semua Jabatan</option>
                      {[...new Set([
                        ...teacherPositionOptions,
                        ...teachers.map((teacher) => teacher.employment_status ?? "").filter(Boolean),
                      ])].map((position) => <option key={position} value={position}>{position}</option>)}
                    </select>
                    <select
                      className="di-search"
                      value={teacherFilterStatus}
                      onChange={(event) => setTeacherFilterStatus(event.target.value)}
                      aria-label="Filter penugasan atau akun guru"
                      style={{ width: "auto", minWidth: 170 }}
                      disabled={userRole === "super_admin" && teacherAccounts === null}
                    >
                      <option value="all">Semua Status</option>
                      <option value="no-subject">Belum punya mapel</option>
                      {userRole === "super_admin" && <option value="no-account">Belum punya akun</option>}
                    </select>
                  </>
                )}
              </div>
              {bulkAccountProgress && activeMenu === "siswa" && (
                <div className="di-notice" role="status">
                  Membuat akun: {bulkAccountProgress.completed} dari {bulkAccountProgress.total}
                  {" · "}{bulkAccountProgress.succeeded} berhasil
                  {bulkAccountProgress.failed.length ? ` · ${bulkAccountProgress.failed.length} gagal` : ""}
                </div>
              )}
            </div>

            <div className="di-table-wrap">
              <table className="di-table">
                <thead>
                  <tr>
                    {activeMenu === "siswa" ? (
                      <>
                        <th>NISN</th>
                        <th>Nama Siswa</th>
                        <th>Kelas</th>
                        <th>Tanggal Lahir</th>
                        <th>Jenis Kelamin</th>
                        <th>Status</th>
                        {userRole === "super_admin" && <th>Status Akun</th>}
                        <th>Aksi</th>
                      </>
                    ) : activeMenu === "guru" ? (
                      <>
                        <th>NIP / Identitas</th>
                        <th>Nama</th>
                        <th>Status Akun</th>
                        <th>Jabatan</th>
                        <th>Penugasan &amp; Wali Kelas</th>
                        <th>Aksi</th>
                      </>
                    ) : (
                      <>
                        <th>Nama Kelas</th>
                        <th>Tingkat</th>
                        <th>Tahun Ajaran</th>
                        <th>Wali Kelas</th>
                        <th>Jumlah Siswa</th>
                        <th>Aksi</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {activeMenu === "siswa" ? (
                    loadingStudents ? (
                      <tr>
                        <td colSpan={userRole === "super_admin" ? 8 : 7}>
                          <div className="di-empty">
                            Memuat data siswa dari Supabase...
                          </div>
                        </td>
                      </tr>
                    ) : studentError ? (
                      <tr>
                        <td colSpan={userRole === "super_admin" ? 8 : 7}>
                          <div className="di-empty">
                            <strong>Data siswa gagal dimuat</strong>
                            <p>{studentError}</p>
                          </div>
                        </td>
                      </tr>
                    ) : filteredStudents.length === 0 ? (
                      <tr>
                        <td colSpan={userRole === "super_admin" ? 8 : 7}>
                          <div className="di-empty">
                            <div className="di-empty-icon">
                              <GraduationCap size={24} />
                            </div>
                            <strong>{search ? "Siswa tidak ditemukan" : "Belum ada data siswa"}</strong>
                            <p>
                              {search
                                ? "Coba gunakan kata kunci lain."
                                : "Belum ada data siswa yang dapat ditampilkan dari database."}
                            </p>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      filteredStudents.map((student) => (
                        <tr key={student.id}>
                          <td>{student.nisn}</td>
                          <td title={student.profile_id ? "Akun siswa terhubung ke Data Induk" : "Akun siswa belum tertaut"}>
                            {student.full_name}
                          </td>
                          <td>{student.class?.name ?? "Belum ditentukan"}</td>
                          <td>{student.birth_date ?? "—"}</td>
                          <td>{student.gender ?? "—"}</td>
                          <td>{student.status}</td>
                          {userRole === "super_admin" && (
                            <td>
                              <span>{getStudentAccountStatus(student)}</span>
                              {getStudentAccountStatus(student) === "Belum Ada Akun"
                                && student.status === "Active"
                                && /^\d{10}$/.test(student.nisn.trim())
                                && student.full_name.trim().length >= 2
                                && student.full_name.trim().length <= 150 && (
                                  <div className="di-actions">
                                    <button
                                      type="button"
                                      className="di-button"
                                      onClick={() => void createStudentAccount(student)}
                                      disabled={creatingStudentAccountId !== null}
                                    >
                                      <UserRoundPlus size={14} />
                                      {creatingStudentAccountId === student.id ? "Membuat..." : "Generate Akun"}
                                    </button>
                                  </div>
                                )}
                            </td>
                          )}
                          <td>
  <button
    type="button"
    className="di-button di-button-icon"
    aria-label={`Edit data ${student.full_name}`}
    title={`Edit ${student.full_name}`}
    onClick={() => {
      setEditingStudent(student);
      setStudentForm({
        nisn: student.nisn ?? "",
        full_name: student.full_name ?? "",
        class_id: student.class_id ?? "",
        birth_date: student.birth_date ?? "",
        gender: student.gender ?? "",
        parent_phone: student.parent_phone ?? "",
        status: student.status === "Inactive" || student.status === "Graduated"
          ? student.status
          : "Active",
      });
      setStudentFormError("");
      setStudentNotice("");
      setShowStudentForm(true);
    }}
  >
    <Pencil size={15} />
  </button>
</td>
                        </tr>
                      ))
                    )
                  ) : activeMenu === "guru" ? (
                    teacherLoading ? <tr><td colSpan={6}><div className="di-empty">Memuat data guru &amp; tendik...</div></td></tr>
                    : masterError ? <tr><td colSpan={6}><div className="di-empty"><strong>Gagal memuat data</strong><p>{masterError}</p></div></td></tr>
                    : filteredTeachers.length === 0 ? <tr><td colSpan={6}><div className="di-empty"><strong>Data guru/tendik tidak ditemukan</strong><p>Ubah kata kunci atau filter, atau tambahkan data menggunakan tombol Tambah Data.</p></div></td></tr>
                    : filteredTeachers.map((teacher) => {
                      const assignments = teacherAssignmentSummary.filter((item) => item.teacher_id === teacher.id);
                      const subjects = [...new Set(assignments.map((item) => item.subject))];
                      const assignedClassCount = new Set(assignments.map((item) => item.class_id)).size;
                      const homeroomClasses = teacherHomeroomSummary
                        .filter((item) => item.homeroom_teacher_id === teacher.profile_id)
                        .map((item) => item.name);
                      const account = getTeacherManagedAccount(teacher);
                      const canGenerateAccount = userRole === "super_admin"
                        && !teacher.profile_id
                        && /^\d{6,}$/.test(teacher.nip?.trim() ?? "")
                        && account?.role !== "siswa";
                      return (
                        <tr key={teacher.id}>
                          <td>{teacher.nip || "—"}</td>
                          <td>{teacher.full_name}</td>
                          <td>{getTeacherAccountStatus(teacher)}</td>
                          <td>{teacher.employment_status || "—"}</td>
                          <td>
                            {teacherSummaryError
                              ? "Ringkasan penugasan tidak tersedia"
                              : teacher.employment_status === "Guru Mata Pelajaran"
                              ? subjects.length
                                ? `${subjects.slice(0, 3).join(", ")}${subjects.length > 3 ? ` +${subjects.length - 3}` : ""} · ${assignedClassCount} kelas`
                                : "Belum ditugaskan"
                              : subjects.length
                                ? `${subjects.join(", ")} · ${assignedClassCount} kelas`
                                : "—"}
                            {homeroomClasses.map((className) => (
                              <div key={className}>Wali Kelas {className}</div>
                            ))}
                          </td>
                          <td>
                            <div className="di-actions">
                              {canManageDataInduk && (
                                <button type="button" className="di-button" onClick={() => openTeacherAssignments(teacher)}>
                                  <GraduationCap size={14} />Mapel &amp; Kelas
                                </button>
                              )}
                              {canGenerateAccount && (
                                <button
                                  type="button"
                                  className="di-button"
                                  onClick={() => void createOrLinkTeacherAccount(teacher)}
                                  disabled={creatingTeacherAccountId !== null}
                                >
                                  <UserRoundPlus size={14} />
                                  {creatingTeacherAccountId === teacher.id
                                    ? "Memproses..."
                                    : account ? "Tautkan Akun" : "Generate Akun"}
                                </button>
                              )}
                              <button type="button" className="di-button di-button-icon" aria-label={`Edit data ${teacher.full_name}`} title={`Edit ${teacher.full_name}`} onClick={() => void handleEditTeacher(teacher)}>
                                <Pencil size={15} />
                              </button>
                              <button type="button" className="di-button di-button-danger" onClick={() => void handleDeleteTeacher(teacher)}>
                                <Trash2 size={14} />Hapus
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    classLoading ? <tr><td colSpan={6}><div className="di-empty">Memuat data kelas...</div></td></tr>
                    : masterError ? <tr><td colSpan={6}><div className="di-empty"><strong>Gagal memuat data</strong><p>{masterError}</p></div></td></tr>
                    : classRows.filter(c => `${c.name} ${c.academic_year_name} ${c.homeroom_teacher_name}`.toLowerCase().includes(search.toLowerCase())).length === 0 ? <tr><td colSpan={6}><div className="di-empty"><strong>Belum ada data kelas</strong><p>Pastikan tahun ajaran sudah dibuat, lalu tambahkan kelas.</p></div></td></tr>
                    : classRows.filter(c => `${c.name} ${c.academic_year_name} ${c.homeroom_teacher_name}`.toLowerCase().includes(search.toLowerCase())).map(c => <tr key={c.id}><td>{c.name}</td><td>{c.grade_level}</td><td>{c.academic_year_name}</td><td>{c.homeroom_teacher_name}</td><td>{c.student_count}</td><td><div className="di-actions"><button type="button" className="di-button di-button-icon" aria-label={`Edit kelas ${c.name}`} title={`Edit ${c.name}`} onClick={() => void handleEditClass(c)}><Pencil size={15} /></button><button type="button" className="di-button di-button-danger" onClick={() => void handleDeleteClass(c)}><Trash2 size={14} />Hapus</button></div></td></tr>)
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
