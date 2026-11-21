import { supabase } from "./lib/supabase";
import {
  createManagedUser,
  deleteMasterRecords,
  getManagedUsers,
  syncStudentManagedAccount,
  syncStudentManagedAccounts,
  syncTeacherManagedAccount,
  type ManagedUser,
} from "./lib/manageUsers";
import { logAppActivity } from "./services/activityLogService";
import { normalizeSubjectName, subjectSuggestions } from "./services/subjectCatalog";
import DataIndukSekolahPanel from "./DataIndukSekolahPanel";
import "./DataInduk.css";
import { useCallback, useEffect, useRef, useState } from "react";
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
  staff_category: "Guru" | "Tenaga Kependidikan";
  primary_role: string;
  additional_roles: string[];
  homeroom_class_name: string;
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

type Teacher = {
  id: string;
  profile_id: string | null;
  nip: string | null;
  full_name: string;
  employment_status: string | null;
  staff_category: string | null;
  primary_role: string | null;
  additional_roles: string[];
  bk_class_ids: string[];
  homeroom_class_id?: string | null;
};
type TeacherSubjectAssignment = { id: string; teacher_id: string; class_id: string; subject: string };
type TeacherAssignmentSummary = Pick<TeacherSubjectAssignment, "teacher_id" | "class_id" | "subject">;
type TeacherFormAssignment = Pick<TeacherSubjectAssignment, "class_id" | "subject">;
type TeacherHomeroomSummary = { id: string; name: string; homeroom_teacher_id: string | null };
type AcademicYear = { id: string; name: string; is_active: boolean; start_date: string | null; end_date: string | null };
type ClassRow = { id: string; name: string; grade_level: number; academic_year_id: string; homeroom_teacher_id: string | null; homeroom_teacher_record_id?: string | null; academic_year_name: string; homeroom_teacher_name: string; student_count: number };
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

const DATA_INDUK_QUERY_TIMEOUT_MS = 20_000;

function createDataIndukRequest() {
  const controller = new AbortController();
  let timedOut = false;
  const timeoutId = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, DATA_INDUK_QUERY_TIMEOUT_MS);
  return {
    signal: controller.signal,
    cancel: () => controller.abort(),
    timedOut: () => timedOut,
    dispose: () => window.clearTimeout(timeoutId),
  };
}

function dataLoadError(error: unknown, operation: string, timedOut = false) {
  return timedOut
    ? `${operation} melewati batas waktu ${DATA_INDUK_QUERY_TIMEOUT_MS / 1000} detik. Periksa koneksi Supabase lalu coba lagi.`
    : `${operation}: ${formatSupabaseError(error)}`;
}

function teacherOwnsHomeroomAssignment(
  teacher: Pick<Teacher, "id" | "profile_id">,
  homeroomTeacherId: string | null,
) {
  return Boolean(homeroomTeacherId) && (
    homeroomTeacherId === teacher.id ||
    (Boolean(teacher.profile_id) && homeroomTeacherId === teacher.profile_id)
  );
}

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
  staff_category: "Guru" | "Tenaga Kependidikan";
  primary_role: string;
  additional_roles: string[];
  homeroom_class_id: string;
  bk_class_ids: string[];
  subject_assignments: TeacherFormAssignment[];
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
  staff_category: "Guru",
  primary_role: "Guru Mata Pelajaran",
  additional_roles: [],
  homeroom_class_id: "",
  bk_class_ids: [],
  subject_assignments: [],
};

const teacherPositionOptions = [
  "Guru Mata Pelajaran",
  "Guru BK",
  "Kepala Sekolah",
  "Kepala Tata Usaha",
  "Staff Tata Usaha",
  "Bendahara Pengeluaran",
  "Operator Sekolah",
  "Tendik Lainnya",
];

const teacherAdditionalRoleOptions = [
  "Wakasek Kurikulum",
  "Wakasek Kesiswaan",
  "Wakasek Sarana dan Prasarana",
  "Wakasek Humas",
  "Kepala Perpustakaan",
];

const normalizeClassName = (value: string) => {
  const normalized = value.trim().replace(/\s+/g, " ");
  const match = normalized.match(/^(10|11|12|XII|XI|X)\s*(.*)$/i);
  if (!match) return normalized.toLocaleUpperCase("id-ID");
  const grade = { "10": "X", "11": "XI", "12": "XII" }[match[1]] ?? match[1].toUpperCase();
  return `${grade}${match[2] ? ` ${match[2].trim().toUpperCase()}` : ""}`;
};

const excelIdentifier = (value: unknown, padTo?: number) => {
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || value < 0) {
      return { value: "", error: "angka identitas tersimpan sebagai angka Excel yang kehilangan presisi; format sel sebagai teks lalu unggah ulang" };
    }
    return { value: String(value).padStart(padTo ?? 0, "0"), error: "" };
  }
  const text = String(value ?? "").trim().replace(/^'/, "");
  return { value: text, error: "" };
};

const staffPositionOptions = [
  "Kepala Sekolah",
  "Kepala Tata Usaha",
  "Staff Tata Usaha",
  "Bendahara Pengeluaran",
  "Operator Sekolah",
  "Tendik Lainnya",
];

function teacherStaffCategory(teacher: Teacher) {
  return teacher.staff_category
    ?? (/guru|wakasek/i.test(teacher.employment_status ?? "") ? "Guru" : "Tenaga Kependidikan");
}

function teacherPrimaryRole(teacher: Teacher) {
  if (teacher.primary_role) return teacher.primary_role;
  if (teacher.employment_status === "Guru BK / Konselor") return "Guru BK";
  if (teacher.employment_status && teacherAdditionalRoleOptions.includes(teacher.employment_status)) {
    return "Guru Mata Pelajaran";
  }
  return teacher.employment_status ?? "Guru Mata Pelajaran";
}

function teacherAdditionalRoles(teacher: Teacher) {
  const savedRoles = Array.isArray(teacher.additional_roles) ? teacher.additional_roles : [];
  if (savedRoles.length) return savedRoles;
  return teacher.employment_status && teacherAdditionalRoleOptions.includes(teacher.employment_status)
    ? [teacher.employment_status]
    : [];
}

const teacherRoleForPosition = (position: string | null) => {
  switch (position) {
    case "Guru BK":
    case "Guru BK / Konselor":
      return "guru_bk";
    case "Kepala Sekolah":
      return "kepala_sekolah";
    case "Kepala Tata Usaha":
      return "kepala_tata_usaha";
    case "Staff Tata Usaha":
      return "staff_tata_usaha";
    case "Bendahara Pengeluaran":
    case "Bendahara":
      return "bendahara";
    case "Operator Sekolah":
      return "operator";
    case "Tendik Lainnya":
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
  if (typeof error === "string" && error) return error;
  if (typeof error !== "object" || error === null) {
    return error instanceof Error ? error.message : "Kesalahan tidak diketahui.";
  }
  const fields = error as { code?: unknown; message?: unknown; details?: unknown; hint?: unknown };
  const code = typeof fields.code === "string" && fields.code ? `[${fields.code}] ` : "";
  const message = typeof fields.message === "string" && fields.message
    ? fields.message
    : error instanceof Error ? error.message : "Kesalahan tidak diketahui.";
  const details = typeof fields.details === "string" && fields.details ? ` Detail: ${fields.details}` : "";
  const hint = typeof fields.hint === "string" && fields.hint ? ` Saran: ${fields.hint}` : "";
  return `${code}${message}${details}${hint}`;
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
  const canDeleteMasterData = userRole === "super_admin";
  const canDeletePeopleData = ["super_admin", "operator"].includes(userRole);
  const [activeMenu, setActiveMenu] =
    useState<MenuDataInduk>("siswa");
  const [search, setSearch] = useState("");
  const [selectedMasterIds, setSelectedMasterIds] = useState<string[]>([]);
  const [deletingSelectedMasterData, setDeletingSelectedMasterData] = useState(false);
  const [selectedMasterDeleteError, setSelectedMasterDeleteError] = useState("");

  const switchDataIndukMenu = (menu: MenuDataInduk) => {
    setActiveMenu(menu);
    setSelectedMasterIds([]);
    setSelectedMasterDeleteError("");
  };

  const [students, setStudents] = useState<Student[]>([]);
const [loadingStudents, setLoadingStudents] = useState(false);
const [studentError, setStudentError] = useState("");
const [studentNotice, setStudentNotice] = useState("");
const [studentReloadVersion, setStudentReloadVersion] = useState(0);
  const studentsLoadedRef = useRef(false);
  const studentLoadRequestRef = useRef(0);

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
const [classOptionsError, setClassOptionsError] = useState("");
const [importRows, setImportRows] = useState<ImportStudentRow[]>([]);
const [importError, setImportError] = useState("");
const [importNotice, setImportNotice] = useState("");
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
const [teacherReloadVersion, setTeacherReloadVersion] = useState(0);
const teachersLoadedRef = useRef(false);
const teacherLoadRequestRef = useRef(0);
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
const [teacherFormAssignmentSubject, setTeacherFormAssignmentSubject] = useState("");
const [teacherFormAssignmentClassIds, setTeacherFormAssignmentClassIds] = useState<string[]>([]);
const [savingTeacher, setSavingTeacher] = useState(false);
const [teacherFormError, setTeacherFormError] = useState("");

const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
const [classTeacherOptions, setClassTeacherOptions] = useState<Array<Pick<Teacher, "id" | "profile_id" | "full_name" | "staff_category" | "primary_role" | "homeroom_class_id">>>([]);
const [classRows, setClassRows] = useState<ClassRow[]>([]);
const [classLoading, setClassLoading] = useState(false);
const [classReloadVersion, setClassReloadVersion] = useState(0);
const classLoadedVersionRef = useRef(-1);
const [classLoadError, setClassLoadError] = useState("");
const [classAcademicYearError, setClassAcademicYearError] = useState("");
const [classDetailsError, setClassDetailsError] = useState("");
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
const auditLoadedVersionRef = useRef(-1);

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

const fetchStudentRows = useCallback(async (signal?: AbortSignal): Promise<Student[]> => {
  const rows: Student[] = [];
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    let query = supabase
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
        parent_phone
      `)
      .order("full_name", { ascending: true })
      .order("id", { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (signal) query = query.abortSignal(signal);
    const { data, error } = await query;
    if (error) throw error;
    const page = (data ?? []) as unknown as Student[];
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}, []);

useEffect(() => {
  if (activeMenu !== "siswa" || studentsLoadedRef.current) return;

  let cancelled = false;
  const requestId = ++studentLoadRequestRef.current;
  const request = createDataIndukRequest();

  async function loadStudents() {
    setLoadingStudents(true);
    setStudentError("");

    try {
      const loadedStudents = await fetchStudentRows(request.signal);

      if (!cancelled) {
        setStudents(loadedStudents);
        studentsLoadedRef.current = true;
      }
    } catch (error) {
      if (!cancelled) {
        setStudentError(dataLoadError(error, "Gagal memuat data siswa dari Supabase", request.timedOut()));
      }
    } finally {
      request.dispose();
      if (requestId === studentLoadRequestRef.current) {
        setLoadingStudents(false);
      }
    }
  }

  void loadStudents();

  return () => {
    cancelled = true;
    request.cancel();
    request.dispose();
    if (requestId === studentLoadRequestRef.current) {
      studentLoadRequestRef.current += 1;
      setLoadingStudents(false);
    }
  };
}, [activeMenu, fetchStudentRows, studentReloadVersion]);

const getStudentAccountStatus = (student: Student) => {
  return student.profile_id ? "Sudah Ada Akun" : "Belum Ada Akun";
};

const studentClassName = (student: Student) =>
  classes.find((classItem) => classItem.id === student.class_id)?.name ?? student.class?.name ?? "";

const filteredStudents = students.filter((student) => {
  const keyword = search.trim().toLowerCase();
  const matchesSearch =
    student.nisn.toLowerCase().includes(keyword) ||
    student.full_name.toLowerCase().includes(keyword) ||
    studentClassName(student).toLowerCase().includes(keyword);
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
    && !student.profile_id
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
    const savedStudentId = result.data.id;
    const currentClass = classes.find((item) => item.id === payload.class_id);
    const savedStudent: Student = {
      id: savedStudentId,
      profile_id: editingStudent?.profile_id ?? null,
      ...payload,
      class: payload.class_id
        ? { name: currentClass?.name ?? (editingStudent?.class_id === payload.class_id ? editingStudent.class?.name ?? "" : "") }
        : null,
    };
    setStudents((current) => {
      const next = editingStudent
        ? current.map((student) => student.id === savedStudentId ? savedStudent : student)
        : [...current, savedStudent];
      return next.sort((a, b) => a.full_name.localeCompare(b.full_name));
    });
    studentsLoadedRef.current = true;
    setStudentError("");

    let accountSyncWarning = "";
    if (editingStudent && editingStudent.status !== studentForm.status) {
      try {
        await syncStudentManagedAccount(savedStudentId);
      } catch (error) {
        accountSyncWarning = ` Status Data Induk tersimpan, tetapi sinkronisasi login gagal: ${formatSupabaseError(error)}`;
      }
    }
    const auditWarning = await logMasterChange(
      editingStudent ? "Data siswa diperbarui" : "Data siswa ditambahkan",
      `${full_name} · NISN ${nisn}`,
    );

    let refreshWarning = "";
    const refreshRequest = createDataIndukRequest();
    try {
      const refreshedStudents = await fetchStudentRows(refreshRequest.signal);
      setStudents(refreshedStudents);
    } catch (error) {
      refreshWarning = ` Data tersimpan, tetapi daftar siswa gagal diperbarui: ${formatSupabaseError(error)}${refreshRequest.timedOut() ? ` (batas ${DATA_INDUK_QUERY_TIMEOUT_MS / 1000} detik)` : ""}`;
    } finally {
      refreshRequest.dispose();
    }
    classLoadedVersionRef.current = -1;
    setStudentNotice(
      auditWarning
        ? `Data tersimpan, tetapi audit aktivitas gagal: ${auditWarning}${accountSyncWarning}${refreshWarning}`
        : editingStudent
          ? `Data siswa berhasil diperbarui.${accountSyncWarning}${refreshWarning}`
          : `Data siswa berhasil ditambahkan.${accountSyncWarning}${refreshWarning}`
    );
    setShowStudentForm(false);
    setEditingStudent(null);
    setStudentForm(emptyStudentForm);
  
} catch (error: unknown) {
  console.error("Gagal menyimpan data siswa:", error);

  setStudentFormError(`Gagal menyimpan data siswa: ${formatSupabaseError(error)}`);
} finally {
  setSavingStudent(false);
}
};

useEffect(() => {
  let cancelled = false;
  const request = createDataIndukRequest();

  async function loadClasses() {
    setClassOptionsError("");
    try {
      const { data, error } = await supabase
        .from("classes")
        .select("id, name, grade_level")
        .order("grade_level", { ascending: true })
        .order("name", { ascending: true })
        .abortSignal(request.signal);

      if (cancelled) return;
      if (error) throw error;
      setClasses(data ?? []);
    } catch (error) {
      if (!cancelled) {
        setClassOptionsError(dataLoadError(error, "Daftar kelas untuk formulir gagal dimuat", request.timedOut()));
      }
    } finally {
      request.dispose();
    }
  }

  void loadClasses();

  return () => {
    cancelled = true;
    request.cancel();
    request.dispose();
  };
}, [classReloadVersion]);

  useEffect(() => {
    if (activeMenu !== "guru" || teachersLoadedRef.current) return;
    let cancelled = false;
    const requestId = ++teacherLoadRequestRef.current;
    const request = createDataIndukRequest();
    (async () => {
      setTeacherLoading(true);
      setMasterError("");
      setTeacherSummaryError("");
      try {
        const [assignmentResult, classResult] = await Promise.all([
          supabase.from("attendance_teacher_subject_assignments")
            .select("teacher_id, class_id, subject")
            .abortSignal(request.signal),
          supabase.from("classes")
            .select("id, name, homeroom_teacher_id")
            .abortSignal(request.signal),
        ]);
        if (cancelled) return;
        const loadedTeachers: Teacher[] = [];
        const pageSize = 1000;
        for (let offset = 0; ; offset += pageSize) {
          const { data, error } = await supabase.from("teachers")
            .select("id, profile_id, nip, full_name, employment_status, staff_category, primary_role, additional_roles, bk_class_ids, homeroom_class_id")
            .order("full_name")
            .order("id")
            .range(offset, offset + pageSize - 1)
            .abortSignal(request.signal);
          if (error) throw error;
          const page = (data ?? []) as Teacher[];
          loadedTeachers.push(...page);
          if (page.length < pageSize) break;
        }
        if (cancelled) return;
        setTeachers(loadedTeachers);
        if (assignmentResult.error) {
          setTeacherAssignmentSummary([]);
          setTeacherSummaryError(`Ringkasan penugasan mapel gagal dimuat: ${formatSupabaseError(assignmentResult.error)}`);
        } else {
          const uniqueAssignments = new Map<string, TeacherAssignmentSummary>();
          for (const assignment of (assignmentResult.data ?? []) as TeacherAssignmentSummary[]) {
            const subject = normalizeSubjectName(assignment.subject);
            const key = JSON.stringify([
              assignment.teacher_id,
              assignment.class_id,
              subject.toLocaleLowerCase("id-ID"),
            ]);
            if (!uniqueAssignments.has(key)) {
              uniqueAssignments.set(key, { ...assignment, subject });
            }
          }
          setTeacherAssignmentSummary([...uniqueAssignments.values()]);
        }
        if (classResult.error) {
          setTeacherHomeroomSummary([]);
          setTeacherSummaryError((current) => current
            ? `${current} Ringkasan wali kelas gagal dimuat: ${formatSupabaseError(classResult.error)}`
            : `Ringkasan wali kelas gagal dimuat: ${formatSupabaseError(classResult.error)}`);
        } else {
          setTeacherHomeroomSummary((classResult.data ?? []).map((row) => {
            const pendingTeacher = loadedTeachers.find((teacher) => teacher.homeroom_class_id === row.id);
            return {
              ...row,
              homeroom_teacher_id: row.homeroom_teacher_id
                ?? pendingTeacher?.profile_id
                ?? pendingTeacher?.id
                ?? null,
            };
          }) as TeacherHomeroomSummary[]);
        }
        teachersLoadedRef.current = true;
      } catch (error) {
        if (!cancelled) setMasterError(dataLoadError(error, "Data guru/tendik gagal dimuat", request.timedOut()));
      } finally {
        request.dispose();
        if (requestId === teacherLoadRequestRef.current) setTeacherLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      request.cancel();
      request.dispose();
      if (requestId === teacherLoadRequestRef.current) {
        teacherLoadRequestRef.current += 1;
        setTeacherLoading(false);
      }
    };
  }, [activeMenu, teacherReloadVersion]);

  const getTeacherManagedAccount = (teacher: Teacher) => {
    if (!teacher.nip || !teacherAccounts) return undefined;
    return teacherAccounts.find((user) =>
      normalizeAccountUsername(user.username) === normalizeAccountUsername(teacher.nip ?? "")
    );
  };

  const filteredTeachers = teachers.filter((teacher) => {
    const keyword = search.trim().toLowerCase();
    const primaryRole = teacherPrimaryRole(teacher);
    const extraRoles = teacherAdditionalRoles(teacher).filter((role) => role !== "Wali Kelas");
    const matchesSearch = `${teacher.nip ?? ""} ${teacher.full_name} ${primaryRole} ${extraRoles.join(" ")}`
      .toLowerCase()
      .includes(keyword);
    const matchesPosition = teacherFilterPosition === "all"
      || primaryRole === teacherFilterPosition
      || extraRoles.includes(teacherFilterPosition);
    const hasSubjectAssignment = teacherAssignmentSummary.some((assignment) => assignment.teacher_id === teacher.id);
    const matchesStatus = teacherFilterStatus === "all"
      || (teacherFilterStatus === "no-subject"
          ? !teacherSummaryError && primaryRole === "Guru Mata Pelajaran" && !hasSubjectAssignment
        : userRole === "super_admin" && !teacher.profile_id);
    return matchesSearch && matchesPosition && matchesStatus;
  });
  const filteredClasses = classRows.filter((row) =>
    `${row.name} ${row.academic_year_name} ${row.homeroom_teacher_name}`
      .toLowerCase()
      .includes(search.toLowerCase())
  );
  const selectableMasterIds = activeMenu === "siswa"
    ? filteredStudents.map((student) => student.id)
    : activeMenu === "guru"
      ? filteredTeachers.map((teacher) => teacher.id)
      : activeMenu === "kelas"
        ? filteredClasses.map((row) => row.id)
        : [];
  const selectedMasterIdSet = new Set(selectedMasterIds);
  const canDeleteCurrentMenu = activeMenu === "kelas"
    ? canDeleteMasterData
    : canDeletePeopleData;
  const allVisibleMasterRowsSelected = selectableMasterIds.length > 0
    && selectableMasterIds.every((id) => selectedMasterIdSet.has(id));
  const someVisibleMasterRowsSelected = selectableMasterIds.some((id) => selectedMasterIdSet.has(id));
  const toggleVisibleMasterSelection = () => {
    setSelectedMasterIds((current) => allVisibleMasterRowsSelected
      ? current.filter((id) => !selectableMasterIds.includes(id))
      : [...new Set([...current, ...selectableMasterIds])]);
  };
  const toggleMasterRowSelection = (id: string) => {
    setSelectedMasterIds((current) => current.includes(id)
      ? current.filter((selectedId) => selectedId !== id)
      : [...current, id]);
  };

  const eligibleStudentAccountCount = filteredStudents.filter((student) =>
    student.status === "Active"
    && /^\d{10}$/.test(student.nisn.trim())
    && !student.profile_id
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

    if (!window.confirm(
      `Periksa akun dengan username NIP untuk ${teacher.full_name}. Jika akun sudah ada, akun akan ditautkan; jika belum, akun baru akan dibuat dengan NIP sebagai username dan password awal.`,
    )) return;

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
      if (existing?.role === "super_admin") {
        throw new Error("Akun Super Admin dilindungi dan tidak dapat ditautkan sebagai guru/tendik.");
      }
      if (teacher.profile_id && existing && teacher.profile_id !== existing.id) {
        throw new Error("Data guru sudah tertaut ke akun lain.");
      }

      const managedUser = existing ?? await createManagedUser({
        username: nip,
        full_name: teacher.full_name,
        role: teacherRoleForPosition(teacherPrimaryRole(teacher)),
        password: nip,
      });
      const { data, error } = await supabase
        .from("teachers")
        .update({ profile_id: managedUser.id })
        .eq("id", teacher.id)
        .select("id, profile_id, nip, full_name, employment_status, staff_category, primary_role, additional_roles, bk_class_ids, homeroom_class_id")
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
      let roleSyncWarning = "";
      try {
        await syncTeacherManagedAccount(savedTeacher.id);
      } catch (error) {
        roleSyncWarning = ` Akun tertaut, tetapi sinkronisasi jabatan gagal: ${formatSupabaseError(error)}`;
      }
      setTeachers((current) => current.map((item) =>
        item.id === savedTeacher.id ? savedTeacher : item
      ));
      setClassReloadVersion((version) => version + 1);
      setTeacherAccounts(existing
        ? currentUsers.map((user) => user.id === managedUser.id
          ? { ...user, full_name: savedTeacher.full_name, role: teacherRoleForPosition(teacherPrimaryRole(savedTeacher)) }
          : user)
        : [...currentUsers, { ...managedUser, role: teacherRoleForPosition(teacherPrimaryRole(savedTeacher)), created_at: new Date().toISOString() }]);
      const auditWarning = await logMasterChange(
        existing ? "Akun guru/tendik ditautkan" : "Akun guru/tendik dibuat",
        `${teacher.full_name} · NIP ${nip} · peran ${managedUser.role}`,
      );
      setMasterNotice(
        `${existing ? "Akun yang sudah ada berhasil ditautkan" : "Akun berhasil dibuat dan ditautkan"}.${roleSyncWarning}${auditWarning ? ` Audit aktivitas gagal: ${auditWarning}` : ""}`,
      );
    } catch (error) {
      setTeacherAccountError(`Akun guru/tendik gagal dibuat atau ditautkan: ${formatSupabaseError(error)}`);
    } finally {
      setCreatingTeacherAccountId(null);
    }
  };

  useEffect(() => {
    if (activeMenu !== "kelas" || classLoadedVersionRef.current === classReloadVersion) return;
    let cancelled = false;
    const request = createDataIndukRequest();
    (async () => {
      setClassLoading(true);
      setClassLoadError("");
      setClassAcademicYearError("");
      setClassDetailsError("");
      try {
        const [c, y] = await Promise.all([
          supabase.from("classes")
            .select("id, name, grade_level, academic_year_id, homeroom_teacher_id")
            .order("grade_level")
            .order("name")
            .abortSignal(request.signal),
          supabase.from("academic_years")
            .select("id, name, is_active, start_date, end_date")
            .order("start_date", { ascending: false })
            .abortSignal(request.signal),
        ]);
        if (cancelled) return;
        if (c.error) throw c.error;
        if (y.error) {
          setClassAcademicYearError(dataLoadError(y.error, "Tahun ajaran gagal dimuat", request.timedOut()));
        }

        const years = y.error ? [] : y.data ?? [];
        setClasses((c.data ?? []).map((row) => ({
          id: row.id,
          name: row.name,
          grade_level: row.grade_level,
        })));
        if (!y.error) setAcademicYears(years as AcademicYear[]);
        const teacherNames = new Map<string, string>();
        const yearNames = new Map(years.map(x => [x.id, x.name]));
        setClassRows((c.data ?? []).map((row) => ({
          ...row,
          academic_year_name: yearNames.get(row.academic_year_id) ?? "—",
          homeroom_teacher_name: row.homeroom_teacher_id ? "Memuat nama wali kelas..." : "Belum ditentukan",
          student_count: 0,
        })) as ClassRow[]);
        setClassLoading(false);

        const loadLinkedTeachers = async () => {
          const linkedTeachers: Array<Pick<Teacher, "id" | "profile_id" | "full_name" | "staff_category" | "primary_role" | "homeroom_class_id">> = [];
          for (let offset = 0; ; offset += 1000) {
            const { data, error } = await supabase.from("teachers")
              .select("id, profile_id, full_name, staff_category, primary_role, homeroom_class_id")
              .order("id")
              .range(offset, offset + 999)
              .abortSignal(request.signal);
            if (error) throw error;
            const page = (data ?? []) as typeof linkedTeachers;
            linkedTeachers.push(...page);
            if (page.length < 1000) return linkedTeachers;
          }
        };
        const loadStudentClassIds = async () => {
          const studentClassIds: Array<{ class_id: string | null }> = [];
          for (let offset = 0; ; offset += 1000) {
            const { data, error } = await supabase.from("students")
              .select("class_id")
              .order("id")
              .range(offset, offset + 999)
              .abortSignal(request.signal);
            if (error) throw error;
            const page = data ?? [];
            studentClassIds.push(...page);
            if (page.length < 1000) return studentClassIds;
          }
        };
        const [teacherResult, studentResult] = await Promise.allSettled([
          loadLinkedTeachers(),
          loadStudentClassIds(),
        ]);
        if (cancelled) return;

        const detailErrors: string[] = [];
        const linkedTeachers = teacherResult.status === "fulfilled" ? teacherResult.value : [];
        if (teacherResult.status === "rejected") {
          detailErrors.push(dataLoadError(teacherResult.reason, "Nama wali kelas gagal dimuat", request.timedOut()));
        } else {
          linkedTeachers.forEach((teacher) => {
            teacherNames.set(teacher.id, teacher.full_name);
            if (teacher.profile_id) teacherNames.set(teacher.profile_id, teacher.full_name);
            if (teacher.homeroom_class_id) teacherNames.set(`class:${teacher.homeroom_class_id}`, teacher.full_name);
          });
          setClassTeacherOptions(linkedTeachers.filter((teacher) =>
            teacher.staff_category === "Guru" && teacher.primary_role === "Guru Mata Pelajaran"
          ));
        }
        const counts = new Map<string, number>();
        if (studentResult.status === "fulfilled") {
          studentResult.value.forEach((row) => {
            if (row.class_id) counts.set(row.class_id, (counts.get(row.class_id) ?? 0) + 1);
          });
        } else {
          detailErrors.push(dataLoadError(studentResult.reason, "Jumlah siswa per kelas gagal dimuat", request.timedOut()));
        }
        setClassRows((c.data ?? []).map((row) => ({
          ...row,
          academic_year_name: yearNames.get(row.academic_year_id) ?? "—",
          homeroom_teacher_name: row.homeroom_teacher_id
            ? teacherNames.get(row.homeroom_teacher_id) ?? "Profil guru tidak ditemukan"
            : teacherNames.get(`class:${row.id}`) ?? "Belum ditentukan",
          homeroom_teacher_record_id: linkedTeachers.find((teacher) =>
            teacher.homeroom_class_id === row.id
            || teacher.profile_id === row.homeroom_teacher_id
            || teacher.id === row.homeroom_teacher_id
          )?.id ?? null,
          student_count: counts.get(row.id) ?? 0,
        })) as ClassRow[]);
        setClassDetailsError(detailErrors.join(" "));
        if (!y.error && detailErrors.length === 0) {
          classLoadedVersionRef.current = classReloadVersion;
        }
      } catch (error) {
        if (!cancelled) {
          setClassLoadError(dataLoadError(error, "Data kelas gagal dimuat", request.timedOut()));
        }
      } finally {
        request.dispose();
        if (!cancelled) setClassLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      request.cancel();
      request.dispose();
      setClassLoading(false);
    };
  }, [activeMenu, classReloadVersion]);

  useEffect(() => {
    if (
      activeMenu !== "riwayat" ||
      !canManageDataInduk ||
      auditLoadedVersionRef.current === auditReloadVersion
    ) return;
    let cancelled = false;
    const request = createDataIndukRequest();
    const timer = window.setTimeout(async () => {
      setAuditLoading(true);
      setAuditError("");
      try {
        const { data, error } = await supabase
          .from("datainduk_change_log")
          .select("id,changed_at,actor_id,actor_name,table_name,record_id,operation,changed_fields,old_data,new_data")
          .order("changed_at", { ascending: false })
          .limit(200)
          .abortSignal(request.signal);
        if (error) throw error;
        if (!cancelled) {
          setAuditEntries((data ?? []) as DataIndukAuditEntry[]);
          auditLoadedVersionRef.current = auditReloadVersion;
        }
      } catch (error) {
        if (!cancelled) {
          setAuditError(dataLoadError(error, "Riwayat perubahan gagal dimuat", request.timedOut()));
        }
      } finally {
        request.dispose();
        if (!cancelled) setAuditLoading(false);
      }
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      request.cancel();
      request.dispose();
      setAuditLoading(false);
    };
  }, [activeMenu, auditReloadVersion, canManageDataInduk]);

  const handleSaveTeacher = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setTeacherFormError("");

    const nip = teacherForm.nip.trim();
    const full_name = teacherForm.full_name.trim();
    const primary_role = teacherForm.primary_role.trim();
    if (!full_name) {
      setTeacherFormError("Nama lengkap wajib diisi.");
      return;
    }
    if (!primary_role) {
      setTeacherFormError("Jabatan wajib dipilih.");
      return;
    }
    if (
      teacherForm.staff_category === "Tenaga Kependidikan" &&
      !staffPositionOptions.includes(primary_role)
    ) {
      setTeacherFormError("Pilih jabatan Tenaga Kependidikan yang tersedia.");
      return;
    }
    if (
      teacherForm.staff_category === "Guru" &&
      !["Guru Mata Pelajaran", "Guru BK"].includes(primary_role)
    ) {
      setTeacherFormError("Pilih jabatan Guru Mata Pelajaran atau Guru BK.");
      return;
    }

    let subjectAssignments = teacherForm.subject_assignments;
    const pendingSubject = normalizeSubjectName(teacherFormAssignmentSubject);
    if (pendingSubject || teacherFormAssignmentClassIds.length) {
      if (!pendingSubject || !teacherFormAssignmentClassIds.length) {
        setTeacherFormError("Lengkapi mata pelajaran dan centang minimal satu kelas, atau tekan Tambah sebelum menyimpan.");
        return;
      }
      const mergedAssignments = [...subjectAssignments];
      teacherFormAssignmentClassIds.forEach((classId) => {
        const duplicate = mergedAssignments.some((item) =>
          item.class_id === classId
          && item.subject.toLocaleLowerCase("id-ID") === pendingSubject.toLocaleLowerCase("id-ID")
        );
        if (!duplicate) mergedAssignments.push({ class_id: classId, subject: pendingSubject });
      });
      subjectAssignments = mergedAssignments;
    }

    setSavingTeacher(true);
    setMasterNotice("");
    let masterRecordSaved = false;
    let persistedTeacher: Teacher | null = null;

    try {
      const additional_roles = teacherForm.staff_category === "Guru"
        ? [
            ...teacherForm.additional_roles.filter((role) => teacherAdditionalRoleOptions.includes(role)),
            ...(primary_role === "Guru Mata Pelajaran" && teacherForm.homeroom_class_id
              ? ["Wali Kelas"]
              : []),
          ]
        : [];
      const bk_class_ids = primary_role === "Guru BK"
        ? teacherForm.bk_class_ids
        : [];
      const payload = {
        nip: nip || null,
        full_name,
        staff_category: teacherForm.staff_category,
        primary_role,
        additional_roles: [...new Set(additional_roles)],
        bk_class_ids: [...new Set(bk_class_ids)],
        employment_status: primary_role,
        homeroom_class_id: primary_role === "Guru Mata Pelajaran"
          ? teacherForm.homeroom_class_id || null
          : null,
      };
      const result = await supabase.rpc("save_teacher_master_data", {
        p_teacher_id: editingTeacher?.id ?? null,
        p_nip: payload.nip,
        p_full_name: payload.full_name,
        p_staff_category: payload.staff_category,
        p_primary_role: payload.primary_role,
        p_additional_roles: payload.additional_roles,
        p_bk_class_ids: payload.bk_class_ids,
        p_homeroom_class_id: payload.homeroom_class_id,
        p_assignments: primary_role === "Guru Mata Pelajaran" ? subjectAssignments : [],
      });
      if (result.error) throw result.error;
      if (!result.data) throw new Error("Penyimpanan guru tidak mengembalikan ID data.");
      const savedTeacherId = result.data;
      const fallbackTeacher: Teacher = {
        ...(editingTeacher ?? {
          id: savedTeacherId,
          profile_id: null,
        }),
        ...payload,
        id: savedTeacherId,
        profile_id: editingTeacher?.profile_id ?? null,
        homeroom_class_id: payload.homeroom_class_id,
      };
      masterRecordSaved = true;
      persistedTeacher = fallbackTeacher;
      let savedTeacher = fallbackTeacher;
      const { data: refreshedTeacher, error: refreshTeacherError } = await supabase
        .from("teachers")
        .select("id, profile_id, nip, full_name, employment_status, staff_category, primary_role, additional_roles, bk_class_ids, homeroom_class_id")
        .eq("id", savedTeacherId)
        .single();
      if (refreshTeacherError) {
        throw new Error(`Data tersimpan, tetapi pembacaan ulang guru gagal: ${formatSupabaseError(refreshTeacherError)}`);
      }
      savedTeacher = refreshedTeacher as Teacher;
      persistedTeacher = savedTeacher;
      setTeachers((previous) =>
        [...previous.filter((teacher) => teacher.id !== savedTeacher.id), savedTeacher]
          .sort((a, b) => a.full_name.localeCompare(b.full_name)),
      );

      let accountSyncWarning = "";
      setClassReloadVersion((version) => version + 1);

      if (editingTeacher && savedTeacher.profile_id) {
        try {
          await syncTeacherManagedAccount(savedTeacher.id);
        } catch (error) {
          accountSyncWarning = ` Perubahan data tersimpan, tetapi sinkronisasi akun gagal: ${formatSupabaseError(error)}`;
        }
      }

      setTeacherAssignmentSummary((current) => [
        ...current.filter((assignment) => assignment.teacher_id !== savedTeacher.id),
        ...(primary_role === "Guru Mata Pelajaran"
          ? subjectAssignments.map((assignment) => ({
              ...assignment,
              teacher_id: savedTeacher.id,
            }))
          : []),
      ]);
      setTeacherHomeroomSummary((current) => [
        ...current
          .filter((item) => item.id !== payload.homeroom_class_id
            && item.homeroom_teacher_id !== savedTeacher.id
            && item.homeroom_teacher_id !== savedTeacher.profile_id),
        ...(payload.homeroom_class_id
          ? [{
              id: payload.homeroom_class_id,
              name: classes.find((item) => item.id === payload.homeroom_class_id)?.name ?? "Kelas",
              homeroom_teacher_id: savedTeacher.profile_id ?? savedTeacher.id,
            }]
          : []),
      ]);
      const auditWarning = await logMasterChange(
        editingTeacher ? "Data guru/tendik diperbarui" : "Data guru/tendik ditambahkan",
        `${savedTeacher.full_name}${savedTeacher.nip ? ` · NIP ${savedTeacher.nip}` : ""}`,
      );
      setMasterNotice(
        auditWarning
          ? `Data tersimpan, tetapi audit aktivitas gagal: ${auditWarning}${accountSyncWarning}`
          : `${editingTeacher ? "Data guru/tendik berhasil diperbarui." : "Data guru/tendik berhasil ditambahkan."}${accountSyncWarning}`,
      );
      setShowTeacherForm(false);
      setEditingTeacher(null);
      setTeacherForm(emptyTeacherForm);
      setTeacherFormAssignmentSubject("");
      setTeacherFormAssignmentClassIds([]);
    } catch (error) {
      if (persistedTeacher) {
        setEditingTeacher(persistedTeacher);
        setShowTeacherForm(true);
      }
      if (masterRecordSaved) setClassReloadVersion((version) => version + 1);
      setTeacherFormError(
        masterRecordSaved
          ? `Data guru dan penugasannya tersimpan, tetapi pembaruan tampilan gagal: ${formatSupabaseError(error)}. Muat ulang daftar untuk melihat data terbaru.`
          : `Gagal ${editingTeacher ? "memperbarui" : "menambahkan"} data: ${formatSupabaseError(error)}`,
      );
    } finally {
      setSavingTeacher(false);
    }
  };

  const handleEditTeacher = (teacher: Teacher) => {
    setEditingTeacher(teacher);
    const staffCategory = teacherStaffCategory(teacher);
    const primaryRole = teacherPrimaryRole(teacher);
    const homeroomClasses = teacherHomeroomSummary.filter(
      (item) => teacherOwnsHomeroomAssignment(teacher, item.homeroom_teacher_id),
    );
    setTeacherForm({
      nip: teacher.nip ?? "",
      full_name: teacher.full_name,
      staff_category: staffCategory === "Tenaga Kependidikan" ? "Tenaga Kependidikan" : "Guru",
      primary_role: primaryRole,
      additional_roles: teacherAdditionalRoles(teacher).filter((role) => teacherAdditionalRoleOptions.includes(role)),
      homeroom_class_id: homeroomClasses.length === 1 ? homeroomClasses[0].id : "",
      bk_class_ids: Array.isArray(teacher.bk_class_ids) ? teacher.bk_class_ids : [],
      subject_assignments: teacherAssignmentSummary
        .filter((assignment) => assignment.teacher_id === teacher.id)
        .map(({ class_id, subject }) => ({ class_id, subject })),
    });
    setTeacherFormAssignmentSubject("");
    setTeacherFormAssignmentClassIds([]);
    setTeacherFormError("");
    setMasterNotice("");
    setShowTeacherForm(true);
  };

  const handleDeleteTeacher = async (teacher: Teacher) => {
    if (!canDeletePeopleData) return;
    if (!window.confirm(`Hapus data ${teacher.full_name}?`)) return;
    let accountDeleted: boolean;
    let accountFound: boolean;
    try {
      const [result] = await deleteMasterRecords("teachers", [teacher.id]);
      accountDeleted = result.accountDeleted;
      accountFound = Boolean(result.accountFound);
      if (result.masterRecordDeleted) {
        setTeachers((current) => current.filter((item) => item.id !== teacher.id));
        setTeacherAssignmentSummary((current) => current.filter((item) => item.teacher_id !== teacher.id));
        setClassReloadVersion((version) => version + 1);
      }
      if (!result.deleted) {
        setMasterNotice(result.error ?? "Penghapusan data guru/tendik belum selesai.");
        return;
      }
    } catch (error) {
      alert(`Gagal menghapus data guru/tendik: ${formatSupabaseError(error)}`);
      return;
    }
    const auditWarning = await logMasterChange(
      "Data guru/tendik dihapus",
      `${teacher.full_name}${teacher.nip ? ` · NIP ${teacher.nip}` : ""}`,
    );
    setMasterNotice(auditWarning
      ? `Data guru/tendik berhasil dihapus, tetapi audit gagal: ${auditWarning}`
      : `Data guru/tendik berhasil dihapus. ${
          accountDeleted
            ? "Akun yang tertaut ikut dihapus."
            : accountFound
              ? "Akun terkait tidak dihapus karena bukan akun guru/tendik."
              : "Tidak ada akun pengguna tertaut."
        }`);
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
    const assignedTeacher = classTeacherOptions.find((teacher) =>
      teacher.id === row.homeroom_teacher_record_id
      || Boolean(row.homeroom_teacher_id)
        && (teacher.id === row.homeroom_teacher_id || teacher.profile_id === row.homeroom_teacher_id)
    );
    setEditingClass(row);
    setClassForm({
      name: row.name,
      grade_level: String(row.grade_level),
      academic_year_id: row.academic_year_id,
      homeroom_teacher_id: assignedTeacher?.profile_id ?? assignedTeacher?.id ?? row.homeroom_teacher_id ?? "",
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
    const selectedTeacher = classTeacherOptions.find((teacher) =>
      Boolean(classForm.homeroom_teacher_id)
      && (teacher.id === classForm.homeroom_teacher_id || teacher.profile_id === classForm.homeroom_teacher_id)
    );
    const preservesUnknownAssignment = Boolean(
      editingClass?.homeroom_teacher_id
      && classForm.homeroom_teacher_id === editingClass.homeroom_teacher_id
      && !selectedTeacher
    );
    if (
      classForm.homeroom_teacher_id &&
      !selectedTeacher &&
      !preservesUnknownAssignment
    ) {
      setClassFormError("Pilih wali kelas dari daftar guru mata pelajaran.");
      return;
    }

    setSavingClass(true);
    setClassFormError("");
    let persistedClass: ClassRow | null = null;
    try {
      const payload = {
        name,
        grade_level,
        academic_year_id: year.id,
      };
      const result = editingClass
        ? await supabase.from("classes").update(payload).eq("id", editingClass.id).select("id").single()
        : await supabase.from("classes").insert(payload).select("id").single();
      if (result.error) throw result.error;
      const savedClass: ClassRow = {
        id: result.data.id,
        name,
        grade_level,
        academic_year_id: year.id,
        homeroom_teacher_id: selectedTeacher?.profile_id ?? null,
        homeroom_teacher_record_id: selectedTeacher?.id ?? null,
        academic_year_name: year.name,
        homeroom_teacher_name: selectedTeacher?.full_name ?? "Belum ditentukan",
        student_count: editingClass?.student_count ?? 0,
      };
      persistedClass = savedClass;
      setClassRows((current) => [
        ...current.filter((item) => item.id !== savedClass.id),
        savedClass,
      ]);

      const previousTeacher = classTeacherOptions.find(
        (teacher) => Boolean(editingClass?.homeroom_teacher_record_id || editingClass?.homeroom_teacher_id)
          && (teacher.id === editingClass?.homeroom_teacher_record_id
            || teacher.id === editingClass?.homeroom_teacher_id
            || teacher.profile_id === editingClass?.homeroom_teacher_id),
      );
      if (previousTeacher && previousTeacher.id !== selectedTeacher?.id) {
        const { error } = await supabase.rpc("set_teacher_homeroom_class", {
          p_teacher_id: previousTeacher.id,
          p_class_id: null,
        });
        if (error) throw error;
      } else if (editingClass?.homeroom_teacher_id && !previousTeacher) {
        const { error } = await supabase
          .from("classes")
          .update({ homeroom_teacher_id: null })
          .eq("id", result.data.id);
        if (error) throw error;
      }
      if (selectedTeacher && (
        previousTeacher?.id !== selectedTeacher.id
        || editingClass?.homeroom_teacher_record_id !== selectedTeacher.id
      )) {
        const { error } = await supabase.rpc("set_teacher_homeroom_class", {
          p_teacher_id: selectedTeacher.id,
          p_class_id: result.data.id,
        });
        if (error) throw error;
      }
      setClassReloadVersion((version) => version + 1);

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
    } catch (error) {
      if (persistedClass) {
        setEditingClass(persistedClass);
        setShowClassForm(true);
        setClassReloadVersion((version) => version + 1);
      }
      setClassFormError(
        persistedClass
          ? `Data kelas tersimpan, tetapi sinkronisasi wali kelas gagal: ${formatSupabaseError(error)}. Form tetap terhubung ke kelas yang tersimpan; simpan ulang setelah memperbaiki masalah agar tidak membuat duplikat.`
          : `Gagal ${editingClass ? "memperbarui" : "menambahkan"} kelas: ${formatSupabaseError(error)}`,
      );
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

  const handleDeleteSelectedMasterData = async () => {
    if (
      deletingSelectedMasterData ||
      (activeMenu === "kelas" ? !canDeleteMasterData : !canDeletePeopleData)
    ) return;
    setSelectedMasterDeleteError("");

    const tableName = activeMenu === "siswa"
      ? "students"
      : activeMenu === "guru"
        ? "teachers"
        : activeMenu === "kelas"
          ? "classes"
          : null;
    if (!tableName) return;

    const selectedRows = activeMenu === "siswa"
      ? students.filter((student) => selectedMasterIdSet.has(student.id))
      : activeMenu === "guru"
        ? teachers.filter((teacher) => selectedMasterIdSet.has(teacher.id))
        : classRows.filter((row) => selectedMasterIdSet.has(row.id));
    const selectedIds = selectedRows.map((row) => row.id);
    if (!selectedIds.length) return;
    if (selectedIds.length > 100) {
      setSelectedMasterDeleteError("Penghapusan dibatasi 100 data per proses. Hapus pilihan terlebih dahulu, lalu pilih maksimal 100 data.");
      return;
    }

    if (activeMenu === "kelas") {
      const classesWithStudents = (selectedRows as ClassRow[]).filter((row) => row.student_count > 0);
      if (classesWithStudents.length) {
        setSelectedMasterDeleteError(
          `Kelas masih memiliki siswa dan tidak dapat dihapus: ${classesWithStudents.map((row) => row.name).join(", ")}. Pindahkan siswa terlebih dahulu.`,
        );
        return;
      }
    }

    const rowName = (row: Student | Teacher | ClassRow) =>
      "full_name" in row ? row.full_name : row.name;
    const names = selectedRows.map(rowName);
    const itemLabel = activeMenu === "siswa" ? "siswa" : activeMenu === "guru" ? "data guru/tendik" : "kelas";
    const relatedDataWarning = activeMenu === "siswa"
      ? "\nAkun siswa yang terhubung melalui profile_id atau NISN juga akan dihapus. Akun Super Admin selalu dilindungi."
      : activeMenu === "guru"
        ? "\nAkun guru/tendik yang terhubung melalui profile_id atau NIP juga akan dihapus. Akun Super Admin selalu dilindungi."
        : "\nKelas dengan siswa tidak bisa dihapus. Data akademik atau layanan lain yang masih merujuk kelas juga dapat menolak penghapusan.";
    const namePreview = names.slice(0, 5).join(", ");
    const moreNames = names.length > 5 ? ` dan ${names.length - 5} lainnya` : "";
    if (!window.confirm(
      `Hapus ${selectedIds.length} ${itemLabel} terpilih?\n\n${namePreview}${moreNames}${relatedDataWarning}\n\nPenghapusan tidak dapat dibatalkan.`,
    )) return;

    setDeletingSelectedMasterData(true);
    setMasterNotice("");
    try {
      let deletedIds: string[] = [];
      let partialErrors: string[] = [];
      let deletedAccountCount = 0;
      if (tableName === "students") {
        const results = await deleteMasterRecords("students", selectedIds);
        deletedIds = results.filter((result) => result.masterRecordDeleted).map((result) => result.id);
        deletedAccountCount = results.filter((result) => result.accountDeleted).length;
        partialErrors = results
          .filter((result) => result.error)
          .map((result) => `${names[selectedIds.indexOf(result.id)] ?? result.id}: ${result.error}`);
      } else if (tableName === "teachers") {
        const results = await deleteMasterRecords("teachers", selectedIds);
        deletedIds = results.filter((result) => result.masterRecordDeleted).map((result) => result.id);
        deletedAccountCount = results.filter((result) => result.accountDeleted).length;
        partialErrors = results
          .filter((result) => result.error)
          .map((result) => `${names[selectedIds.indexOf(result.id)] ?? result.id}: ${result.error}`);
      } else {
        const result = await supabase.from("classes").delete().in("id", selectedIds).select("id");
        if (result.error) throw result.error;
        deletedIds = (result.data ?? []).map((row) => row.id);
      }

      if (!deletedIds.length) {
        throw new Error(partialErrors[0] ?? "Tidak ada data yang terhapus. Periksa hak akses dan data yang masih terkait.");
      }
      const deletedIdSet = new Set(deletedIds);
      if (tableName === "students") {
        setStudents((current) => current.filter((student) => !deletedIdSet.has(student.id)));
        setClassReloadVersion((version) => version + 1);
      } else if (tableName === "teachers") {
        setTeachers((current) => current.filter((teacher) => !deletedIdSet.has(teacher.id)));
        setTeacherAssignmentSummary((current) => current.filter((assignment) => !deletedIdSet.has(assignment.teacher_id)));
      } else {
        setClassRows((current) => current.filter((row) => !deletedIdSet.has(row.id)));
        setClassReloadVersion((version) => version + 1);
      }
      setSelectedMasterIds((current) => current.filter((id) => !deletedIdSet.has(id)));

      const deletedNames = selectedRows
        .filter((row) => deletedIdSet.has(row.id))
        .map(rowName);
      const auditWarning = await logMasterChange(
        `${itemLabel} dipilih dihapus`,
        `${deletedIds.length} data: ${deletedNames.slice(0, 5).join(", ")}${deletedNames.length > 5 ? ` dan ${deletedNames.length - 5} lainnya` : ""}`,
      );
      setMasterNotice(
        `${deletedIds.length} ${itemLabel} berhasil dihapus.${
          deletedAccountCount ? ` ${deletedAccountCount} akun tertaut ikut dihapus.` : ""
        }${auditWarning ? ` Audit aktivitas gagal: ${auditWarning}` : ""}`,
      );
      if (deletedIds.length !== selectedIds.length || partialErrors.length) {
        setSelectedMasterDeleteError(
          `Terhapus ${deletedIds.length} dari ${selectedIds.length} data.${partialErrors.length ? ` ${partialErrors.slice(0, 3).join(" ")}` : " Data lain tidak dapat dihapus karena izin atau keterkaitan; periksa Riwayat Perubahan."}`,
        );
      }
    } catch (error) {
      setSelectedMasterDeleteError(`Gagal menghapus data terpilih: ${formatSupabaseError(error)}`);
    } finally {
      setDeletingSelectedMasterData(false);
    }
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
        let accountSyncWarning = "";
        try {
          const studentIds = selectedStudents.map((student) => student.id);
          for (let index = 0; index < studentIds.length; index += 100) {
            await syncStudentManagedAccounts(studentIds.slice(index, index + 100));
          }
        } catch (error) {
          accountSyncWarning = ` Profil telah dinonaktifkan, tetapi sebagian sinkronisasi Auth gagal: ${formatSupabaseError(error)}`;
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
          `${selectedStudents.length} siswa berhasil ditandai Graduated.${accountSyncWarning}${auditWarning ? ` Audit aktivitas gagal: ${auditWarning}` : ""}`,
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
    const rows = activeMenu === "guru" ? teachers.filter(t => `${t.nip ?? ""} ${t.full_name} ${teacherPrimaryRole(t)} ${teacherAdditionalRoles(t).join(" ")}`.toLowerCase().includes(search.toLowerCase())).map(t => ({ NIP: t.nip ?? "", Nama: t.full_name, "Status Kepegawaian": teacherStaffCategory(t), "Jabatan Utama": teacherPrimaryRole(t), "Jabatan Tambahan": teacherAdditionalRoles(t).join(", ") })) : classRows.filter(c => `${c.name} ${c.academic_year_name} ${c.homeroom_teacher_name}`.toLowerCase().includes(search.toLowerCase())).map(c => ({ "Nama Kelas": c.name, Tingkat: c.grade_level, "Tahun Ajaran": c.academic_year_name, "Wali Kelas": c.homeroom_teacher_name, "Jumlah Siswa": c.student_count }));
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
  setImportNotice("");
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

      const nisnResult = excelIdentifier(getValue("nisn"), 10);
      const nisn = nisnResult.value;
      const full_name = String(
        getValue("nama", "namalengkap", "fullname")
      ).trim();
      const class_name = normalizeClassName(String(getValue("kelas", "class")));
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

      if (nisnResult.error) errors.push(`NISN ${nisnResult.error}`);
      if (!/^\d{10}$/.test(nisn)) {
        errors.push("NISN harus 10 angka");
      }
      if (birth_date) {
        const parsedDate = new Date(`${birth_date}T00:00:00Z`);
        if (Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== birth_date) {
          errors.push("Tanggal lahir tidak valid");
        }
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

    const classNames = new Set((registeredClasses ?? []).map((item) => normalizeClassName(item.name)));
    rows.forEach((row) => {
      if (existingNisns.has(row.nisn)) {
        row.errors.push("NISN sudah terdaftar di database");
      }
      if (row.class_name && !classNames.has(normalizeClassName(row.class_name))) {
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
    ["0012345678", "Contoh Nama Siswa", "X E1", "15/05/2009", "L"],
    ["0098765432", "Contoh Nama Siswi", "XI F1", "21/08/2009", "P"],
  ];

  const worksheet = XLSX.utils.aoa_to_sheet([
    headers,
    ...exampleRows,
  ]);
  for (let row = 1; row <= exampleRows.length; row += 1) {
    const cell = worksheet[`A${row + 1}`];
    if (cell) cell.z = "@";
  }

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
    ["2. NISN harus berupa teks dan terdiri dari 10 angka; kolom NISN sudah diformat sebagai teks."],
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
    ["NIP / Identitas", "Nama Lengkap", "Status Kepegawaian", "Jabatan Utama", "Tugas Tambahan", "Wali Kelas"],
    ["000000000000000001", "Contoh Nama Guru", "Guru", "Guru Mata Pelajaran", "Wakasek Kurikulum", "X E1"],
    ["000000000000000002", "Contoh Nama Konselor", "Guru", "Guru BK", "", ""],
    ["000000000000000003", "Contoh Tenaga Kependidikan", "Tenaga Kependidikan", "Bendahara Pengeluaran", "", ""],
  ]);
  for (let row = 1; row <= 3; row += 1) {
    const cell = worksheet[`A${row + 1}`];
    if (cell) cell.z = "@";
  }
  worksheet["!cols"] = [{ wch: 24 }, { wch: 32 }, { wch: 28 }, { wch: 32 }, { wch: 32 }, { wch: 18 }];
  const instructions = XLSX.utils.aoa_to_sheet([
    ["PETUNJUK TEMPLATE IMPOR GURU/TENDIK"],
    ["1. Isi satu baris untuk satu guru atau tenaga kependidikan."],
    ["2. NIP harus berupa teks dan minimal 6 angka; kolom NIP sudah diformat sebagai teks."],
    ["3. Nama Lengkap, Status Kepegawaian, dan Jabatan Utama wajib diisi."],
    ["4. Status Kepegawaian: Guru atau Tenaga Kependidikan."],
    ["5. Tugas Tambahan boleh berisi beberapa jabatan, dipisahkan koma."],
    ["6. Wali Kelas harus sama dengan nama kelas yang terdaftar."],
    ["7. NIP duplikat di dalam file atau database akan ditolak."],
    ["8. Hapus baris contoh sebelum mengunggah data sebenarnya."],
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

    const normalizeHeader = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
    rows = rawRows.map((raw, index) => {
      const normalized: Record<string, unknown> = {};
      Object.entries(raw).forEach(([key, value]) => { normalized[normalizeHeader(key)] = value; });
      const getValue = (...keys: string[]) => keys
        .map((key) => normalized[key])
        .find((value) => value !== undefined && value !== null && value !== "");
      const nipResult = excelIdentifier(getValue("nipidentitas", "nip", "identitas"));
      const nip = nipResult.value;
      const full_name = String(getValue("namalengkap", "nama", "fullname") ?? "").trim();
      let primary_role = String(getValue("jabatanutama", "jabatan", "posisi") ?? "").trim();
      if (primary_role === "Guru BK / Konselor") primary_role = "Guru BK";
      const rawStaffCategory = String(getValue("statuskepegawaian", "status", "kategori") ?? "").trim();
      const staff_category = rawStaffCategory || (
        primary_role === "Guru BK" || primary_role === "Guru Mata Pelajaran" ? "Guru" : "Tenaga Kependidikan"
      );
      const additional_roles = String(getValue("tugastambahan", "jabatan tambahan", "jabatantambahan") ?? "")
        .split(/[,;|]/)
        .map((role) => role.trim())
        .filter((role) => role && role !== "Wali Kelas");
      const homeroom_class_name = normalizeClassName(String(getValue("walikelas", "kelaswali") ?? ""));
      const errors: string[] = [];
      if (nipResult.error) errors.push(`NIP ${nipResult.error}`);
      if (!/^\d{6,}$/.test(nip)) errors.push("NIP harus minimal 6 angka");
      if (full_name.length < 2 || full_name.length > 150) errors.push("Nama harus 2–150 karakter");
      if (!["Guru", "Tenaga Kependidikan"].includes(staff_category)) errors.push("Status Kepegawaian harus Guru atau Tenaga Kependidikan");
      const allowedRoles = staff_category === "Guru" ? ["Guru Mata Pelajaran", "Guru BK"] : staffPositionOptions;
      if (!allowedRoles.includes(primary_role)) errors.push("Jabatan Utama tidak sesuai dengan Status Kepegawaian");
      if (additional_roles.some((role) => !teacherAdditionalRoleOptions.includes(role))) {
        errors.push("Tugas Tambahan memuat jabatan yang tidak dikenal");
      }
      if (homeroom_class_name && (staff_category !== "Guru" || primary_role !== "Guru Mata Pelajaran")) {
        errors.push("Wali Kelas hanya dapat diisi untuk Guru Mata Pelajaran");
      }
      if (homeroom_class_name && !additional_roles.includes("Wali Kelas")) additional_roles.push("Wali Kelas");
      return {
        source_row: index + 2,
        nip,
        full_name,
        staff_category: staff_category as ImportTeacherRow["staff_category"],
        primary_role,
        additional_roles,
        homeroom_class_name,
        errors,
      };
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
    const { data: classRows, error: classError } = await supabase.from("classes").select("name");
    if (classError) throw classError;
    const classNames = new Set((classRows ?? []).map((item) => normalizeClassName(item.name)));
    rows.forEach((row) => {
      if (existingNips.has(row.nip)) row.errors.push("NIP sudah terdaftar di database");
      if (row.homeroom_class_name && !classNames.has(row.homeroom_class_name)) {
        row.errors.push(`Kelas wali "${row.homeroom_class_name}" tidak terdaftar`);
      }
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

    const { data: registeredClasses, error: classError } = await supabase
      .from("classes")
      .select("id, name");
    if (classError) throw classError;
    const classIds = new Map((registeredClasses ?? []).map((item) => [normalizeClassName(item.name), item.id]));
    const failedRows = new Map<number, string>();
    let importedCount = 0;
    for (const row of rowsToInsert) {
      const { error } = await supabase.rpc("save_teacher_master_data", {
        p_teacher_id: null,
        p_nip: row.nip,
        p_full_name: row.full_name,
        p_staff_category: row.staff_category,
        p_primary_role: row.primary_role,
        p_additional_roles: row.additional_roles,
        p_bk_class_ids: [],
        p_homeroom_class_id: row.homeroom_class_name ? classIds.get(row.homeroom_class_name) ?? null : null,
        p_assignments: [],
      });
      if (error) {
        failedRows.set(row.source_row, formatSupabaseError(error));
      } else {
        importedCount += 1;
      }
    }
    teachersLoadedRef.current = false;
    setTeacherReloadVersion((version) => version + 1);

    const auditWarning = await logMasterChange(
      "Data guru/tendik diimpor",
      `${importedCount} guru/tendik berhasil diimpor.`,
    );
    setTeacherImportRows((current) => current.map((row) => {
      const errors = [...row.errors];
      if (duplicateNips.has(row.nip)) errors.push("NIP sudah terdaftar di database");
      const failure = failedRows.get(row.source_row);
      if (failure) errors.push(`Gagal disimpan: ${failure}`);
      return { ...row, errors };
    }).filter((row) => row.errors.length > 0));
    setTeacherImportValidationComplete(true);
    setTeacherImportNotice(
      `${importedCount} guru/tendik berhasil diimpor.${duplicateNips.size ? ` ${duplicateNips.size} baris dilewati karena NIP sudah terdaftar.` : ""}${failedRows.size ? ` ${failedRows.size} baris gagal disimpan; rincian tersedia pada tabel validasi.` : ""}${auditWarning ? ` Audit aktivitas gagal: ${auditWarning}` : ""}`,
    );
    if (!duplicateNips.size && !failedRows.size) setTeacherImportFileName("");
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
  setImportNotice("");

  try {
    // Pastikan nama variabel client Supabase sesuai dengan file Anda.
    const { data: classes, error: classError } = await supabase
      .from("classes")
      .select("id, name");

    if (classError) throw classError;

    const classMap = new Map((classes ?? []).map((item) => [normalizeClassName(item.name), item.id]));

    const prepared = validRows.map((row) => ({
      row,
      classId: classMap.get(normalizeClassName(row.class_name)),
    }));

    const missingClasses = prepared.filter(
      (item) => !item.classId
    );

    if (missingClasses.length > 0) {
      const missingClassNames = new Set(
        missingClasses.map((item) => normalizeClassName(item.row.class_name))
      );
      setImportRows((current) => current.map((row) =>
        missingClassNames.has(normalizeClassName(row.class_name))
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
    let refreshWarning = "";
    const refreshRequest = createDataIndukRequest();
    try {
      setStudents(await fetchStudentRows(refreshRequest.signal));
      studentsLoadedRef.current = true;
    } catch (error) {
      studentsLoadedRef.current = false;
      refreshWarning = ` Daftar siswa belum dapat diperbarui: ${formatSupabaseError(error)}`;
    } finally {
      refreshRequest.dispose();
    }
    classLoadedVersionRef.current = -1;
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

    setImportNotice(
      `${rowsToInsert.length} siswa berhasil diimpor ke database.` +
      duplicateMessage +
      (auditWarning ? ` Audit aktivitas gagal: ${auditWarning}` : "") +
      refreshWarning +
      (rowsWithErrors.length
        ? ` ${rowsWithErrors.length} baris bermasalah tetap tersedia pada laporan validasi.`
        : "")
    );

    setImportRows(rowsWithErrors);
    setImportValidationComplete(true);
    if (rowsWithErrors.length === 0) {
      setImportFileName("");
      switchDataIndukMenu("siswa");
    }
  } catch (error) {
    setImportError(`Impor gagal: ${formatSupabaseError(error)}`);
  } finally {
    setImporting(false);
  }
};

const handleExportStudents = async () => {
  try {
    const data: Array<{
      nisn: string;
      full_name: string;
      class_id: string | null;
      birth_date: string | null;
      gender: string | null;
      status: string;
    }> = [];
    const pageSize = 1000;
    for (let offset = 0; ; offset += pageSize) {
      const { data: page, error } = await supabase
        .from("students")
        .select("id, nisn, full_name, class_id, birth_date, gender, status")
        .order("full_name")
        .order("id")
        .range(offset, offset + pageSize - 1);
      if (error) throw error;
      data.push(...(page ?? []));
      if ((page ?? []).length < pageSize) break;
    }

    const { data: classData, error: classError } = await supabase
      .from("classes")
      .select("id, name");
    if (classError) {
      throw new Error(`Nama kelas untuk ekspor gagal dimuat: ${formatSupabaseError(classError)}`);
    }
    const classNames = new Map((classData ?? []).map((row) => [row.id, row.name]));

    if (!data || data.length === 0) {
      alert("Belum ada data siswa di database untuk diekspor.");
      return;
    }

    const rows = data.map((student) => ({
      NISN: student.nisn,
      Nama: student.full_name,
      Kelas: student.class_id ? classNames.get(student.class_id) ?? "" : "",
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
              maxWidth: 700,
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

            <label className="di-form-label" htmlFor="teacher-staff-category">
              Status Kepegawaian
            </label>
            <select
              id="teacher-staff-category"
              className="di-search"
              value={teacherForm.staff_category}
              onChange={(event) => {
                const staffCategory = event.target.value as TeacherForm["staff_category"];
                setTeacherForm({
                  ...emptyTeacherForm,
                  nip: teacherForm.nip,
                  full_name: teacherForm.full_name,
                  staff_category: staffCategory,
                  primary_role: staffCategory === "Guru" ? "Guru Mata Pelajaran" : "Tendik Lainnya",
                });
                setTeacherFormAssignmentSubject("");
                setTeacherFormAssignmentClassIds([]);
              }}
              required
            >
              <option value="Guru">Guru</option>
              <option value="Tenaga Kependidikan">Tenaga Kependidikan</option>
            </select>

            <label className="di-form-label" htmlFor="teacher-primary-role">
              Jabatan Utama
            </label>
            <select
              id="teacher-primary-role"
              className="di-search"
              value={teacherForm.primary_role}
              onChange={(event) => {
                const primaryRole = event.target.value;
                setTeacherForm((current) => ({
                  ...current,
                  primary_role: primaryRole,
                  additional_roles: current.additional_roles.filter((role) =>
                    role === "Kepala Perpustakaan" || primaryRole === "Guru Mata Pelajaran"
                  ),
                  homeroom_class_id: "",
                  bk_class_ids: primaryRole === "Guru BK" ? current.bk_class_ids : [],
                  subject_assignments: primaryRole === "Guru Mata Pelajaran" ? current.subject_assignments : [],
                }));
                setTeacherFormAssignmentSubject("");
                setTeacherFormAssignmentClassIds([]);
              }}
              required
            >
              {(teacherForm.staff_category === "Guru"
                ? ["Guru Mata Pelajaran", "Guru BK"]
                : staffPositionOptions).map((position) => (
                <option key={position} value={position}>
                  {position}
                </option>
              ))}
            </select>

            {teacherForm.staff_category === "Guru" && teacherForm.primary_role === "Guru Mata Pelajaran" && (
              <>
                <fieldset className="di-form-fieldset">
                  <legend>Tugas Tambahan</legend>
                  {teacherAdditionalRoleOptions.map((role) => (
                    <label className="di-form-check" key={role}>
                      <input
                        type="checkbox"
                        checked={teacherForm.additional_roles.includes(role)}
                        onChange={(event) => setTeacherForm((current) => ({
                          ...current,
                          additional_roles: event.target.checked
                            ? [...new Set([...current.additional_roles, role])]
                            : current.additional_roles.filter((item) => item !== role),
                        }))}
                      />
                      {role}
                    </label>
                  ))}
                </fieldset>

                <label className="di-form-label" htmlFor="teacher-homeroom-class">
                  Wali Kelas (maksimal 1 kelas)
                </label>
                <select
                  id="teacher-homeroom-class"
                  className="di-search"
                  value={teacherForm.homeroom_class_id}
                  onChange={(event) => setTeacherForm((current) => ({
                    ...current,
                    homeroom_class_id: event.target.value,
                  }))}
                >
                  <option value="">Tidak ditugaskan sebagai wali kelas</option>
                  {classes.map((classOption) => (
                    <option key={classOption.id} value={classOption.id}>{classOption.name}</option>
                  ))}
                </select>

                <fieldset className="di-form-fieldset">
                  <legend>Mata Pelajaran &amp; Kelas yang Diajar</legend>
                  <div className="di-actions" style={{ alignItems: "stretch" }}>
                    <input
                      className="di-search"
                      list="teacher-subject-suggestions"
                      value={teacherFormAssignmentSubject}
                      onChange={(event) => setTeacherFormAssignmentSubject(event.target.value)}
                      placeholder="Pilih atau ketik mata pelajaran"
                      aria-label="Mata pelajaran"
                    />
                    <datalist id="teacher-subject-suggestions">
                      {subjectSuggestions.map((subject) => <option key={subject} value={subject} />)}
                    </datalist>
                    <button
                      type="button"
                      className="di-button"
                      onClick={() => {
                        const subject = normalizeSubjectName(teacherFormAssignmentSubject);
                        if (!subject || !teacherFormAssignmentClassIds.length) {
                          setTeacherFormError("Mata pelajaran dan minimal satu kelas wajib dipilih.");
                          return;
                        }
                        const additions = teacherFormAssignmentClassIds
                          .filter((classId) => !teacherForm.subject_assignments.some((item) =>
                            item.class_id === classId
                            && item.subject.toLocaleLowerCase("id-ID") === subject.toLocaleLowerCase("id-ID")
                          ))
                          .map((class_id) => ({ class_id, subject }));
                        if (!additions.length) {
                          setTeacherFormError("Semua kombinasi mata pelajaran dan kelas tersebut sudah ditambahkan.");
                          return;
                        }
                        setTeacherForm((current) => ({
                          ...current,
                          subject_assignments: [...current.subject_assignments, ...additions],
                        }));
                        setTeacherFormAssignmentSubject("");
                        setTeacherFormAssignmentClassIds([]);
                        setTeacherFormError("");
                      }}
                    >
                      <Plus size={14} /> Tambah
                    </button>
                  </div>
                  <div className="di-assignment-picker">
                    <div className="di-assignment-picker-heading">
                      <span>Pilih kelas (boleh lebih dari satu)</span>
                      <div>
                        <button
                          type="button"
                          className="di-link-button"
                          onClick={() => setTeacherFormAssignmentClassIds(classes.map((item) => item.id))}
                        >Pilih semua</button>
                        <button
                          type="button"
                          className="di-link-button"
                          onClick={() => setTeacherFormAssignmentClassIds([])}
                        >Batal pilih</button>
                      </div>
                    </div>
                    <div className="di-class-checklist">
                      {classes.map((classOption) => (
                        <label className="di-form-check" key={classOption.id}>
                          <input
                            type="checkbox"
                            checked={teacherFormAssignmentClassIds.includes(classOption.id)}
                            onChange={(event) => setTeacherFormAssignmentClassIds((current) =>
                              event.target.checked
                                ? [...new Set([...current, classOption.id])]
                                : current.filter((id) => id !== classOption.id)
                            )}
                          />
                          {classOption.name}
                        </label>
                      ))}
                      {!classes.length && <span className="di-assignment-empty">Belum ada kelas.</span>}
                    </div>
                    <small>{teacherFormAssignmentClassIds.length} kelas dipilih. Pilihan yang belum ditekan “Tambah” tetap ikut disimpan.</small>
                  </div>
                  <ul className="di-assignment-list">
                    {teacherForm.subject_assignments.map((assignment) => {
                      const className = classes.find((item) => item.id === assignment.class_id)?.name ?? "Kelas";
                      return (
                        <li key={`${assignment.class_id}-${assignment.subject}`}>
                          <span>{assignment.subject} · {className}</span>
                          <button
                            type="button"
                            className="di-button di-button-icon"
                            aria-label={`Hapus ${assignment.subject} dari ${className}`}
                            onClick={() => setTeacherForm((current) => ({
                              ...current,
                              subject_assignments: current.subject_assignments.filter((item) =>
                                !(item.class_id === assignment.class_id && item.subject === assignment.subject)
                              ),
                            }))}
                          >
                            <Trash2 size={14} />
                          </button>
                        </li>
                      );
                    })}
                    {!teacherForm.subject_assignments.length && <li className="di-assignment-empty">Belum ada mapel/kelas.</li>}
                  </ul>
                </fieldset>
              </>
            )}

            {teacherForm.staff_category === "Guru" && teacherForm.primary_role === "Guru BK" && (
              <fieldset className="di-form-fieldset">
                <legend>Tugas Tambahan</legend>
                <label className="di-form-check">
                  <input
                    type="checkbox"
                    checked={teacherForm.additional_roles.includes("Kepala Perpustakaan")}
                    onChange={(event) => setTeacherForm((current) => ({
                      ...current,
                      additional_roles: event.target.checked
                        ? [...new Set([...current.additional_roles, "Kepala Perpustakaan"])]
                        : current.additional_roles.filter((role) => role !== "Kepala Perpustakaan"),
                    }))}
                  />
                  Kepala Perpustakaan
                </label>
              </fieldset>
            )}

            {teacherForm.staff_category === "Guru" && teacherForm.primary_role === "Guru BK" && (
              <fieldset className="di-form-fieldset">
                <legend>Rombel Kelas Anak Asuh</legend>
                <div className="di-class-checklist">
                  {classes.map((classOption) => (
                    <label className="di-form-check" key={classOption.id}>
                      <input
                        type="checkbox"
                        checked={teacherForm.bk_class_ids.includes(classOption.id)}
                        onChange={(event) => setTeacherForm((current) => ({
                          ...current,
                          bk_class_ids: event.target.checked
                            ? [...new Set([...current.bk_class_ids, classOption.id])]
                            : current.bk_class_ids.filter((id) => id !== classOption.id),
                        }))}
                      />
                      {classOption.name}
                    </label>
                  ))}
                  {!classes.length && <span className="di-assignment-empty">Belum ada kelas.</span>}
                </div>
                <small>Siswa pada rombel terpilih disinkronkan otomatis ke daftar asuh Guru BK.</small>
              </fieldset>
            )}

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
                  setTeacherForm(emptyTeacherForm);
                  setTeacherFormAssignmentSubject("");
                  setTeacherFormAssignmentClassIds([]);
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
                placeholder="Contoh: X E1"
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
                  <option
                    key={teacher.id}
                    value={teacher.profile_id ?? teacher.id}
                  >
                    {teacher.full_name}{!teacher.profile_id ? " (belum tertaut)" : ""}
                  </option>
                ))}
                {editingClass?.homeroom_teacher_id
                  && !classTeacherOptions.some((teacher) =>
                    teacher.id === editingClass.homeroom_teacher_id
                    || teacher.profile_id === editingClass.homeroom_teacher_id
                  ) && (
                    <option value={editingClass.homeroom_teacher_id}>
                      Wali kelas tidak ditemukan (dipertahankan)
                    </option>
                  )}
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
                switchDataIndukMenu(item.id);
                setSearch("");
                if (item.id === "guru") {
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
                    setTeacherFormAssignmentSubject("");
                    setTeacherFormAssignmentClassIds([]);
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
        {activeMenu === "siswa" && studentError && students.length > 0 && (
          <div className="di-notice di-audit-error" role="alert">
            {studentError}
            <button type="button" className="di-button" onClick={() => {
              studentsLoadedRef.current = false;
              setStudentReloadVersion((version) => version + 1);
            }}>Muat ulang</button>
          </div>
        )}
        {activeMenu === "guru" && teacherAccountError && (
          <div className="di-notice">
            Status akun belum dapat diverifikasi: {teacherAccountError}
          </div>
        )}
        {activeMenu === "guru" && masterError && teachers.length > 0 && (
          <div className="di-notice di-audit-error" role="alert">
            {masterError}
            <button type="button" className="di-button" onClick={() => {
              teachersLoadedRef.current = false;
              setTeacherReloadVersion((version) => version + 1);
            }}>Muat ulang</button>
          </div>
        )}
        {activeMenu === "guru" && teacherSummaryError && (
          <div className="di-notice di-audit-error" role="alert">{teacherSummaryError}</div>
        )}
        {["siswa", "guru"].includes(activeMenu) && classOptionsError && (
          <div className="di-notice di-audit-error" role="alert">
            {classOptionsError}
            <button type="button" className="di-button" onClick={() => setClassReloadVersion((version) => version + 1)}>
              Muat ulang daftar kelas
            </button>
          </div>
        )}
        {activeMenu === "kelas" && classLoadError && (
          <div className="di-notice di-audit-error" role="alert">
            {classLoadError}
            <button type="button" className="di-button" onClick={() => setClassReloadVersion((version) => version + 1)}>Muat ulang</button>
          </div>
        )}
        {activeMenu === "kelas" && classAcademicYearError && (
          <div className="di-notice di-audit-error" role="alert">{classAcademicYearError}</div>
        )}
        {activeMenu === "kelas" && classDetailsError && (
          <div className="di-notice di-audit-error" role="alert">{classDetailsError}</div>
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

    {importError && <p style={{ color: "#b91c1c" }} role="alert">{importError}</p>}
    {importNotice && <div className="di-notice" role="status">{importNotice}</div>}

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
              Template mendukung identitas, status kepegawaian, jabatan utama, tugas tambahan, dan wali kelas.
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
                  <tr><th>Baris</th><th>NIP / Identitas</th><th>Nama Lengkap</th><th>Status</th><th>Jabatan Utama</th><th>Tugas Tambahan</th><th>Wali Kelas</th><th>Validasi</th></tr>
                </thead>
                <tbody>
                  {teacherImportRows.map((row, index) => (
                    <tr key={`${row.nip}-${row.source_row}-${index}`}>
                      <td>{row.source_row}</td>
                      <td>{row.nip}</td>
                      <td>{row.full_name}</td>
                      <td>{row.staff_category}</td>
                      <td>{row.primary_role}</td>
                      <td>{row.additional_roles.filter((role) => role !== "Wali Kelas").join(", ") || "—"}</td>
                      <td>{row.homeroom_class_name || "—"}</td>
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
                        ...teacherAdditionalRoleOptions,
                        ...teachers.flatMap((teacher) => [
                          teacherPrimaryRole(teacher),
                          ...teacherAdditionalRoles(teacher),
                        ]),
                      ])].map((position) => <option key={position} value={position}>{position}</option>)}
                    </select>
                    <select
                      className="di-search"
                      value={teacherFilterStatus}
                      onChange={(event) => setTeacherFilterStatus(event.target.value)}
                      aria-label="Filter penugasan atau akun guru"
                      style={{ width: "auto", minWidth: 170 }}
                    >
                      <option value="all">Semua Status</option>
                      <option value="no-subject">Belum punya mapel</option>
                      {userRole === "super_admin" && <option value="no-account">Belum tertaut</option>}
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
              {canDeleteCurrentMenu && ["siswa", "guru", "kelas"].includes(activeMenu) && (
                <div
                  className="di-actions"
                  style={{
                    justifyContent: "space-between",
                    flexWrap: "wrap",
                    marginTop: 12,
                    padding: "10px 12px",
                    border: "1px solid #e2e8f0",
                    borderRadius: 10,
                    background: "#f8fafc",
                  }}
                >
                  <label style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                    <input
                      type="checkbox"
                      checked={allVisibleMasterRowsSelected}
                      ref={(element) => {
                        if (element) {
                          element.indeterminate = someVisibleMasterRowsSelected && !allVisibleMasterRowsSelected;
                        }
                      }}
                      onChange={toggleVisibleMasterSelection}
                      disabled={deletingSelectedMasterData || selectableMasterIds.length === 0}
                      aria-label={`Pilih semua ${selectableMasterIds.length} data ${activeMenu} yang tampil`}
                    />
                    Pilih semua yang tampil ({selectableMasterIds.length})
                  </label>
                  <div className="di-actions">
                    <span aria-live="polite">{selectedMasterIds.length} data dipilih</span>
                    {selectedMasterIds.length > 0 && (
                      <button
                        type="button"
                        className="di-button"
                        onClick={() => setSelectedMasterIds([])}
                        disabled={deletingSelectedMasterData}
                      >
                        Batalkan pilihan
                      </button>
                    )}
                    <button
                      type="button"
                      className="di-button di-button-danger"
                      onClick={() => void handleDeleteSelectedMasterData()}
                      disabled={deletingSelectedMasterData || selectedMasterIds.length === 0}
                    >
                      <Trash2 size={14} />
                      {deletingSelectedMasterData
                        ? "Menghapus..."
                        : `Hapus terpilih${selectedMasterIds.length ? ` (${selectedMasterIds.length})` : ""}`}
                    </button>
                  </div>
                </div>
              )}
              {selectedMasterDeleteError && (
                <div className="di-notice di-audit-error" role="alert">{selectedMasterDeleteError}</div>
              )}
              {canManageDataInduk && activeMenu === "kelas" && !canDeleteMasterData && (
                <div className="di-notice" role="status">
                  Penghapusan kelas hanya tersedia untuk Super Admin sesuai izin database.
                </div>
              )}
            </div>

            <div className="di-table-wrap">
              <table
                className="di-table"
                style={activeMenu === "guru" ? {
                  tableLayout: "fixed",
                  minWidth: canDeletePeopleData ? 1180 : 1128,
                } : undefined}
              >
                {activeMenu === "guru" && (
                  <colgroup>
                    {canDeletePeopleData && <col style={{ width: 52 }} />}
                    <col style={{ width: 205 }} />
                    <col style={{ width: 250 }} />
                    <col style={{ width: 190 }} />
                    <col />
                    <col style={{ width: 245 }} />
                  </colgroup>
                )}
                <thead>
                  <tr>
                    {activeMenu === "siswa" ? (
                      <>
                        {canDeletePeopleData && <th scope="col">Pilih</th>}
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
                        {canDeletePeopleData && <th scope="col">Pilih</th>}
                        <th>NIP / Identitas</th>
                        <th>Nama</th>
                        <th>Status Kepegawaian</th>
                        <th>Jabatan &amp; Penugasan</th>
                        <th>Aksi</th>
                      </>
                    ) : (
                      <>
                        {canDeleteMasterData && <th scope="col">Pilih</th>}
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
                    loadingStudents && students.length === 0 ? (
                      <tr>
                        <td colSpan={userRole === "super_admin" ? 9 : canDeletePeopleData ? 8 : 7}>
                          <div className="di-empty">
                            Memuat data siswa dari Supabase...
                          </div>
                        </td>
                      </tr>
                    ) : studentError && students.length === 0 ? (
                      <tr>
                        <td colSpan={userRole === "super_admin" ? 9 : canDeletePeopleData ? 8 : 7}>
                          <div className="di-empty">
                            <strong>Data siswa gagal dimuat</strong>
                            <p>{studentError}</p>
                            <button
                              type="button"
                              className="di-button"
                              onClick={() => {
                                studentsLoadedRef.current = false;
                                setStudentReloadVersion((version) => version + 1);
                              }}
                            >
                              Muat ulang
                            </button>
                          </div>
                        </td>
                      </tr>
                    ) : filteredStudents.length === 0 ? (
                      <tr>
                        <td colSpan={userRole === "super_admin" ? 9 : canDeletePeopleData ? 8 : 7}>
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
                          {canDeletePeopleData && (
                            <td>
                              <input
                                type="checkbox"
                                checked={selectedMasterIdSet.has(student.id)}
                                onChange={() => toggleMasterRowSelection(student.id)}
                                disabled={deletingSelectedMasterData}
                                aria-label={`Pilih siswa ${student.full_name}`}
                              />
                            </td>
                          )}
                          <td>{student.nisn}</td>
                          <td title={student.profile_id ? "Akun siswa terhubung ke Data Induk" : "Akun siswa belum tertaut"}>
                            {student.full_name}
                          </td>
                          <td>{studentClassName(student) || "Belum ditentukan"}</td>
                          <td>{student.birth_date ?? "—"}</td>
                          <td>{student.gender ?? "—"}</td>
                          <td>{student.status}</td>
                          {userRole === "super_admin" && (
                            <td>
                              <span>{getStudentAccountStatus(student)}</span>
                              {!student.profile_id &&
                                (!studentAccounts || getStudentAccountStatus(student) === "Belum Ada Akun")
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
                    teacherLoading && teachers.length === 0 ? <tr><td colSpan={canDeletePeopleData ? 6 : 5}><div className="di-empty">Memuat data guru &amp; tendik...</div></td></tr>
                    : masterError && teachers.length === 0 ? <tr><td colSpan={canDeletePeopleData ? 6 : 5}><div className="di-empty"><strong>Gagal memuat data</strong><p>{masterError}</p><button type="button" className="di-button" onClick={() => { teachersLoadedRef.current = false; setTeacherReloadVersion((version) => version + 1); }}>Muat ulang</button></div></td></tr>
                    : filteredTeachers.length === 0 ? <tr><td colSpan={canDeletePeopleData ? 6 : 5}><div className="di-empty"><strong>Data guru/tendik tidak ditemukan</strong><p>Ubah kata kunci atau filter, atau tambahkan data menggunakan tombol Tambah Data.</p></div></td></tr>
                    : filteredTeachers.map((teacher) => {
                      const primaryRole = teacherPrimaryRole(teacher);
                      const extraRoles = teacherAdditionalRoles(teacher).filter((role) => role !== "Wali Kelas");
                      const assignments = teacherAssignmentSummary.filter((item) => item.teacher_id === teacher.id);
                      const subjects = [...new Set(assignments.map((item) => item.subject))];
                      const assignedClassCount = new Set(assignments.map((item) => item.class_id)).size;
                      const homeroomClasses = teacherHomeroomSummary
                        .filter((item) => teacherOwnsHomeroomAssignment(teacher, item.homeroom_teacher_id))
                        .map((item) => item.name);
                      const bkClassNames = (teacher.bk_class_ids ?? [])
                        .map((id) => classes.find((classItem) => classItem.id === id)?.name)
                        .filter((name): name is string => Boolean(name));
                      const account = getTeacherManagedAccount(teacher);
                      const canGenerateAccount = userRole === "super_admin"
                        && !teacher.profile_id
                        && /^\d{6,}$/.test(teacher.nip?.trim() ?? "")
                        && account?.role !== "siswa";
                      return (
                        <tr key={teacher.id}>
                          {canDeletePeopleData && (
                            <td>
                              <input
                                type="checkbox"
                                checked={selectedMasterIdSet.has(teacher.id)}
                                onChange={() => toggleMasterRowSelection(teacher.id)}
                                disabled={deletingSelectedMasterData}
                                aria-label={`Pilih data guru/tendik ${teacher.full_name}`}
                              />
                            </td>
                          )}
                          <td>
                            <span className="di-nip">{teacher.nip || "—"}</span>
                          </td>
                          <td className="di-teacher-name">{teacher.full_name}</td>
                          <td className="di-teacher-status">{teacherStaffCategory(teacher)}</td>
                          <td className="di-teacher-assignments">
                            <div className="di-role-tags">
                              <span className="di-role-tag di-role-tag-primary">{primaryRole}</span>
                              {extraRoles.map((role) => <span className="di-role-tag" key={role}>{role}</span>)}
                              {homeroomClasses.map((className) => (
                                <span className="di-role-tag" key={`wali-${className}`}>Wali Kelas {className}</span>
                              ))}
                            </div>
                            {teacherSummaryError ? (
                              <small className="di-assignment-note">Ringkasan penugasan tidak tersedia</small>
                            ) : primaryRole === "Guru Mata Pelajaran" ? (
                              <small className="di-assignment-note">
                                {subjects.length
                                  ? `${subjects.slice(0, 3).join(", ")}${subjects.length > 3 ? ` +${subjects.length - 3}` : ""} · ${assignedClassCount} kelas`
                                  : "Belum ditugaskan"}
                              </small>
                            ) : primaryRole === "Guru BK" ? (
                              <small className="di-assignment-note">
                                {bkClassNames.length ? `Rombel asuh: ${bkClassNames.join(", ")}` : "Belum ada rombel asuh"}
                              </small>
                            ) : null}
                          </td>
                          <td className="di-teacher-actions">
                            <div className="di-actions">
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
                                    : account ? "Tautkan Akun" : teacherAccounts ? "Generate Akun" : "Periksa / Tautkan Akun"}
                                </button>
                              )}
                              <button type="button" className="di-button di-button-icon" aria-label={`Edit data ${teacher.full_name}`} title={`Edit ${teacher.full_name}`} onClick={() => void handleEditTeacher(teacher)}>
                                <Pencil size={15} />
                              </button>
                              {canDeletePeopleData && (
                                <button type="button" className="di-button di-button-danger" onClick={() => void handleDeleteTeacher(teacher)}>
                                  <Trash2 size={14} />Hapus
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    classLoading && classRows.length === 0 ? <tr><td colSpan={canDeleteMasterData ? 7 : 6}><div className="di-empty">Memuat data kelas...</div></td></tr>
                    : classLoadError && classRows.length === 0 ? <tr><td colSpan={canDeleteMasterData ? 7 : 6}><div className="di-empty"><strong>Gagal memuat data kelas</strong><p>{classLoadError}</p><button type="button" className="di-button" onClick={() => setClassReloadVersion((version) => version + 1)}>Muat ulang</button></div></td></tr>
                    : filteredClasses.length === 0 ? <tr><td colSpan={canDeleteMasterData ? 7 : 6}><div className="di-empty"><strong>Belum ada data kelas</strong><p>Pastikan tahun ajaran sudah dibuat, lalu tambahkan kelas.</p></div></td></tr>
                    : filteredClasses.map(c => <tr key={c.id}>
                      {canDeleteMasterData && (
                        <td>
                          <input
                            type="checkbox"
                            checked={selectedMasterIdSet.has(c.id)}
                            onChange={() => toggleMasterRowSelection(c.id)}
                            disabled={deletingSelectedMasterData}
                            aria-label={`Pilih kelas ${c.name}`}
                          />
                        </td>
                      )}
                      <td>{c.name}</td><td>{c.grade_level}</td><td>{c.academic_year_name}</td><td>{c.homeroom_teacher_name}</td><td>{c.student_count}</td><td><div className="di-actions"><button type="button" className="di-button di-button-icon" aria-label={`Edit kelas ${c.name}`} title={`Edit ${c.name}`} onClick={() => void handleEditClass(c)}><Pencil size={15} /></button>{canDeleteMasterData && <button type="button" className="di-button di-button-danger" onClick={() => void handleDeleteClass(c)}><Trash2 size={14} />Hapus</button>}</div></td>
                    </tr>)
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
