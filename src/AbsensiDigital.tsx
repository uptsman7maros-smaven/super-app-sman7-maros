import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getValidSupabaseSession, supabase } from "./lib/supabase";
import * as XLSX from "xlsx";
import jsQR from "jsqr";
import {
  CalendarDays, Camera, CheckCircle2, ClipboardCopy, Download, FileSpreadsheet,
  Search, ShieldCheck, Stethoscope, UserCheck, XCircle, BellRing, Settings2
} from "lucide-react";
import "./AbsensiDigital.css";
import "./AbsensiDigitalQr.css";
import { QRCodeSVG } from "qrcode.react";
import type { SchoolUser } from "./context/school-context";
import { useSchoolContext } from "./context/useSchoolContext";
import { SchoolLetterheadPicker, SchoolLetterheadPreview } from "./components/shared/SchoolLetterheadPicker";
import { getSchoolLetterhead, type LetterheadSlot } from "./services/masterDataService";
import { normalizeSubjectName } from "./services/subjectCatalog";

type AttendanceStatus = "hadir" | "sakit" | "izin" | "terlambat" | "alpa" | "pulang";
type AttendanceRowStatus = AttendanceStatus | "belum_tercatat";
type PersonType = "siswa" | "guru_tendik";
type AttendanceRow = {
  id: string; attendance_date: string; person_type: PersonType;
  person_identifier: string; person_name: string; class_name: string | null;
  status: AttendanceRowStatus; note: string | null; created_at: string;
  session_type?: AttendanceQrSessionType | null;
  subject?: string | null;
  teacher_name?: string | null;
};
type AttendanceQrSessionType = "school_arrival" | "school_departure" | "subject";
type AttendanceQrSession = {
  session_id: string;
  token: string;
  session_type: AttendanceQrSessionType;
  subject: string | null;
  class_name: string | null;
  teacher_name: string | null;
  attendance_date: string;
  expires_at: string | null;
  token_expires_at: string;
};
type AttendanceQrSubmission = {
  session_type: AttendanceQrSessionType;
  subject: string | null;
  attendance_status: "hadir" | "terlambat" | "pulang" | "izin" | "sakit";
  attendance_date: string;
  already_recorded: boolean;
  qr_record_id: string | null;
};
type AttendanceScheduleSettings = {
  automation_enabled: boolean;
  arrival_start_time: string;
  arrival_ontime_until: string;
  arrival_absent_at: string;
  arrival_qr_duration_minutes: number;
  departure_scan_from: string;
  departure_qr_duration_minutes: number;
  bk_alert_at: string;
};
type AttendanceSchoolClosure = { school_date: string; description: string };
type StudentAttendanceQr = {
  session_type: "school_arrival" | "school_departure";
  token: string;
  expires_at: string;
};
type AdminBroadcastQr = {
  session_id: string;
  token: string;
  expires_at: string;
};
type HomeroomWeeklyAttendanceRow = {
  class_id: string;
  class_name: string;
  grade_level: number;
  attendance_date: string;
  student_id: string;
  person_identifier: string;
  person_name: string;
  gender: "L" | "P" | null;
  status: AttendanceRowStatus;
  note: string | null;
  recorded_at: string | null;
  is_effective_day: boolean;
};
const initialAttendanceSchedule: AttendanceScheduleSettings = {
  automation_enabled: false,
  arrival_start_time: "06:00",
  arrival_ontime_until: "07:30",
  arrival_absent_at: "10:00",
  arrival_qr_duration_minutes: 240,
  departure_scan_from: "15:40",
  departure_qr_duration_minutes: 120,
  bk_alert_at: "16:00",
};
type AttendanceQrExportRecord = {
  attendance_date: string;
  person_identifier: string;
  person_name: string;
  class_name: string | null;
  session_type: AttendanceQrSessionType;
  subject: string | null;
  teacher_name: string | null;
  status: AttendanceRowStatus;
  note: string | null;
  is_voided: boolean;
  created_at: string;
};
function isAttendanceQrSession(value: unknown): value is AttendanceQrSession {
  if (!value || typeof value !== "object") return false;
  const session = value as Record<string, unknown>;
  return typeof session.session_id === "string"
    && typeof session.token === "string"
    && (session.session_type === "school_arrival" || session.session_type === "school_departure" || session.session_type === "subject")
    && (session.subject === null || typeof session.subject === "string")
    && (session.class_name === null || typeof session.class_name === "string")
    && (session.teacher_name === null || typeof session.teacher_name === "string")
    && typeof session.attendance_date === "string"
    && (session.expires_at === null || typeof session.expires_at === "string")
    && typeof session.token_expires_at === "string";
}
function isAttendanceQrSubmission(value: unknown): value is AttendanceQrSubmission {
  if (!value || typeof value !== "object") return false;
  const result = value as Record<string, unknown>;
  return (result.session_type === "school_arrival" || result.session_type === "school_departure" || result.session_type === "subject")
    && (result.subject === null || typeof result.subject === "string")
    && (result.attendance_status === "hadir" || result.attendance_status === "terlambat" || result.attendance_status === "pulang" || result.attendance_status === "izin" || result.attendance_status === "sakit")
    && typeof result.attendance_date === "string"
    && typeof result.already_recorded === "boolean"
    && (result.qr_record_id === null || typeof result.qr_record_id === "string");
}
const isStudentAttendanceQr = (value: unknown): value is StudentAttendanceQr => {
  if (!value || typeof value !== "object") return false;
  const session = value as Record<string, unknown>;
  return (session.session_type === "school_arrival" || session.session_type === "school_departure")
    && typeof session.token === "string"
    && typeof session.expires_at === "string";
};
function getWhatsAppResult(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const result = value as Record<string, unknown>;
  return {
    sent: typeof result.sent === "boolean" ? result.sent : null,
    reason: typeof result.reason === "string" ? result.reason : null,
    detail: typeof result.detail === "string" ? result.detail : null,
  };
}
function isAttendanceQrSchemaUnavailable(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const result = error as Record<string, unknown>;
  return result.code === "42P01" || result.code === "PGRST205";
}
function attendanceQrToken(value: string) {
  return value.trim().replace(/^SMAN7ABSENSI\|/i, "");
}
function attendanceStudentQrToken(value: string) {
  return value.trim().replace(/^SMAN7SISWA\|/i, "");
}
type AttendanceIdentity = {
  personType: PersonType;
  identifier: string;
  name: string;
  className: string | null;
};
type TeacherAttendanceAssignment = {
  assignment_id: string;
  subject: string;
  class_id: string;
  class_name: string;
  grade_level: number;
};
type IdentityLookupState = "idle" | "loading" | "found" | "not-found" | "error";
type BarcodeDetectorConstructor = new (options?: { formats?: string[] }) => {
  detect(source: HTMLVideoElement): Promise<{ rawValue?: string }[]>;
};
type BarcodeDetectorWindow = Window & { BarcodeDetector?: BarcodeDetectorConstructor };
type AttendanceExportRow = Pick<
  AttendanceRow,
  "attendance_date" | "person_type" | "person_identifier" | "person_name" | "class_name" | "status" | "note" | "created_at"
>;
type AttendanceView = "personal" | "subjects" | "homeroom" | "monitor" | "admin";
type AttendanceUserCategory = "guru" | "tendik" | "siswa";
type MonthlyAttendanceReportRow = {
  attendance_date: string;
  person_identifier: string;
  person_name: string;
  person_type: PersonType;
  class_name: string | null;
  status: AttendanceRowStatus;
  note: string | null;
  session_type: AttendanceQrSessionType | null;
  subject: string | null;
  teacher_name: string | null;
  user_category: AttendanceUserCategory;
  created_at: string;
};
type EmployeeClassification = {
  category: "guru" | "tendik";
  teacherRole: "guru_bk" | "guru" | "tendik";
};
const attendancePageSize = 1000;
const attendanceTimezone = "Asia/Makassar";
const attendanceHistoryWindowMs = 6 * 24 * 60 * 60 * 1000;
const studentQrPrefix = "SMAN7SISWA|";
const defaultWeeklyReportTemplate = `<h1>REKAPITULASI KEHADIRAN MINGGUAN PESERTA DIDIK (ABSENSI DIGITAL)</h1>
<p>Kelas: {{nama_kelas}}</p>
<p>Guru Pengampu / Wali Kelas: {{wali_kelas}}</p>
<p>Periode: {{periode_minggu}}</p>
{{kop_surat}}
{{baris_siswa}}`;
const defaultMonthlyReportTemplate = `<h1>{{judul_rekap}}</h1>
{{kop_surat}}
<p><strong>Kategori:</strong> {{kategori_pengguna}}</p>
<p><strong>Periode:</strong> {{bulan_tahun}}</p>
{{ringkasan_rekap}}
{{tabel_rekap_bulanan}}
<p class="report-date">Diunduh pada {{tanggal_unduh}}</p>
<div class="report-signature"><p>Kepala Sekolah</p><br><strong>{{kepala_sekolah}}</strong><br>NIP. {{nip_kepala_sekolah}}</div>`;
const statuses: {value: AttendanceStatus; label: string}[] = [
  {value:"hadir",label:"Hadir"}, {value:"sakit",label:"Sakit"},
  {value:"izin",label:"Izin"}, {value:"terlambat",label:"Terlambat"},
  {value:"alpa",label:"Alpa"}
];
const today = () => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: attendanceTimezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  if (!year || !month || !day) throw new Error("Tanggal absensi sekolah tidak dapat ditentukan.");
  return `${year}-${month}-${day}`;
};
const mondayOfWeek = (date: string) => {
  const [year, month, day] = date.split("-").map(Number);
  const localDate = new Date(Date.UTC(year, month - 1, day));
  const weekday = localDate.getUTCDay();
  localDate.setUTCDate(localDate.getUTCDate() - ((weekday + 6) % 7));
  return localDate.toISOString().slice(0, 10);
};
const statusLabel = (s: AttendanceStatus | "belum_tercatat") =>
  s === "pulang" ? "Pulang" : s === "belum_tercatat" ? "Belum tercatat" : statuses.find(x => x.value === s)?.label ?? s;
const relatedName = (value: unknown) => {
  const item = Array.isArray(value) ? value[0] : value;
  if (item && typeof item === "object" && "name" in item) {
    return String(item.name ?? "");
  }
  return "";
};
const errorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "message" in error) {
    return String(error.message);
  }
  return String(error);
};
const escapeAttendanceHtml = (value: string) => value
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#39;");
function sanitizeAttendanceTemplateHtml(value: string) {
  if (typeof DOMParser === "undefined") return escapeAttendanceHtml(value);
  const allowedTags = new Set([
    "p", "br", "strong", "b", "em", "i", "u", "s", "span", "div",
    "h1", "h2", "h3", "h4", "h5", "h6", "table", "thead", "tbody",
    "tfoot", "tr", "th", "td", "ul", "ol", "li", "blockquote",
  ]);
  const allowedStyles = new Set([
    "text-align", "vertical-align", "width", "border", "border-collapse",
    "padding", "font-size", "font-weight", "color", "background-color",
  ]);
  const parsed = new DOMParser().parseFromString(value, "text/html");
  const sanitizeNode = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return escapeAttendanceHtml(node.textContent ?? "");
    if (!(node instanceof Element)) return "";
    const tag = node.tagName.toLowerCase();
    if (tag === "style") {
      const css = node.textContent ?? "";
      if (css.length <= 20_000 && !/@import|url\s*\(|expression\s*\(|javascript:|<\/style/i.test(css)) {
        return `<style>${css.replaceAll("<", "\\3c ")}</style>`;
      }
      return "";
    }
    if (["script", "iframe", "object", "embed", "form", "input", "button"].includes(tag)) return "";
    const children = [...node.childNodes].map(sanitizeNode).join("");
    if (!allowedTags.has(tag)) return children;
    const attributes: string[] = [];
    for (const attribute of [...node.attributes]) {
      if (["colspan", "rowspan", "scope", "class"].includes(attribute.name)) {
        attributes.push(`${attribute.name}="${escapeAttendanceHtml(attribute.value)}"`);
      } else if (attribute.name === "style") {
        const styles = attribute.value.split(";").flatMap((declaration) => {
          const [name, ...parts] = declaration.split(":");
          const property = name?.trim().toLowerCase();
          const styleValue = parts.join(":").trim();
          if (!property || !allowedStyles.has(property) || /url|expression|[<>]/i.test(styleValue)) return [];
          return [`${property}:${escapeAttendanceHtml(styleValue)}`];
        });
        if (styles.length) attributes.push(`style="${styles.join(";")}"`);
      }
    }
    const attributeText = attributes.length ? ` ${attributes.join(" ")}` : "";
    return tag === "br" ? `<br${attributeText}>` : `<${tag}${attributeText}>${children}</${tag}>`;
  };
  return [...parsed.body.childNodes].map(sanitizeNode).join("");
}
const remainingTimeLabel = (expiresAt: string, now: number) => {
  const seconds = Math.max(0, Math.ceil((Date.parse(expiresAt) - now) / 1000));
  return `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
};
const formatWitaTime = (value: string) => new Intl.DateTimeFormat("id-ID", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: attendanceTimezone,
}).format(new Date(value));
const weeklyStatusCode: Partial<Record<AttendanceRowStatus, "H" | "T" | "S" | "I" | "A">> = {
  hadir: "H",
  terlambat: "T",
  sakit: "S",
  izin: "I",
  alpa: "A",
};
const isTeacherAttendanceAssignment = (
  value: unknown,
): value is TeacherAttendanceAssignment => {
  if (typeof value !== "object" || value === null) return false;
  const row = value as Record<string, unknown>;
  return typeof row.assignment_id === "string"
    && typeof row.subject === "string"
    && typeof row.class_id === "string"
    && typeof row.class_name === "string"
    && typeof row.grade_level === "number";
};

type AbsensiDigitalProps = {
  userRole?: string;
  currentUser?: SchoolUser | null;
};

export default function AbsensiDigital({ userRole = "", currentUser }: AbsensiDigitalProps) {
  const { schoolSettings } = useSchoolContext();
  const [date, setDate] = useState(today());
  const [letterheadSlot, setLetterheadSlot] = useState<LetterheadSlot>("1");
  const [month, setMonth] = useState(today().slice(0,7));
  const [personType, setPersonType] = useState<PersonType>("siswa");
  const [identifier, setIdentifier] = useState("");
  const [personName, setPersonName] = useState("");
  const [className, setClassName] = useState("");
  const [status, setStatus] = useState<AttendanceStatus>("hadir");
  const [note, setNote] = useState("");
  const [rows, setRows] = useState<AttendanceRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("");
  const printHeader = getSchoolLetterhead(schoolSettings, letterheadSlot);
  const [cameraOn, setCameraOn] = useState(false);
  const [waEnabled, setWaEnabled] = useState(false);
  const [waTemplate, setWaTemplate] = useState("Assalamu’alaikum Bapak/Ibu,\n\nKami informasikan bahwa putra/putri Bapak/Ibu, *{nama}*, tercatat *{status}* pada *{tanggal} pukul {jam}*.\n\nTerima kasih atas perhatian Bapak/Ibu.");
  const [waSaving, setWaSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [identity, setIdentity] = useState<AttendanceIdentity | null>(null);
  const [identityLoading, setIdentityLoading] = useState(false);
  const [identityError, setIdentityError] = useState("");
  const [identityLookup, setIdentityLookup] = useState<IdentityLookupState>("idle");
  const [identityLookupMessage, setIdentityLookupMessage] = useState("");
  const [verifiedIdentifier, setVerifiedIdentifier] = useState("");
  const [studentQrToken, setStudentQrToken] = useState("");
  const [qrSubject, setQrSubject] = useState("");
  const [qrClassId, setQrClassId] = useState("");
  const [subjectFilter, setSubjectFilter] = useState("all");
  const [subjectClassFilter, setSubjectClassFilter] = useState("all");
  const [qrAttendanceStatus, setQrAttendanceStatus] = useState<"hadir" | "izin" | "sakit">("hadir");
  const [qrAttendanceNote, setQrAttendanceNote] = useState("");
  const [teacherSubjectAssignments, setTeacherSubjectAssignments] = useState<TeacherAttendanceAssignment[]>([]);
  const [teacherSubjectAssignmentsLoading, setTeacherSubjectAssignmentsLoading] = useState(false);
  const [qrSession, setQrSession] = useState<AttendanceQrSession | null>(null);
  const [qrBusy, setQrBusy] = useState(false);
  const [qrError, setQrError] = useState("");
  const [manualQrValue, setManualQrValue] = useState("");
  const [copiedQrToken, setCopiedQrToken] = useState("");
  const [adminArrivalQr, setAdminArrivalQr] = useState<AdminBroadcastQr | null>(null);
  const [adminDepartureQr, setAdminDepartureQr] = useState<AdminBroadcastQr | null>(null);
  const [arrivalQrDuration, setArrivalQrDuration] = useState(30);
  const [departureQrDuration, setDepartureQrDuration] = useState(30);
  const [arrivalQrLoading, setArrivalQrLoading] = useState(false);
  const [arrivalQrError, setArrivalQrError] = useState("");
  const [arrivalQrNotice, setArrivalQrNotice] = useState("");
  const [departureQrLoading, setDepartureQrLoading] = useState(false);
  const [departureQrError, setDepartureQrError] = useState("");
  const [departureQrNotice, setDepartureQrNotice] = useState("");
  const [weeklyStartDate, setWeeklyStartDate] = useState(() => mondayOfWeek(today()));
  const [serverClockOffsetMs, setServerClockOffsetMs] = useState(0);
  const [scheduleSettings, setScheduleSettings] = useState<AttendanceScheduleSettings>(initialAttendanceSchedule);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const [scheduleError, setScheduleError] = useState("");
  const [scheduleNotice, setScheduleNotice] = useState("");
  const [schoolClosures, setSchoolClosures] = useState<AttendanceSchoolClosure[]>([]);
  const [closureDate, setClosureDate] = useState("");
  const [closureDescription, setClosureDescription] = useState("");
  const [closureSaving, setClosureSaving] = useState(false);
  const [myStudentQrs, setMyStudentQrs] = useState<StudentAttendanceQr[]>([]);
  const [studentQrLoading, setStudentQrLoading] = useState(false);
  const [studentQrError, setStudentQrError] = useState("");
  const [clockNow, setClockNow] = useState(0);
  const [homeroomRows, setHomeroomRows] = useState<HomeroomWeeklyAttendanceRow[]>([]);
  const [homeroomLoading, setHomeroomLoading] = useState(false);
  const [homeroomError, setHomeroomError] = useState("");
  const [weeklyTemplate, setWeeklyTemplate] = useState(defaultWeeklyReportTemplate);
  const [weeklyTemplateFileName, setWeeklyTemplateFileName] = useState("");
  const [weeklyTemplateLoading, setWeeklyTemplateLoading] = useState(false);
  const [weeklyTemplateSaving, setWeeklyTemplateSaving] = useState(false);
  const [weeklyTemplateError, setWeeklyTemplateError] = useState("");
  const [weeklyTemplateNotice, setWeeklyTemplateNotice] = useState("");
  const weeklyTemplateInputRef = useRef<HTMLInputElement>(null);
  const [attendanceView, setAttendanceView] = useState<AttendanceView>(() =>
    ["super_admin", "operator"].includes(currentUser?.role ?? userRole) ? "admin" : "personal",
  );
  const [adminCategory, setAdminCategory] = useState<"all" | AttendanceUserCategory>("all");
  const [adminTeacherFilter, setAdminTeacherFilter] = useState<"all" | "guru" | "guru_bk">("all");
  const [employeeClassifications, setEmployeeClassifications] = useState<Map<string, EmployeeClassification>>(new Map());
  const [monthlyReportRows, setMonthlyReportRows] = useState<MonthlyAttendanceReportRow[]>([]);
  const [monthlyLoadedMonth, setMonthlyLoadedMonth] = useState("");
  const [monthlyReportLoading, setMonthlyReportLoading] = useState(false);
  const [monthlyReportError, setMonthlyReportError] = useState("");
  const [monthlyTemplate, setMonthlyTemplate] = useState(defaultMonthlyReportTemplate);
  const [monthlyTemplateFileName, setMonthlyTemplateFileName] = useState("");
  const [monthlyTemplateError, setMonthlyTemplateError] = useState("");
  const monthlyTemplateInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanTimer = useRef<number | null>(null);
  const cameraModeRef = useRef<"identity" | "attendance">("identity");
  const cameraScanHandlersRef = useRef<{
    attendance: (value: string) => void;
    identity: (value: string) => void;
  }>({ attendance: () => undefined, identity: () => undefined });
  const loadRequestRef = useRef(0);
  const role = currentUser?.role ?? userRole;
  const isSelfService = [
    "siswa", "guru", "guru_bk", "tendik", "staff_tata_usaha", "kepala_tata_usaha",
  ].includes(role);
  const isTeacher = role === "guru";
  const isHomeroomTeacher = role === "guru" || role === "guru_bk";
  const isAdminMonitor = role === "super_admin";
  const canManageAttendance = ["super_admin", "operator"].includes(role);
  const canRecordAttendance = isSelfService || canManageAttendance;
  const canViewAllAttendance = ["super_admin", "operator", "kepala_sekolah", "kepala_tata_usaha", "staff_tata_usaha"].includes(role);
  const canManageWhatsapp = ["super_admin", "operator", "kepala_sekolah"].includes(role);

  useEffect(() => {
    if (!canManageAttendance) return;

    let active = true;
    const loadEmployeeClassifications = async () => {
      try {
        const [teachersResult, profilesResult] = await Promise.all([
          supabase.from("teachers").select("nip,profile_id,staff_category,primary_role"),
          supabase.from("profiles")
            .select("id,username,role")
            .in("role", ["guru", "guru_bk", "tendik", "staff_tata_usaha", "kepala_tata_usaha"]),
        ]);
        if (teachersResult.error) throw teachersResult.error;
        if (profilesResult.error) throw profilesResult.error;

        const profilesById = new Map((profilesResult.data ?? []).map((profile) => [
          profile.id,
          profile.role as string,
        ]));
        const profilesByUsername = new Map((profilesResult.data ?? []).map((profile) => [
          profile.username.trim(),
          profile.role as string,
        ]));
        const classifications = new Map<string, EmployeeClassification>();
        (teachersResult.data ?? []).forEach((teacher) => {
          if (!teacher.nip) return;
          const accountRole = (teacher.profile_id ? profilesById.get(teacher.profile_id) : undefined)
            ?? profilesByUsername.get(teacher.nip.trim());
          const isTeacherRole = teacher.staff_category === "Guru"
            || teacher.primary_role === "Guru BK"
            || accountRole === "guru"
            || accountRole === "guru_bk";
          classifications.set(teacher.nip.trim(), {
            category: isTeacherRole ? "guru" : "tendik",
            teacherRole: teacher.primary_role === "Guru BK" || accountRole === "guru_bk"
              ? "guru_bk"
              : isTeacherRole ? "guru" : "tendik",
          });
        });
        if (active) {
          setEmployeeClassifications(classifications);
          setMonthlyReportError("");
        }
      } catch (classificationError) {
        if (active) {
          setMonthlyReportError(
            `Kategori Guru/Tendik gagal dimuat dari Data Induk: ${errorMessage(classificationError)}`,
          );
        }
      }
    };

    void loadEmployeeClassifications();
    return () => { active = false; };
  }, [canManageAttendance]);

  useEffect(() => {
    if (!isSelfService) return;

    let active = true;
    const loadIdentity = async () => {
      setIdentity(null);
      setIdentityError("");
      setIdentityLoading(true);
      try {
        if (!currentUser) {
          throw new Error("Sesi akun tidak tersedia. Silakan masuk kembali.");
        }

        const expectedType: PersonType = role === "siswa" ? "siswa" : "guru_tendik";
        const isLinked = role === "siswa"
          ? Boolean(currentUser.student_id)
          : Boolean(currentUser.teacher_id);
        const identifier = currentUser.nip_or_nisn.trim();
        if (!isLinked || !identifier) {
          throw new Error(role === "siswa"
            ? "Data siswa untuk akun ini tidak ditemukan di Data Induk."
            : "Akun guru/BK/tendik belum ditautkan ke Data Induk.");
        }

        if (active) {
          setIdentity({
            personType: expectedType,
            identifier,
            name: currentUser.full_name,
            className: role === "siswa" ? currentUser.class_name : null,
          });
        }
      } catch (loadError) {
        if (active) setIdentityError(errorMessage(loadError));
      } finally {
        if (active) setIdentityLoading(false);
      }
    };

    void loadIdentity();
    return () => { active = false; };
  }, [currentUser, isSelfService, role]);

  useEffect(() => {
    if (!isTeacher || !currentUser) return;

    let active = true;
    const loadTeacherSubjectAssignments = async () => {
      setTeacherSubjectAssignmentsLoading(true);
      setQrError("");
      try {
        const { data, error: assignmentError } = await supabase.rpc(
          "get_my_attendance_subject_assignments",
        );
        if (assignmentError) throw assignmentError;
        if (!Array.isArray(data) || !data.every(isTeacherAttendanceAssignment)) {
          throw new Error("Daftar penugasan mata pelajaran tidak valid.");
        }
        const normalizedAssignments = [
          ...new Map(data.map((assignment) => {
            const normalizedAssignment = {
              ...assignment,
              subject: normalizeSubjectName(assignment.subject),
            };
            return [
              JSON.stringify([normalizedAssignment.subject, normalizedAssignment.class_id]),
              normalizedAssignment,
            ] as const;
          })).values(),
        ];
        if (active) {
          setTeacherSubjectAssignments(normalizedAssignments);
          if (normalizedAssignments.length === 0) {
            setQrError(
              "Belum ada penugasan mata pelajaran dan kelas untuk akun ini. Hubungi admin/operator di Data Induk.",
            );
            setQrSubject("");
            setQrClassId("");
          } else {
            const initialSubject = normalizedAssignments[0].subject;
            setQrSubject(initialSubject);
            setQrClassId(
              normalizedAssignments.find((assignment) => assignment.subject === initialSubject)?.class_id ?? "",
            );
          }
        }
      } catch (assignmentError) {
        if (active) {
          setTeacherSubjectAssignments([]);
          setQrError(
            `Penugasan mapel gagal dimuat: ${errorMessage(assignmentError)}`,
          );
        }
      } finally {
        if (active) setTeacherSubjectAssignmentsLoading(false);
      }
    };

    void loadTeacherSubjectAssignments();
    return () => {
      active = false;
    };
  }, [currentUser, isTeacher]);

  const loadRows = useCallback(async () => {
    const requestId = ++loadRequestRef.current;
    setLoading(true);
    setError("");
    if (isSelfService && !identity) {
      setRows([]);
      setLoading(false);
      return;
    }
    try {
      const loadedRows: AttendanceRow[] = [];
      let offset = 0;
      while (true) {
        const attendanceQuery = supabase
          .from("attendance_records")
          .select("id,attendance_date,person_type,person_identifier,person_name,class_name,status,note,created_at");
        const historyQuery = role === "siswa"
          ? attendanceQuery.gte("created_at", new Date(Date.now() - attendanceHistoryWindowMs).toISOString())
          : attendanceQuery.eq("attendance_date", date);
        const scopedQuery = isSelfService && identity
          ? historyQuery
            .eq("person_type", identity.personType)
            .eq("person_identifier", identity.identifier)
          : historyQuery;
        const { data, error: queryError } = await scopedQuery
          .order("created_at", {ascending:false})
          .range(offset, offset + attendancePageSize - 1);
        if (queryError) throw queryError;

        const page = (data ?? []) as AttendanceRow[];
        loadedRows.push(...page);
        if (page.length < attendancePageSize) break;
        offset += attendancePageSize;
      }

      if (isHomeroomTeacher) {
        let studentOffset = 0;
        while (true) {
          const { data, error: studentAttendanceError } = await supabase
            .from("attendance_records")
            .select("id,attendance_date,person_type,person_identifier,person_name,class_name,status,note,created_at")
            .eq("person_type", "siswa")
            .eq("attendance_date", date)
            .order("created_at", { ascending: false })
            .range(studentOffset, studentOffset + attendancePageSize - 1);
          if (studentAttendanceError) throw studentAttendanceError;
          const page = (data ?? []) as AttendanceRow[];
          loadedRows.push(...page);
          if (page.length < attendancePageSize) break;
          studentOffset += attendancePageSize;
        }
      }

      let qrOffset = 0;
      while (true) {
        let qrQuery = supabase
          .from("attendance_qr_records")
          .select("id,attendance_date,person_type,person_identifier,person_name,class_name,status,note,created_at,session_type,subject,teacher_name,is_voided")
          .in("session_type", ["subject", "school_departure"])
          .eq("is_voided", false)
          .order("created_at", { ascending: false });
        if (role === "siswa") {
          qrQuery = qrQuery
            .gte("created_at", new Date(Date.now() - attendanceHistoryWindowMs).toISOString())
            .lte("created_at", new Date().toISOString());
        } else {
          qrQuery = qrQuery.eq("attendance_date", date);
        }
        const { data, error: qrQueryError } = await qrQuery.range(
          qrOffset,
          qrOffset + attendancePageSize - 1,
        );
        if (qrQueryError) {
          if (isAttendanceQrSchemaUnavailable(qrQueryError)) {
            setQrError("Riwayat QR belum tersedia. Jalankan migrasi attendance_identity_and_qr.sql di Supabase.");
            break;
          }
          throw qrQueryError;
        }

        const page = (data ?? []) as AttendanceRow[];
        loadedRows.push(...page.map(row => ({
          ...row,
          id: `qr-${row.id}`,
          note: row.note,
          status: row.session_type === "school_departure" ? "pulang" : row.status,
        })));
        if (page.length < attendancePageSize) break;
        qrOffset += attendancePageSize;
      }

      loadedRows.sort((a, b) => b.created_at.localeCompare(a.created_at));
      if (requestId === loadRequestRef.current) setRows(loadedRows);
    } catch (loadError) {
      if (requestId === loadRequestRef.current) {
        setError("Data gagal dimuat. Pastikan tabel, akses RLS, dan konfigurasi Supabase sudah sesuai. " + errorMessage(loadError));
      }
    } finally {
      if (requestId === loadRequestRef.current) setLoading(false);
    }
  }, [date, identity, isHomeroomTeacher, isSelfService, role]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadRows(); }, 0);
    return () => {
      window.clearTimeout(timer);
      loadRequestRef.current += 1;
    };
  }, [loadRows]);
  useEffect(() => {
    if (!canManageWhatsapp) return;
    let active = true;
    const loadSettings = async () => {
      try {
        const { data, error: settingsError } = await supabase
          .from("attendance_notification_settings")
          .select("enabled,message_template")
          .eq("id", 1)
          .maybeSingle();
        if (!active) return;
        if (settingsError) {
          setError("Pengaturan WhatsApp gagal dimuat: " + settingsError.message);
          return;
        }
        if (data) {
          setWaEnabled(Boolean(data.enabled));
          setWaTemplate(data.message_template ?? "");
        }
      } catch (settingsError) {
        if (active) {
          setError("Pengaturan WhatsApp gagal dimuat: " + errorMessage(settingsError));
        }
      }
    };
    void loadSettings();
    return () => { active = false; };
  }, [canManageWhatsapp]);

  const loadAttendanceSchedule = useCallback(async () => {
    setScheduleLoading(true);
    setScheduleError("");
    try {
      const [settingsResult, closuresResult] = await Promise.all([
        supabase
          .from("attendance_schedule_settings")
          .select("automation_enabled,arrival_start_time,arrival_ontime_until,arrival_absent_at,arrival_qr_duration_minutes,departure_scan_from,departure_qr_duration_minutes,bk_alert_at")
          .eq("id", 1)
          .maybeSingle(),
        supabase
          .from("attendance_school_closures")
          .select("school_date,description")
          .order("school_date", { ascending: true })
          .limit(100),
      ]);
      if (settingsResult.error) throw settingsResult.error;
      if (closuresResult.error) throw closuresResult.error;
      if (!settingsResult.data) {
        throw new Error("Pengaturan jadwal belum tersedia. Jalankan migrasi attendance_schedule_and_bk_alerts.sql.");
      }

      const timeValue = (value: string) => value.slice(0, 5);
      setScheduleSettings({
        automation_enabled: Boolean(settingsResult.data.automation_enabled),
        arrival_start_time: timeValue(settingsResult.data.arrival_start_time),
        arrival_ontime_until: timeValue(settingsResult.data.arrival_ontime_until),
        arrival_absent_at: timeValue(settingsResult.data.arrival_absent_at),
        arrival_qr_duration_minutes: Number(settingsResult.data.arrival_qr_duration_minutes),
        departure_scan_from: timeValue(settingsResult.data.departure_scan_from),
        departure_qr_duration_minutes: Number(settingsResult.data.departure_qr_duration_minutes),
        bk_alert_at: timeValue(settingsResult.data.bk_alert_at),
      });
      setSchoolClosures((closuresResult.data ?? []) as AttendanceSchoolClosure[]);
    } catch (loadError) {
      setScheduleError(`Pengaturan jadwal gagal dimuat: ${errorMessage(loadError)}`);
    } finally {
      setScheduleLoading(false);
    }
  }, []);

  const loadAdminArrivalQr = useCallback(async () => {
    if (!canManageAttendance && role !== "siswa") return false;
    try {
      const { data, error: resultError } = await supabase.rpc("get_active_attendance_arrival_broadcast");
      if (resultError) throw resultError;
      const value = Array.isArray(data) ? data[0] : data;
      if (!value || typeof value !== "object" || typeof value.server_now !== "string") {
        throw new Error("Respons waktu server QR Kedatangan tidak valid.");
      }
      const serverTimeOffset = Date.parse(value.server_now) - Date.now();
      if (!Number.isFinite(serverTimeOffset)) throw new Error("Waktu server QR Kedatangan tidak valid.");
      setServerClockOffsetMs(serverTimeOffset);
      if (value.session_id === null) {
        setAdminArrivalQr(null);
        setArrivalQrError("");
        return true;
      }
      if (typeof value !== "object"
        || typeof value.session_id !== "string"
        || typeof value.token !== "string"
        || typeof value.expires_at !== "string") {
        throw new Error("Respons QR kedatangan administrator tidak valid.");
      }
      setAdminArrivalQr({
        session_id: value.session_id,
        token: value.token,
        expires_at: value.expires_at,
      });
      setArrivalQrError("");
      return true;
    } catch (loadError) {
      setArrivalQrError(`QR Kedatangan Administrator gagal dimuat: ${errorMessage(loadError)}`);
      return false;
    }
  }, [canManageAttendance, role]);

  const loadAdminDepartureQr = useCallback(async () => {
    if (!canManageAttendance && role !== "siswa") return false;
    try {
      const { data, error: resultError } = await supabase.rpc("get_active_attendance_departure_broadcast");
      if (resultError) throw resultError;
      const value = Array.isArray(data) ? data[0] : data;
      if (!value || typeof value !== "object" || typeof value.server_now !== "string") {
        throw new Error("Respons waktu server QR Kepulangan tidak valid.");
      }
      const serverTimeOffset = Date.parse(value.server_now) - Date.now();
      if (!Number.isFinite(serverTimeOffset)) throw new Error("Waktu server QR Kepulangan tidak valid.");
      setServerClockOffsetMs(serverTimeOffset);
      if (value.session_id === null) {
        setAdminDepartureQr(null);
        setDepartureQrError("");
        return true;
      }
      if (typeof value.session_id !== "string"
        || typeof value.token !== "string"
        || typeof value.expires_at !== "string") {
        throw new Error("Respons QR Kepulangan administrator tidak valid.");
      }
      setAdminDepartureQr({
        session_id: value.session_id,
        token: value.token,
        expires_at: value.expires_at,
      });
      setDepartureQrError("");
      return true;
    } catch (loadError) {
      setDepartureQrError(`QR Kepulangan Administrator gagal dimuat: ${errorMessage(loadError)}`);
      return false;
    }
  }, [canManageAttendance, role]);

  useEffect(() => {
    if (!canManageAttendance && role !== "siswa") return;
    const initialTimer = window.setTimeout(() => {
      void loadAdminArrivalQr();
      void loadAdminDepartureQr();
    }, 0);
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void loadAdminArrivalQr();
        void loadAdminDepartureQr();
      }
    }, 30_000);
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(timer);
    };
  }, [loadAdminArrivalQr, loadAdminDepartureQr, role, canManageAttendance]);

  const createAdminArrivalQr = async () => {
    if (!Number.isInteger(arrivalQrDuration) || arrivalQrDuration < 1 || arrivalQrDuration > 480) {
      setArrivalQrError("Durasi QR harus 1–480 menit.");
      return;
    }
    setArrivalQrLoading(true);
    setArrivalQrError("");
    setArrivalQrNotice("");
    try {
      const { data, error: createError } = await supabase.rpc("create_attendance_arrival_broadcast", {
        p_duration_minutes: arrivalQrDuration,
      });
      if (createError) throw createError;
      const created = Array.isArray(data) ? data[0] : data;
      if (!created || typeof created.session_id !== "string"
        || typeof created.token !== "string"
        || typeof created.expires_at !== "string") {
        throw new Error("Respons aktivasi QR Kedatangan tidak valid.");
      }
      if (await loadAdminArrivalQr()) {
        setArrivalQrNotice("QR Kedatangan telah diaktifkan untuk akun siswa.");
      } else {
        setArrivalQrNotice("QR Kedatangan berhasil dibuat di server, tetapi tampilannya gagal dimuat. Muat ulang halaman untuk menampilkan QR.");
      }
    } catch (createError) {
      setArrivalQrError(`QR Kedatangan gagal diaktifkan: ${errorMessage(createError)}`);
    } finally {
      setArrivalQrLoading(false);
    }
  };

  const closeAdminArrivalQr = async () => {
    if (!adminArrivalQr) return;
    setArrivalQrLoading(true);
    setArrivalQrError("");
    setArrivalQrNotice("");
    try {
      const { error: closeError } = await supabase.rpc("close_attendance_arrival_broadcast", {
        p_session_id: adminArrivalQr.session_id,
      });
      if (closeError) throw closeError;
      setAdminArrivalQr(null);
      setArrivalQrNotice("QR Kedatangan telah diakhiri.");
    } catch (closeError) {
      setArrivalQrError(`QR Kedatangan gagal diakhiri: ${errorMessage(closeError)}`);
    } finally {
      setArrivalQrLoading(false);
    }
  };

  const createAdminDepartureQr = async () => {
    if (!Number.isInteger(departureQrDuration) || departureQrDuration < 1 || departureQrDuration > 480) {
      setDepartureQrError("Durasi QR harus 1–480 menit.");
      return;
    }
    setDepartureQrLoading(true);
    setDepartureQrError("");
    setDepartureQrNotice("");
    try {
      const { data, error: createError } = await supabase.rpc("create_attendance_departure_broadcast", {
        p_duration_minutes: departureQrDuration,
      });
      if (createError) throw createError;
      const created = Array.isArray(data) ? data[0] : data;
      if (!created || typeof created.session_id !== "string"
        || typeof created.token !== "string"
        || typeof created.expires_at !== "string") {
        throw new Error("Respons aktivasi QR Kepulangan tidak valid.");
      }
      if (await loadAdminDepartureQr()) {
        setDepartureQrNotice("QR Kepulangan telah diaktifkan untuk akun siswa.");
      } else {
        setDepartureQrNotice("QR Kepulangan berhasil dibuat di server, tetapi tampilannya gagal dimuat. Muat ulang halaman untuk menampilkan QR.");
      }
    } catch (createError) {
      setDepartureQrError(`QR Kepulangan gagal diaktifkan: ${errorMessage(createError)}`);
    } finally {
      setDepartureQrLoading(false);
    }
  };

  const closeAdminDepartureQr = async () => {
    if (!adminDepartureQr) return;
    setDepartureQrLoading(true);
    setDepartureQrError("");
    setDepartureQrNotice("");
    try {
      const { error: closeError } = await supabase.rpc("close_attendance_departure_broadcast", {
        p_session_id: adminDepartureQr.session_id,
      });
      if (closeError) throw closeError;
      setAdminDepartureQr(null);
      setDepartureQrNotice("QR Kepulangan telah diakhiri.");
    } catch (closeError) {
      setDepartureQrError(`QR Kepulangan gagal diakhiri: ${errorMessage(closeError)}`);
    } finally {
      setDepartureQrLoading(false);
    }
  };

  const copyText = async (
    value: string,
    copiedValue: string,
    onError: (message: string) => void = setArrivalQrError,
  ) => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
      } else {
        const input = document.createElement("textarea");
        input.value = value;
        input.setAttribute("readonly", "");
        input.style.position = "fixed";
        input.style.opacity = "0";
        document.body.appendChild(input);
        input.select();
        const copied = document.execCommand("copy");
        input.remove();
        if (!copied) throw new Error("Browser menolak penyalinan kode.");
      }
      setCopiedQrToken(copiedValue);
      setQrError("");
      setArrivalQrError("");
      setDepartureQrError("");
    } catch (copyError) {
      onError(`Kode QR tidak dapat disalin: ${errorMessage(copyError)}. Pilih kode dan salin secara manual.`);
    }
  };

  useEffect(() => {
    if (!canManageAttendance) return;
    const timer = window.setTimeout(() => { void loadAttendanceSchedule(); }, 0);
    return () => window.clearTimeout(timer);
  }, [canManageAttendance, loadAttendanceSchedule]);

  useEffect(() => {
    if (role !== "siswa") return;

    let active = true;
    const loadStudentQrs = async () => {
      setStudentQrLoading(true);
      setStudentQrError("");
      try {
        const { data, error: qrErrorResult } = await supabase.rpc("get_my_attendance_student_qrs");
        if (qrErrorResult) throw qrErrorResult;
        if (!Array.isArray(data) || !data.every(isStudentAttendanceQr)) {
          throw new Error("Respons QR pribadi siswa tidak valid. Pastikan migrasi absensi terbaru sudah diterapkan.");
        }
        if (active) {
          setMyStudentQrs(data.filter((qr) => Date.parse(qr.expires_at) > Date.now()));
        }
      } catch (loadError) {
        if (active) {
          setMyStudentQrs([]);
          setStudentQrError(`QR sekolah gagal dimuat: ${errorMessage(loadError)}`);
        }
      } finally {
        if (active) setStudentQrLoading(false);
      }
    };

    void loadStudentQrs();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void loadStudentQrs();
    }, 180_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [currentUser?.id, role]);

  useEffect(() => {
    const updateClock = () => {
      const now = Date.now() + serverClockOffsetMs;
      setClockNow(now);
      const sessionExpiresAt = qrSession?.expires_at ? Date.parse(qrSession.expires_at) : null;
      const tokenExpiresAt = qrSession ? Date.parse(qrSession.token_expires_at) : null;
      if (
        qrSession
        && (
          sessionExpiresAt === null
          || tokenExpiresAt === null
          || !Number.isFinite(sessionExpiresAt)
          || !Number.isFinite(tokenExpiresAt)
          || sessionExpiresAt <= now
          || tokenExpiresAt <= now
        )
      ) {
        setQrSession(null);
        setQrError("Sesi QR berakhir. Buat sesi baru untuk melanjutkan.");
      }
      if (adminArrivalQr && Date.parse(adminArrivalQr.expires_at) <= now) {
        setAdminArrivalQr(null);
      }
      setMyStudentQrs((current) => {
        const valid = current.filter((qr) => Date.parse(qr.expires_at) > now);
        return valid.length === current.length ? current : valid;
      });
    };
    updateClock();
    const timer = window.setInterval(updateClock, 1000);
    return () => window.clearInterval(timer);
  }, [adminArrivalQr, myStudentQrs.length, qrSession, serverClockOffsetMs]);

  useEffect(() => {
    if (!isHomeroomTeacher || !currentUser) return;
    let active = true;
    const loadHomeroomAttendance = async () => {
      setHomeroomLoading(true);
      setHomeroomError("");
      try {
        const { data, error: homeroomErrorResult } = await supabase.rpc(
          "get_my_attendance_weekly_report",
          { p_week_start: weeklyStartDate },
        );
        if (homeroomErrorResult) throw homeroomErrorResult;
        if (!Array.isArray(data)) {
          throw new Error("Respons rekap wali kelas tidak valid.");
        }
        const validRows = data.filter((row): row is HomeroomWeeklyAttendanceRow =>
          typeof row === "object"
          && row !== null
          && typeof row.class_id === "string"
          && typeof row.class_name === "string"
          && typeof row.grade_level === "number"
          && typeof row.attendance_date === "string"
          && typeof row.student_id === "string"
          && typeof row.person_identifier === "string"
          && typeof row.person_name === "string"
          && (row.gender === null || row.gender === "L" || row.gender === "P")
          && (row.status === "hadir" || row.status === "terlambat" || row.status === "sakit" || row.status === "izin" || row.status === "alpa" || row.status === "pulang" || row.status === "belum_tercatat")
          && (row.note === null || typeof row.note === "string")
          && (row.recorded_at === null || typeof row.recorded_at === "string")
          && typeof row.is_effective_day === "boolean",
        );
        if (validRows.length !== data.length) {
          throw new Error("Sebagian data rekap wali kelas memiliki format yang tidak valid.");
        }
        if (active) setHomeroomRows(validRows);
      } catch (loadError) {
        if (active) setHomeroomError(`Rekap kelas perwalian gagal dimuat: ${errorMessage(loadError)}`);
      } finally {
        if (active) setHomeroomLoading(false);
      }
    };

    void loadHomeroomAttendance();
    return () => { active = false; };
  }, [currentUser, isHomeroomTeacher, weeklyStartDate]);

  useEffect(() => {
    if (!canManageAttendance && !isHomeroomTeacher) return;
    let active = true;
    const loadWeeklyTemplate = async () => {
      setWeeklyTemplateLoading(true);
      setWeeklyTemplateError("");
      try {
        const { data, error: templateError } = await supabase
          .from("attendance_weekly_report_templates")
          .select("html_template,source_file_name")
          .eq("id", 1)
          .maybeSingle();
        if (templateError) throw templateError;
        if (active && data) {
          setWeeklyTemplate(sanitizeAttendanceTemplateHtml(data.html_template));
          setWeeklyTemplateFileName(data.source_file_name ?? "");
        }
      } catch (loadError) {
        if (active) setWeeklyTemplateError(`Format rekap mingguan gagal dimuat: ${errorMessage(loadError)}`);
      } finally {
        if (active) setWeeklyTemplateLoading(false);
      }
    };
    void loadWeeklyTemplate();
    return () => { active = false; };
  }, [canManageAttendance, isHomeroomTeacher]);

  useEffect(() => {
    if (isSelfService || !canManageAttendance) return;
    const value = identifier.trim();
    if (!value) return;

    let active = true;
    const timer = window.setTimeout(async () => {
      setIdentityLookup("loading");
      setIdentityLookupMessage("");
      setVerifiedIdentifier("");
      try {
        if (personType === "siswa") {
          const { data, error: lookupError } = await supabase
            .from("students")
            .select("nisn,full_name,class:classes!students_class_id_fkey(name)")
            .eq("nisn", value)
            .maybeSingle();
          if (lookupError) throw lookupError;
          if (!data) {
            if (active) {
              setPersonName("");
              setClassName("");
              setIdentityLookup("not-found");
              setIdentityLookupMessage("NISN tidak ditemukan di Data Induk.");
            }
            return;
          }
          if (active) {
            setPersonName(data.full_name);
            setClassName(relatedName(data.class));
            setVerifiedIdentifier(value);
            setIdentityLookup("found");
            setIdentityLookupMessage(`Data ditemukan${relatedName(data.class) ? ` · Kelas ${relatedName(data.class)}` : ""}.`);
          }
          return;
        }

        const { data, error: lookupError } = await supabase
          .from("teachers")
          .select("nip,full_name")
          .eq("nip", value)
          .maybeSingle();
        if (lookupError) throw lookupError;
        if (!data) {
          if (active) {
            setPersonName("");
            setIdentityLookup("not-found");
            setIdentityLookupMessage("NIP tidak ditemukan di Data Induk.");
          }
          return;
        }
        if (active) {
          setPersonName(data.full_name);
          setClassName("");
          setVerifiedIdentifier(value);
          setIdentityLookup("found");
          setIdentityLookupMessage("Data guru/tendik ditemukan.");
        }
      } catch (lookupError) {
        if (active) {
          setIdentityLookup("error");
          setIdentityLookupMessage(`Pencarian Data Induk gagal: ${errorMessage(lookupError)}`);
        }
      }
    }, 350);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [canManageAttendance, identifier, isSelfService, personType]);

  const saveWhatsappSettings = async () => {
    setWaSaving(true);
    setError("");
    setMessage("");
    try {
      const { error: saveError } = await supabase.from("attendance_notification_settings").upsert({
        id: 1, enabled: waEnabled, message_template: waTemplate, updated_at: new Date().toISOString()
      });
      if (saveError) throw saveError;
      setMessage("Pengaturan WhatsApp berhasil disimpan.");
    } catch (saveError) {
      setError("Pengaturan WhatsApp gagal disimpan: " + errorMessage(saveError));
    } finally {
      setWaSaving(false);
    }
  };
  const saveAttendanceSchedule = async () => {
    if (
      !Number.isInteger(scheduleSettings.arrival_qr_duration_minutes)
      || scheduleSettings.arrival_qr_duration_minutes < 1
      || scheduleSettings.arrival_qr_duration_minutes > 480
      || !Number.isInteger(scheduleSettings.departure_qr_duration_minutes)
      || scheduleSettings.departure_qr_duration_minutes < 1
      || scheduleSettings.departure_qr_duration_minutes > 480
    ) {
      setScheduleError("Durasi QR harus berupa bilangan bulat antara 1 dan 480 menit.");
      return;
    }
    setScheduleSaving(true);
    setScheduleError("");
    setScheduleNotice("");
    try {
      const { error: saveError } = await supabase
        .from("attendance_schedule_settings")
        .upsert({
          id: 1,
          ...scheduleSettings,
          updated_at: new Date().toISOString(),
          updated_by: currentUser?.id ?? null,
        });
      if (saveError) throw saveError;
      setScheduleNotice("Jadwal absensi otomatis berhasil disimpan.");
    } catch (saveError) {
      setScheduleError(`Pengaturan jadwal gagal disimpan: ${errorMessage(saveError)}`);
    } finally {
      setScheduleSaving(false);
    }
  };
  const addSchoolClosure = async () => {
    if (!closureDate) {
      setScheduleError("Tanggal libur wajib dipilih.");
      return;
    }
    setClosureSaving(true);
    setScheduleError("");
    setScheduleNotice("");
    try {
      const { error: insertError } = await supabase
        .from("attendance_school_closures")
        .insert({
          school_date: closureDate,
          description: closureDescription.trim(),
          created_by: currentUser?.id ?? null,
        });
      if (insertError) throw insertError;
      setClosureDate("");
      setClosureDescription("");
      await loadAttendanceSchedule();
      setScheduleNotice("Tanggal libur berhasil ditambahkan.");
    } catch (insertError) {
      setScheduleError(`Tanggal libur gagal ditambahkan: ${errorMessage(insertError)}`);
    } finally {
      setClosureSaving(false);
    }
  };
  const removeSchoolClosure = async (schoolDate: string) => {
    setScheduleError("");
    setScheduleNotice("");
    try {
      const { error: deleteError } = await supabase
        .from("attendance_school_closures")
        .delete()
        .eq("school_date", schoolDate);
      if (deleteError) throw deleteError;
      await loadAttendanceSchedule();
      setScheduleNotice("Tanggal libur berhasil dihapus.");
    } catch (deleteError) {
      setScheduleError(`Tanggal libur gagal dihapus: ${errorMessage(deleteError)}`);
    }
  };
  const createQrSession = async () => {
    if (!isTeacher) return;
    setQrError("");
    setQrSession(null);
    setManualQrValue("");
    setCopiedQrToken("");
    setQrBusy(true);
    try {
      const { data, error: createError } = await supabase
        .rpc("create_attendance_qr_session", {
          p_session_type: "subject",
          p_subject: qrSubject,
          p_class_id: qrClassId,
        })
        .maybeSingle();
      if (createError) throw createError;
      if (!isAttendanceQrSession(data)) {
        throw new Error("Respons pembuatan QR tidak valid. Pastikan migrasi absensi QR sudah diterapkan.");
      }
      const expiresAt = Date.parse(data.expires_at ?? "");
      const tokenExpiresAt = Date.parse(data.token_expires_at);
      const now = Date.now() + serverClockOffsetMs;
      if (
        data.attendance_date !== today()
        || !Number.isFinite(expiresAt)
        || !Number.isFinite(tokenExpiresAt)
        || expiresAt <= now
        || tokenExpiresAt <= now
      ) {
        throw new Error(
          "Server membuat sesi QR dengan tanggal atau masa aktif yang sudah berakhir. Terapkan migrasi durasi QR mapel terbaru lalu coba lagi.",
        );
      }
      setQrSession(data);
      setQrError("");
    } catch (createError) {
      setQrError(errorMessage(createError));
    } finally {
      setQrBusy(false);
    }
  };

  const closeQrSession = async () => {
    if (!qrSession) return;
    setQrBusy(true);
    setQrError("");
    try {
      const { error: closeError } = await supabase
        .rpc("close_attendance_qr_session", { p_session_id: qrSession.session_id });
      if (closeError) throw closeError;
      setQrSession(null);
    } catch (closeError) {
      setQrError(errorMessage(closeError));
    } finally {
      setQrBusy(false);
    }
  };

  const copyQrToken = async () => {
    if (!qrSession) return;
    try {
      await navigator.clipboard.writeText(qrSession.token);
      setCopiedQrToken(qrSession.token);
      setQrError("");
    } catch {
      setQrError("Kode QR tidak dapat disalin. Silakan pilih dan salin kode secara manual.");
    }
  };

  const notifyAttendanceQrSubmission = useCallback(async (
    data: AttendanceQrSubmission,
    personIdentifier: string,
  ) => {
    if (data.session_type === "subject") return { notice: "", problem: "" };
    if (!data.qr_record_id) {
      return {
        notice: "",
        problem: "Kehadiran tersimpan, tetapi referensi catatan tidak tersedia untuk notifikasi WhatsApp.",
      };
    }

    try {
      const { data: notifyData, error: notifyError } = await supabase.functions.invoke(
        "send-attendance-whatsapp",
        {
          body: {
            attendance_date: data.attendance_date,
            person_identifier: personIdentifier,
            event_type: data.session_type,
            qr_record_id: data.qr_record_id,
          },
        },
      );
      if (notifyError) {
        return { notice: "", problem: `Kehadiran tersimpan, tetapi notifikasi WhatsApp gagal: ${errorMessage(notifyError)}` };
      }
      const result = getWhatsAppResult(notifyData);
      if (result?.sent) return { notice: " Notifikasi WhatsApp diterima Fonnte untuk diproses.", problem: "" };
      if (result?.reason === "disabled") return { notice: " Notifikasi WhatsApp belum diaktifkan.", problem: "" };
      if (result?.reason === "parent_phone_missing") return { notice: " Nomor WhatsApp orang tua belum tercatat.", problem: "" };
      if (result?.reason === "parent_phone_invalid") return { notice: " Nomor WhatsApp orang tua tidak valid.", problem: "" };
      if (result?.reason === "already_sent") return { notice: " Notifikasi WhatsApp untuk kejadian ini sudah pernah dikirim.", problem: "" };
      if (result?.reason === "provider_rejected") {
        return {
          notice: "",
          problem: `Kehadiran tersimpan, tetapi Fonnte menolak pesan: ${result.detail ?? "Periksa status perangkat dan respons provider."}`,
        };
      }
      return { notice: "", problem: "Kehadiran tersimpan, tetapi status pengiriman WhatsApp tidak dapat dipastikan." };
    } catch (notifyError) {
      return { notice: "", problem: `Kehadiran tersimpan, tetapi notifikasi WhatsApp gagal: ${errorMessage(notifyError)}` };
    }
  }, []);

  const submitScannedAttendance = useCallback(async (rawValue: string) => {
    const token = attendanceQrToken(rawValue);
    if (!token) {
      setError("Kode QR absensi kosong.");
      return;
    }
    if (qrAttendanceStatus !== "hadir" && !qrAttendanceNote.trim()) {
      setError("Keterangan wajib diisi jika memilih status Izin atau Sakit.");
      return;
    }

    setError("");
    setMessage("");
    setSaving(true);
    try {
      const isAdminArrivalToken = role === "siswa" && adminArrivalQr?.token === token;
      const isAdminDepartureToken = role === "siswa" && adminDepartureQr?.token === token;
      const { data, error: submitError } = await supabase
      .rpc(isAdminArrivalToken ? "submit_attendance_arrival_broadcast" : "submit_attendance_qr", {
        p_token: token,
        p_status: isAdminArrivalToken || isAdminDepartureToken ? "hadir" : qrAttendanceStatus,
        p_note: isAdminArrivalToken || isAdminDepartureToken ? null : qrAttendanceNote.trim() || null,
      })
        .maybeSingle();
      if (submitError) throw submitError;
      if (!isAttendanceQrSubmission(data)) {
        throw new Error("Respons absensi QR tidak valid. Pastikan migrasi absensi QR sudah diterapkan.");
      }
      const label = data.session_type === "subject"
        ? `${statusLabel(data.attendance_status)} pada mata pelajaran ${typeof data.subject === "string" ? data.subject : ""}`
        : data.session_type === "school_departure"
          ? "kepulangan sekolah"
          : data.attendance_status === "terlambat"
            ? "terlambat di sekolah"
            : "kedatangan sekolah";
      const notification = data.session_type !== "subject" && identity
        ? await notifyAttendanceQrSubmission(data, identity.identifier)
        : { notice: "", problem: "" };
      if (data.session_type !== "subject" && !identity) {
        notification.problem = "Identitas siswa belum tersedia untuk mengirim notifikasi WhatsApp.";
      }
      setMessage(data.already_recorded
        ? `Absensi ${label} pada sesi QR ini sudah pernah dicatat.${notification.notice}`
        : `Berhasil mencatat ${label}.${notification.notice}`);
      if (notification.problem) setError(notification.problem);
      setManualQrValue("");
      setQrAttendanceStatus("hadir");
      setQrAttendanceNote("");
      await loadRows();
    } catch (submitError) {
      setError(errorMessage(submitError));
    } finally {
      setSaving(false);
    }
  }, [adminArrivalQr, adminDepartureQr, identity, loadRows, notifyAttendanceQrSubmission, qrAttendanceNote, qrAttendanceStatus, role]);

  const stopCamera = useCallback(() => {
    if (scanTimer.current !== null) window.clearTimeout(scanTimer.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setCameraOn(false);
  }, []);
  useEffect(() => () => { streamRef.current?.getTracks().forEach(t => t.stop()); }, []);

  const startCamera = async (mode: "identity" | "attendance" = "identity") => {
    setError("");
    setMessage("");
    try {
      stopCamera();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      streamRef.current = stream;
      cameraModeRef.current = mode;
      setCameraOn(true);
    } catch {
      stopCamera();
      setError("Kamera tidak dapat dibuka. Izinkan akses kamera dan gunakan HTTPS (Vercel sudah HTTPS).");
    }
  };
  const parseQr = useCallback((raw: string) => {
    setStudentQrToken("");
    setVerifiedIdentifier("");
    setIdentityLookup("idle");
    setIdentityLookupMessage("");
    const parts = raw.trim().split("|");
    if (parts.length >= 2 && ["siswa","guru_tendik"].includes(parts[0].toLowerCase())) {
      setPersonType(parts[0].toLowerCase() as PersonType);
      setIdentifier(parts[1] ?? ""); setPersonName(parts[2] ?? ""); setClassName(parts[3] ?? "");
    } else {
      setIdentifier(raw.trim());
    }
  }, []);
  const resolveStudentAttendanceQr = useCallback(async (raw: string) => {
    const token = attendanceStudentQrToken(raw);
    if (!token || !raw.trim().toUpperCase().startsWith(studentQrPrefix)) {
      parseQr(raw);
      setMessage("QR berhasil dibaca. Periksa data lalu tekan Simpan Absensi.");
      return;
    }

    setError("");
    setIdentityLookup("loading");
    setIdentityLookupMessage("");
    setStudentQrToken("");
    try {
      const { data, error: resolveError } = await supabase.rpc(
        "resolve_attendance_student_qr",
        { p_token: token },
      ).maybeSingle();
      if (resolveError) throw resolveError;
      if (!data || typeof data !== "object") {
        throw new Error("QR pribadi siswa tidak valid atau sudah kedaluwarsa.");
      }
      const qr = data as Record<string, unknown>;
      if (
        typeof qr.person_identifier !== "string"
        || typeof qr.person_name !== "string"
        || !(qr.class_name === null || typeof qr.class_name === "string")
        || !(qr.session_type === "school_arrival" || qr.session_type === "school_departure")
      ) {
        throw new Error("Data QR pribadi siswa tidak valid.");
      }
      setStudentQrToken(token);
      setPersonType("siswa");
      setIdentifier(qr.person_identifier);
      setPersonName(qr.person_name);
      setClassName(qr.class_name ?? "");
      setStatus("hadir");
      setVerifiedIdentifier(qr.person_identifier);
      setIdentityLookup("found");
      setIdentityLookupMessage(
        `QR ${qr.session_type === "school_arrival" ? "kedatangan" : "kepulangan"} terverifikasi. Tekan Simpan Absensi.`,
      );
    } catch (resolveError) {
      setIdentityLookup("error");
      setIdentityLookupMessage(errorMessage(resolveError));
    }
  }, [parseQr]);
  useEffect(() => {
    cameraScanHandlersRef.current = {
      attendance: (value) => void submitScannedAttendance(value),
      identity: (value) => void resolveStudentAttendanceQr(value),
    };
  }, [resolveStudentAttendanceQr, submitScannedAttendance]);

  useEffect(() => {
    if (!cameraOn) return;
    let active = true;
    const video = videoRef.current;
    const stream = streamRef.current;
    if (!video || !stream) {
      setError("Elemen kamera belum siap. Tutup lalu buka kembali pemindai.");
      stopCamera();
      return;
    }
    const Detector = (window as BarcodeDetectorWindow).BarcodeDetector;
    const detector = Detector ? new Detector({ formats: ["qr_code"] }) : null;
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { willReadFrequently: true });
    let processing = false;

    const handleResult = (value: string) => {
      if (!active || processing) return;
      processing = true;
      const mode = cameraModeRef.current;
      stopCamera();
      if (mode === "attendance") {
        cameraScanHandlersRef.current.attendance(value);
      } else {
        cameraScanHandlersRef.current.identity(value);
      }
    };
    const scan = async () => {
      if (!active || !streamRef.current || !videoRef.current) return;
      if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !video.videoWidth || !context) {
        scanTimer.current = window.setTimeout(() => void scan(), 250);
        return;
      }
      try {
        if (detector) {
          const found = await detector.detect(video);
          if (found[0]?.rawValue) {
            handleResult(found[0].rawValue);
            return;
          }
        }
      } catch {
        // Continue with the canvas decoder when native detection is unavailable.
      }
      if (active && streamRef.current && video.videoWidth) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const image = context.getImageData(0, 0, canvas.width, canvas.height);
        const result = jsQR(image.data, image.width, image.height, {
          inversionAttempts: "dontInvert",
        });
        if (result?.data) {
          handleResult(result.data);
          return;
        }
      }
      if (active) scanTimer.current = window.setTimeout(() => void scan(), 300);
    };

    video.srcObject = stream;
    void video.play().then(() => void scan()).catch(() => {
      if (active) {
        setError("Pratinjau kamera tidak dapat dimulai. Periksa izin kamera browser.");
        stopCamera();
      }
    });
    return () => {
      active = false;
      if (scanTimer.current !== null) window.clearTimeout(scanTimer.current);
    };
  }, [cameraOn, stopCamera]);
  const saveAttendance = async (event: React.FormEvent) => {
    event.preventDefault(); setError(""); setMessage("");
    if (!isSelfService && !canViewAllAttendance) {
      setError("Akun ini tidak memiliki hak untuk mencatat absensi.");
      return;
    }
    if (isSelfService && !identity) {
      setError(identityError || "Identitas akun belum terhubung ke Data Induk.");
      return;
    }
    if (!isSelfService && (
      !identifier.trim() ||
      !personName.trim() ||
      identityLookup !== "found" ||
      verifiedIdentifier !== identifier.trim()
    )) {
      setError("Masukkan NISN/NIP yang terdaftar dan tunggu nama terisi dari Data Induk.");
      return;
    }
    setSaving(true);
    try {
      if (studentQrToken) {
        const { data, error: submitError } = await supabase.rpc(
          "submit_attendance_student_qr",
          { p_token: studentQrToken },
        ).maybeSingle();
        if (submitError) throw submitError;
        if (!isAttendanceQrSubmission(data)) {
          throw new Error("Respons penyimpanan QR pribadi tidak valid. Pastikan migrasi absensi terbaru sudah diterapkan.");
        }
        const notification = await notifyAttendanceQrSubmission(data, identifier.trim());
        const eventLabel = data.session_type === "school_departure"
          ? "kepulangan sekolah"
          : data.attendance_status === "terlambat"
            ? "kedatangan sekolah (terlambat)"
            : "kedatangan sekolah";
        setMessage(`Berhasil mencatat ${eventLabel}.${notification.notice}`);
        if (notification.problem) setError(notification.problem);
        setStudentQrToken("");
        setIdentifier("");
        setPersonName("");
        setClassName("");
        setVerifiedIdentifier("");
        setIdentityLookup("idle");
        setIdentityLookupMessage("");
        await loadRows();
        return;
      }

      const session = await getValidSupabaseSession();
      const user = session?.user;
      if (!user) {
        throw new Error("Sesi akun tidak valid. Silakan masuk kembali.");
      }
      if (isSelfService && user.id !== currentUser?.id) {
        throw new Error("Sesi akun tidak valid. Silakan masuk kembali.");
      }
      const targetIdentity = isSelfService ? identity : null;
      const targetPersonType = targetIdentity?.personType ?? personType;
      const targetIdentifier = targetIdentity?.identifier ?? identifier.trim();
      const targetName = targetIdentity?.name ?? personName.trim();
      const targetClassName = targetIdentity?.className ?? (personType === "siswa" ? className.trim() || null : null);
      const payload = {
        attendance_date: isSelfService ? today() : date,
        person_type: targetPersonType,
        person_identifier: targetIdentifier,
        person_name: targetName,
        class_name: targetPersonType === "siswa" ? targetClassName : null,
        status, note: note.trim() || null, created_by: user.id
      };
      const { error: saveError } = await supabase.from("attendance_records").upsert(payload, {
        onConflict:"attendance_date,person_type,person_identifier"
      });
      if (saveError) throw saveError;

      setMessage("Absensi tersimpan.");
      if (!isSelfService) {
        setIdentifier(""); setPersonName(""); setClassName("");
      }
      setNote("");
      await loadRows();
    } catch (saveError) {
      setError("Absensi gagal disimpan: " + errorMessage(saveError));
    } finally {
      setSaving(false);
    }
  };
  const availableQrSubjects = useMemo(
    () => [...new Set(teacherSubjectAssignments.map((assignment) => assignment.subject))],
    [teacherSubjectAssignments],
  );
  const availableQrClasses = useMemo(
    () => teacherSubjectAssignments
      .filter((assignment) => assignment.subject === qrSubject)
      .sort((a, b) => a.grade_level - b.grade_level || a.class_name.localeCompare(b.class_name)),
    [qrSubject, teacherSubjectAssignments],
  );
  const homeroomReports = useMemo(() => {
    const reports = new Map<string, { className: string; gradeLevel: number; rows: HomeroomWeeklyAttendanceRow[] }>();
    for (const row of homeroomRows) {
      const report = reports.get(row.class_id) ?? {
        className: row.class_name,
        gradeLevel: row.grade_level,
        rows: [],
      };
      report.rows.push(row);
      reports.set(row.class_id, report);
    }
    return [...reports.entries()].map(([classId, report]) => ({ classId, ...report }));
  }, [homeroomRows]);
  const weeklyDays = useMemo(() => Array.from({ length: 5 }, (_, index) => {
    const [year, monthValue, dayValue] = weeklyStartDate.split("-").map(Number);
    const dateValue = new Date(Date.UTC(year, monthValue - 1, dayValue + index));
    return dateValue.toISOString().slice(0, 10);
  }), [weeklyStartDate]);
  const weeklyReportData = useMemo(() => homeroomReports.map((report) => {
    const students = new Map<string, {
      studentId: string;
      identifier: string;
      name: string;
      gender: "L" | "P" | null;
      days: Map<string, HomeroomWeeklyAttendanceRow>;
    }>();
    for (const row of report.rows) {
      const student = students.get(row.student_id) ?? {
        studentId: row.student_id,
        identifier: row.person_identifier,
        name: row.person_name,
        gender: row.gender,
        days: new Map<string, HomeroomWeeklyAttendanceRow>(),
      };
      student.days.set(row.attendance_date, row);
      students.set(row.student_id, student);
    }
    const orderedStudents = [...students.values()].sort((a, b) =>
      a.name.localeCompare(b.name, "id-ID") || a.identifier.localeCompare(b.identifier));
    const effectiveDayCount = new Set(report.rows
      .filter((row) => row.is_effective_day)
      .map((row) => row.attendance_date)).size;
    return {
      ...report,
      effectiveDayCount,
      students: orderedStudents.map((student) => {
        const counts = { H: 0, T: 0, S: 0, I: 0, A: 0 };
        const events: string[] = [];
        for (const day of weeklyDays) {
          const row = student.days.get(day);
          const code = row ? weeklyStatusCode[row.status] : undefined;
          if (code) {
            counts[code] += 1;
            if (code !== "H") {
              const label = new Intl.DateTimeFormat("id-ID", {
                weekday: "long",
                timeZone: "UTC",
              }).format(new Date(`${day}T00:00:00Z`));
              events.push(`${code}:${label}`);
            }
          }
        }
        const percentage = effectiveDayCount > 0
          ? Math.round(((counts.H + counts.T) / effectiveDayCount) * 100)
          : null;
        const notes = student.days;
        const remarks: string[] = [];
        const eventDays = (code: string) => events
          .filter((event) => event.startsWith(`${code}:`))
          .map((event) => event.slice(2))
          .join(", ");
        if (counts.T) remarks.push(`Terlambat ${counts.T}x (${eventDays("T")})`);
        if (counts.S) {
          const noteText = [...notes.values()].filter((row) => row.status === "sakit" && row.note)
            .map((row) => row.note).join("; ");
          remarks.push(`Sakit ${counts.S}x (${eventDays("S")})${noteText ? ` / ${noteText}` : " / Surat dokter terlampir"}`);
        }
        if (counts.I) {
          const noteText = [...notes.values()].filter((row) => row.status === "izin" && row.note)
            .map((row) => row.note).join("; ");
          remarks.push(`Izin ${counts.I}x (${eventDays("I")})${noteText ? ` / ${noteText}` : ""}`);
        }
        if (counts.A || (percentage !== null && percentage < 80)) {
          const noteText = [...notes.values()].filter((row) => row.status === "alpa" && row.note)
            .map((row) => row.note).join("; ");
          remarks.push(`Alpa ${counts.A}x${counts.A ? ` (${eventDays("A")})` : ""}${noteText ? ` / ${noteText}` : " / Perlu konfirmasi orang tua"}`);
        }
        if (remarks.length === 0 && effectiveDayCount > 0 && counts.H === effectiveDayCount) {
          remarks.push("Hadir penuh / Tertib");
        }
        return {
          ...student,
          counts,
          percentage,
          remarks: remarks.length ? remarks.join("; ") : "—",
        };
      }),
    };
  }), [homeroomReports, weeklyDays]);
  const personalRows = useMemo(() => rows.filter((row) =>
    row.session_type !== "subject"
    && (!identity || (
      row.person_type === identity.personType
      && row.person_identifier === identity.identifier
    )),
  ), [identity, rows]);
  const homeroomClassNames = useMemo(
    () => new Set(weeklyReportData.map((report) => report.className.trim().toLocaleLowerCase("id-ID"))),
    [weeklyReportData],
  );
  const homeroomRowsForMonitor = useMemo(() => rows.filter((row) =>
    row.person_type === "siswa"
    && (
      row.session_type === "subject"
      || row.session_type === "school_departure"
      || row.session_type === undefined
    )
    && Boolean(row.class_name)
    && homeroomClassNames.has((row.class_name ?? "").trim().toLocaleLowerCase("id-ID")),
  ), [homeroomClassNames, rows]);
  const homeroomSubjectRows = useMemo(
    () => homeroomRowsForMonitor.filter((row) => row.session_type === "subject"),
    [homeroomRowsForMonitor],
  );
  const teacherSubjectRows = useMemo(() => rows.filter((row) =>
    row.session_type === "subject"
    && row.teacher_name === currentUser?.full_name
    && (subjectFilter === "all" || row.subject === subjectFilter)
    && (subjectClassFilter === "all" || row.class_name === subjectClassFilter)
    && teacherSubjectAssignments.some((assignment) =>
      assignment.subject === row.subject
      && assignment.class_name.trim().toLocaleLowerCase("id-ID")
        === (row.class_name ?? "").trim().toLocaleLowerCase("id-ID"),
    ),
  ), [currentUser?.full_name, rows, subjectClassFilter, subjectFilter, teacherSubjectAssignments]);
  const adminRows = useMemo(() => rows.filter((row) => {
    if (adminCategory === "all") return true;
    const category = row.person_type === "siswa"
      ? "siswa"
      : employeeClassifications.get(row.person_identifier)?.category;
    if (category !== adminCategory) return false;
    if (adminCategory !== "guru" || adminTeacherFilter === "all") return true;
    return employeeClassifications.get(row.person_identifier)?.teacherRole === adminTeacherFilter;
  }), [adminCategory, adminTeacherFilter, employeeClassifications, rows]);
  const visibleRows = attendanceView === "subjects"
    ? teacherSubjectRows
    : attendanceView === "homeroom"
      ? homeroomSubjectRows
      : attendanceView === "monitor"
      ? homeroomRowsForMonitor
      : attendanceView === "admin"
        ? adminRows
        : personalRows;
  const filtered = useMemo(() => visibleRows.filter((row) =>
    `${row.person_identifier} ${row.person_name} ${row.class_name ?? ""} ${row.status} ${row.subject ?? ""} ${row.teacher_name ?? ""}`
      .toLocaleLowerCase("id-ID")
      .includes(filter.toLocaleLowerCase("id-ID")),
  ), [filter, visibleRows]);
  const summary = useMemo(() => statuses.map((status) => ({
    ...status,
    count: visibleRows.filter((row) => row.status === status.value).length,
  })), [visibleRows]);

  const handleWeeklyTemplateFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!/\.(html?|docx)$/i.test(file.name)) {
      setWeeklyTemplateError("Pilih file .html, .htm, atau .docx.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setWeeklyTemplateError("Ukuran file format rekap maksimal 5 MB.");
      return;
    }

    setWeeklyTemplateError("");
    setWeeklyTemplateNotice("");
    try {
      const html = /\.docx$/i.test(file.name)
        ? (await (await import("mammoth")).convertToHtml({ arrayBuffer: await file.arrayBuffer() })).value
        : await file.text();
      const sanitizedHtml = sanitizeAttendanceTemplateHtml(html);
      if (!sanitizedHtml.trim()) throw new Error("File tidak memiliki konten HTML yang dapat digunakan.");
      if (sanitizedHtml.length > 200_000) {
        throw new Error("Konten HTML hasil konversi melebihi batas 200 KB.");
      }
      setWeeklyTemplate(sanitizedHtml);
      setWeeklyTemplateFileName(file.name);
      setWeeklyTemplateNotice(`Format ${file.name} berhasil dimuat. Simpan untuk menerapkannya.`);
    } catch (fileError) {
      setWeeklyTemplateError(`Format rekap gagal dibaca: ${errorMessage(fileError)}`);
    }
  };

  const saveWeeklyTemplate = async () => {
    const html = sanitizeAttendanceTemplateHtml(weeklyTemplate);
    if (!html.trim()) {
      setWeeklyTemplateError("Konten format rekap tidak boleh kosong.");
      return;
    }
    if (html.length > 200_000) {
      setWeeklyTemplateError("Konten format rekap maksimal 200 KB.");
      return;
    }
    setWeeklyTemplateSaving(true);
    setWeeklyTemplateError("");
    setWeeklyTemplateNotice("");
    try {
      const { error: saveError } = await supabase
        .from("attendance_weekly_report_templates")
        .upsert({
          id: 1,
          html_template: html,
          source_file_name: weeklyTemplateFileName || "Editor HTML",
          updated_at: new Date().toISOString(),
          updated_by: currentUser?.id ?? null,
        });
      if (saveError) throw saveError;
      setWeeklyTemplate(html);
      setWeeklyTemplateNotice("Format rekap mingguan berhasil disimpan.");
    } catch (saveError) {
      setWeeklyTemplateError(`Format rekap gagal disimpan: ${errorMessage(saveError)}`);
    } finally {
      setWeeklyTemplateSaving(false);
    }
  };

  const createWeeklyReportHtml = (report: (typeof weeklyReportData)[number]) => {
    const formatDate = (dateValue: string, options: Intl.DateTimeFormatOptions = { day: "2-digit", month: "2-digit" }) =>
      new Intl.DateTimeFormat("id-ID", { ...options, timeZone: "UTC" })
        .format(new Date(`${dateValue}T00:00:00Z`));
    const start = new Date(`${weeklyStartDate}T00:00:00Z`);
    const end = new Date(`${weeklyDays[4]}T00:00:00Z`);
    const rangeLabel = `${formatDate(weeklyStartDate, { day: "numeric" })} s.d. ${formatDate(weeklyDays[4], { day: "numeric", month: "long" })} ${end.getUTCFullYear()} (Minggu ke-${Math.ceil(start.getUTCDate() / 7)})`;
    const dayNames = ["Senin", "Selasa", "Rabu", "Kamis", "Jum'at"];
    const dayHeaders = dayNames.map((day) => `<th class="day-heading">${day}</th>`).join("");
    const subHeaders = `${weeklyDays.map((day) => `<th>(${escapeAttendanceHtml(formatDate(day))})</th>`).join("")}<th>H</th><th>T</th><th>S</th><th>I</th><th>A</th>`;
    const tableRows = report.students.map((student, index) => {
      const dayCells = weeklyDays.map((day) => {
        const row = student.days.get(day);
        const code = row ? weeklyStatusCode[row.status] : undefined;
        const time = row?.recorded_at ? `<small>${escapeAttendanceHtml(formatWitaTime(row.recorded_at))}</small>` : "";
        const noteText = row?.note ? `<small>${escapeAttendanceHtml(row.note)}</small>` : "";
        return `<td class="day-cell">${code ?? (day > today() ? "—" : row?.is_effective_day ? "—" : "Libur")}${time}${noteText}</td>`;
      }).join("");
      return `<tr><td>${index + 1}</td><td class="report-identifier">${escapeAttendanceHtml(student.identifier || "—")}</td><td>${escapeAttendanceHtml(student.name)}</td><td>${student.gender ?? "—"}</td>${dayCells}<td>${student.counts.H}</td><td>${student.counts.T}</td><td>${student.counts.S}</td><td>${student.counts.I}</td><td>${student.counts.A}</td><td>${student.percentage === null ? "—" : `${student.percentage}%`}</td><td class="remarks">${escapeAttendanceHtml(student.remarks)}</td></tr>`;
    }).join("");
    const attendanceTable = `<table class="weekly-attendance"><thead>
      <tr><th rowspan="2">No.</th><th rowspan="2">NISN</th><th rowspan="2">Nama Siswa</th><th rowspan="2">JK</th>${dayHeaders}<th colspan="5">Rekapitulasi</th><th rowspan="2">Persentase Hadir</th><th rowspan="2">Keterangan/Tindak Lanjut</th></tr>
      <tr>${subHeaders}</tr></thead><tbody>${tableRows}</tbody></table>`;
    const letterhead = getSchoolLetterhead(schoolSettings, letterheadSlot);
    const safeImage = (url: string) => /^(?:https?:\/\/|\/(?!\/))/i.test(url) ? escapeAttendanceHtml(url) : "";
    const kopSurat = `<div class="report-letterhead kop-${letterhead.layout}">
      <img class="province-logo" src="${safeImage(letterhead.province_logo_url)}" alt="">
      <div class="letterhead-copy"><p>PEMERINTAH PROVINSI SULAWESI SELATAN</p><p>DINAS PENDIDIKAN</p><h2>${escapeAttendanceHtml(letterhead.school_name)}</h2><p>${escapeAttendanceHtml(letterhead.letterhead)}</p></div>
      ${letterhead.layout === "2" ? `<img class="school-logo" src="${safeImage(letterhead.school_logo_url)}" alt="">` : ""}
    </div><div class="letterhead-rule"></div>`;
    const teacherLabel = role === "guru_bk" ? "Guru BK" : "Wali Kelas / Guru Pengampu";
    const coreMarkup = `${kopSurat}<h1>REKAPITULASI KEHADIRAN MINGGUAN PESERTA DIDIK (ABSENSI DIGITAL)</h1>
      <div class="metadata"><div><strong>Kelas / Rombel:</strong> ${escapeAttendanceHtml(report.className)}</div><div><strong>Periode Tanggal:</strong> ${escapeAttendanceHtml(rangeLabel)}</div><div><strong>${teacherLabel}:</strong> ${escapeAttendanceHtml(currentUser?.full_name ?? "—")}</div></div>
      ${attendanceTable}<p class="codes"><strong>Keterangan Kode:</strong> H = Hadir, T = Terlambat, S = Sakit, I = Izin, A = Alpa.</p>`;
    const variables: Record<string, string> = {
      nama_kelas: escapeAttendanceHtml(report.className),
      wali_kelas: escapeAttendanceHtml(currentUser?.full_name ?? "—"),
      nip_wali_kelas: escapeAttendanceHtml(currentUser?.nip_or_nisn ?? "—"),
      periode_minggu: escapeAttendanceHtml(rangeLabel),
      label_penanggung_jawab: escapeAttendanceHtml(teacherLabel),
      tanggal_unduh: escapeAttendanceHtml(new Intl.DateTimeFormat("id-ID", { dateStyle: "long", timeZone: attendanceTimezone }).format(new Date())),
      tabel_kehadiran: attendanceTable,
      kop_surat: kopSurat,
      baris_siswa: attendanceTable,
    };
    ["tgl_senin", "tgl_selasa", "tgl_rabu", "tgl_kamis", "tgl_jumat"].forEach((key, index) => {
      variables[key] = escapeAttendanceHtml(formatDate(weeklyDays[index]));
    });
    const template = sanitizeAttendanceTemplateHtml(weeklyTemplate);
    const hasReportTablePlaceholder = template.includes("{{baris_siswa}}") || template.includes("{{tabel_kehadiran}}");
    const attendanceGridTable = /<table\b[^>]*class=["'][^"']*\battendance-grid\b[^"']*["'][^>]*>[\s\S]*?<\/table>/i;
    const legacyTableTemplate = hasReportTablePlaceholder && attendanceGridTable.test(template);
    const rowsPlaceholderInBody = /<tbody\b[^>]*>[\s\S]*?\{\{baris_siswa\}\}[\s\S]*?<\/tbody>/i.test(template);
    variables.baris_siswa = rowsPlaceholderInBody ? tableRows : attendanceTable;
    const tableTemplate = legacyTableTemplate
      ? template
        .replace(/\{\{(tabel_kehadiran|baris_siswa)\}\}/g, "")
        .replace(attendanceGridTable, attendanceTable)
      : template;
    const body = hasReportTablePlaceholder
      ? tableTemplate.replace(/\{\{(nama_kelas|wali_kelas|nip_wali_kelas|periode_minggu|tanggal_unduh|label_penanggung_jawab|tgl_senin|tgl_selasa|tgl_rabu|tgl_kamis|tgl_jumat|tabel_kehadiran|kop_surat|baris_siswa)\}\}/g,
        (_placeholder, key: string) => legacyTableTemplate && (key === "baris_siswa" || key === "tabel_kehadiran") ? "" : variables[key] ?? "")
      : coreMarkup;
    const finalBody = /\bclass=["'][^"']*\breport-letterhead\b[^"']*["']/i.test(body) ? body : `${kopSurat}${body}`;
    return `<!doctype html><html lang="id"><head><meta charset="utf-8"><title>Rekap ${escapeAttendanceHtml(report.className)}</title>
      <style>
        @page{size:A4 landscape;margin:10mm}
        *{box-sizing:border-box}body{font:9px Arial,sans-serif;color:#111;margin:0}
        .report-letterhead{display:grid;grid-template-columns:86px 1fr 86px;align-items:center;gap:12px;text-align:center;min-height:76px}
        .report-letterhead.kop-1,.report-letterhead.kop-3{grid-template-columns:86px 1fr}
        .report-letterhead img{max-width:76px;max-height:76px;object-fit:contain}
        .letterhead-copy p{margin:1px 0;font-size:9px}.letterhead-copy h2{margin:2px 0;font-size:15px}
        .letterhead-rule{border-top:3px double #111;margin:4px 0 10px}
        h1{text-align:center;font-size:14px;margin:6px 0 10px}
        .metadata{display:grid;grid-template-columns:1fr 1.4fr 1fr;gap:6px;margin:7px 0}
        .weekly-attendance{width:100%;border-collapse:collapse;table-layout:fixed;margin-top:7px}
        .weekly-attendance th,.weekly-attendance td{border:1px solid #111;padding:3px;text-align:center;vertical-align:middle;overflow-wrap:anywhere}
        .weekly-attendance th{background:#67d4f5;font-weight:700}
        .weekly-attendance th:nth-child(3),.weekly-attendance td:nth-child(3){width:14%;text-align:left}
        .weekly-attendance th:nth-child(2),.weekly-attendance td:nth-child(2),.report-identifier{width:110px;white-space:nowrap;word-break:keep-all}
        .weekly-attendance th:last-child,.weekly-attendance td:last-child{width:16%}
        .weekly-attendance .day-cell{font-size:9px}.weekly-attendance small{display:block;font-size:7px;margin-top:1px}
        .weekly-attendance .remarks{text-align:left}.codes{margin-top:7px}
        @media print{body{margin:0}}
      </style></head><body>${finalBody}</body></html>`;
  };

  const printWeeklyReport = (report: (typeof weeklyReportData)[number]) => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      setHomeroomError("Jendela cetak diblokir browser. Izinkan pop-up lalu coba lagi.");
      return;
    }
    printWindow.document.open();
    printWindow.document.write(createWeeklyReportHtml(report));
    printWindow.document.close();
    printWindow.focus();
    window.setTimeout(() => printWindow.print(), 250);
  };

  const exportWeeklyReport = (report: (typeof weeklyReportData)[number]) => {
    const workbook = XLSX.utils.book_new();
    const dayNames = ["Senin", "Selasa", "Rabu", "Kamis", "Jum'at"];
    const headers = [
      "No.", "NISN", "Nama Siswa", "JK",
      ...dayNames.map((day, index) => `${day} (${new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "2-digit", timeZone: "UTC" }).format(new Date(`${weeklyDays[index]}T00:00:00Z`))})`),
      "H", "T", "S", "I", "A", "Persentase Hadir", "Keterangan/Tindak Lanjut",
    ];
    const values = report.students.map((student, index) => [
      index + 1,
      student.identifier || "—",
      student.name,
      student.gender ?? "—",
      ...weeklyDays.map((day) => {
        const row = student.days.get(day);
        if (!row) return "—";
        const code = weeklyStatusCode[row.status] ?? "—";
        const time = row.recorded_at ? ` ${formatWitaTime(row.recorded_at)}` : "";
        const dayLabel = row.is_effective_day || day > today() ? code : "Libur";
        return `${dayLabel}${time}${row.note ? `\n${row.note}` : ""}`;
      }),
      student.counts.H,
      student.counts.T,
      student.counts.S,
      student.counts.I,
      student.counts.A,
      student.percentage === null ? "—" : `${student.percentage}%`,
      student.remarks,
    ]);
    const sheet = XLSX.utils.aoa_to_sheet([
      ["REKAPITULASI KEHADIRAN MINGGUAN PESERTA DIDIK (ABSENSI DIGITAL)"],
      [`Kelas / Rombel: ${report.className}`],
      [`Periode Tanggal: ${weeklyStartDate} s.d. ${weeklyDays[4]}`],
      [`Wali Kelas / Guru Pengampu: ${currentUser?.full_name ?? "—"}`],
      headers,
      ...values,
      [],
      ["Keterangan Kode: H = Hadir, T = Terlambat, S = Sakit, I = Izin, A = Alpa"],
    ]);
    report.students.forEach((student, index) => {
      const cell = sheet[XLSX.utils.encode_cell({ r: index + 5, c: 1 })];
      if (cell) {
        cell.t = "s";
        cell.v = String(student.identifier || "—");
        cell.z = "@";
      }
    });
    sheet["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 15 } }];
    sheet["!cols"] = [
      { wch: 5 }, { wch: 14 }, { wch: 28 }, { wch: 5 },
      ...Array.from({ length: 5 }, () => ({ wch: 14 })),
      ...Array.from({ length: 5 }, () => ({ wch: 5 })),
      { wch: 14 }, { wch: 38 },
    ];
    sheet["!rows"] = values.map(() => ({ hpt: 30 }));
    XLSX.utils.book_append_sheet(workbook, sheet, "Rekap Mingguan");
    XLSX.writeFile(workbook, `Rekap-Mingguan-${report.className.replace(/[\\/:*?"<>|]/g, "-")}.xlsx`);
  };

  const exportRows = async (monthly = false) => {
    setError("");
    if (role === "siswa") {
      setError("Fitur unduh riwayat kehadiran tidak tersedia untuk akun siswa.");
      return;
    }
    if (isSelfService && !identity) {
      setError(identityError || "Identitas akun belum terhubung ke Data Induk.");
      return;
    }
    if (monthly && !/^\d{4}-\d{2}$/.test(month)) {
      setError("Pilih bulan yang valid untuk ekspor.");
      return;
    }
    setExporting(true);
    try {
      let loadedRows: AttendanceExportRow[] = [];
      if (attendanceView !== "subjects") {
        let offset = 0;
        while (true) {
          let query = supabase
            .from("attendance_records")
            .select("attendance_date,person_type,person_identifier,person_name,class_name,status,note,created_at")
            .order("attendance_date")
            .order("person_name")
            .order("id");
          if (isSelfService && identity) {
            query = query
              .eq("person_type", identity.personType)
              .eq("person_identifier", identity.identifier);
          }
          if (monthly) {
            const [year, mon] = month.split("-").map(Number);
            const nextMonth = new Date(Date.UTC(year, mon, 1)).toISOString().slice(0, 10);
            query = query.gte("attendance_date", `${month}-01`).lt("attendance_date", nextMonth);
          } else {
            query = query.eq("attendance_date", date);
          }
          const { data, error: exportError } = await query.range(offset, offset + attendancePageSize - 1);
          if (exportError) throw exportError;
          const page = (data ?? []) as AttendanceExportRow[];
          loadedRows = loadedRows.concat(page);
          if (page.length < attendancePageSize) break;
          offset += attendancePageSize;
        }
      }

      let qrOffset = 0;
      while (true) {
        let query = supabase
          .from("attendance_qr_records")
          .select("attendance_date,person_identifier,person_name,class_name,session_type,subject,teacher_name,status,note,is_voided,created_at")
          .in("session_type", ["subject", "school_departure"])
          .eq("is_voided", false)
          .order("attendance_date")
          .order("created_at");
        if (attendanceView === "subjects") {
          query = query
            .eq("session_type", "subject")
            .eq("teacher_name", currentUser?.full_name ?? "");
          if (subjectFilter !== "all") query = query.eq("subject", subjectFilter);
          if (subjectClassFilter !== "all") query = query.eq("class_name", subjectClassFilter);
        } else if (isSelfService && identity) {
          query = query
            .eq("person_type", identity.personType)
            .eq("person_identifier", identity.identifier)
            .neq("session_type", "subject");
        }
        if (monthly) {
          const [year, mon] = month.split("-").map(Number);
          const nextMonth = new Date(Date.UTC(year, mon, 1)).toISOString().slice(0, 10);
          query = query.gte("attendance_date", `${month}-01`).lt("attendance_date", nextMonth);
        } else {
          query = query.eq("attendance_date", date);
        }
        const { data, error: qrExportError } = await query.range(qrOffset, qrOffset + attendancePageSize - 1);
        if (qrExportError) throw qrExportError;
        const page = (data ?? []) as AttendanceQrExportRecord[];
        loadedRows = loadedRows.concat(page.map(row => ({
          attendance_date: row.attendance_date,
          person_type: "siswa",
          person_identifier: row.person_identifier,
          person_name: row.person_name,
          class_name: row.class_name,
          status: row.session_type === "school_departure" ? "pulang" : row.status,
          note: row.session_type === "subject"
            ? `Mapel: ${row.subject || "—"} · Guru: ${row.teacher_name || "—"}${row.note ? ` · ${row.note}` : ""}`
            : row.note ?? (row.session_type === "school_departure"
            ? "QR kepulangan sekolah"
            : `QR mata pelajaran: ${row.subject || "—"}${row.teacher_name ? ` · ${row.teacher_name}` : ""}`),
          created_at: row.created_at,
        })));
        if (page.length < attendancePageSize) break;
        qrOffset += attendancePageSize;
      }

      const output = loadedRows.map((r) => ({
        Tanggal:r.attendance_date, Jenis:r.person_type === "siswa" ? "Siswa" : "Guru/Tendik",
        "NISN/NIP":r.person_identifier, Nama:r.person_name, Kelas:r.class_name ?? "",
        Status:statusLabel(r.status), Keterangan:r.note ?? ""
      }));
      const wb = XLSX.utils.book_new();
      const sheet = XLSX.utils.json_to_sheet(output);
      output.forEach((row, index) => {
        const cell = sheet[XLSX.utils.encode_cell({ r: index + 1, c: 2 })];
        if (cell) {
          cell.t = "s";
          cell.v = String(row["NISN/NIP"]);
          cell.z = "@";
        }
      });
      XLSX.utils.book_append_sheet(wb, sheet, "Rekap Absensi");
      XLSX.writeFile(wb, `Rekap-Absensi-${monthly ? month : date}.xlsx`);
    } catch (exportError) {
      setError("Ekspor gagal: " + errorMessage(exportError));
    } finally {
      setExporting(false);
    }
  };
  const loadMonthlyReport = async () => {
    if (!canManageAttendance) return;
    if (!/^\d{4}-\d{2}$/.test(month)) {
      setMonthlyReportError("Pilih bulan yang valid untuk rekap bulanan.");
      return;
    }

    setMonthlyReportLoading(true);
    setMonthlyReportError("");
    setMonthlyReportRows([]);
    setMonthlyLoadedMonth("");
    try {
      const [year, monthNumber] = month.split("-").map(Number);
      const nextMonth = new Date(Date.UTC(year, monthNumber, 1)).toISOString().slice(0, 10);
      const loadedAttendance: AttendanceExportRow[] = [];
      let offset = 0;
      while (true) {
        const { data, error: attendanceError } = await supabase
          .from("attendance_records")
          .select("attendance_date,person_type,person_identifier,person_name,class_name,status,note,created_at")
          .gte("attendance_date", `${month}-01`)
          .lt("attendance_date", nextMonth)
          .order("attendance_date")
          .order("person_name")
          .range(offset, offset + attendancePageSize - 1);
        if (attendanceError) throw attendanceError;
        const page = (data ?? []) as AttendanceExportRow[];
        loadedAttendance.push(...page);
        if (page.length < attendancePageSize) break;
        offset += attendancePageSize;
      }

      const loadedQr: AttendanceQrExportRecord[] = [];
      let qrOffset = 0;
      while (true) {
        const { data, error: qrError } = await supabase
          .from("attendance_qr_records")
          .select("attendance_date,person_identifier,person_name,class_name,session_type,subject,teacher_name,status,note,is_voided,created_at")
          .in("session_type", ["subject", "school_departure"])
          .eq("is_voided", false)
          .gte("attendance_date", `${month}-01`)
          .lt("attendance_date", nextMonth)
          .order("attendance_date")
          .order("created_at")
          .range(qrOffset, qrOffset + attendancePageSize - 1);
        if (qrError) throw qrError;
        const page = (data ?? []) as AttendanceQrExportRecord[];
        loadedQr.push(...page);
        if (page.length < attendancePageSize) break;
        qrOffset += attendancePageSize;
      }

      const unknownEmployees = loadedAttendance.filter((row) =>
        row.person_type === "guru_tendik"
        && !employeeClassifications.has(row.person_identifier),
      );
      if (unknownEmployees.length) {
        throw new Error(
          `${unknownEmployees.length} catatan Guru/Tendik tidak memiliki kategori yang cocok di Data Induk; periksa NIP sebelum membuat laporan.`,
        );
      }
      const reportRows: MonthlyAttendanceReportRow[] = [
        ...loadedAttendance.map((row) => ({
          attendance_date: row.attendance_date,
          person_identifier: row.person_identifier,
          person_name: row.person_name,
          person_type: row.person_type,
          class_name: row.class_name,
          status: row.status,
          note: row.note,
          session_type: null,
          subject: null,
          teacher_name: null,
          user_category: row.person_type === "siswa"
            ? "siswa" as const
            : employeeClassifications.get(row.person_identifier)!.category,
          created_at: row.created_at,
        })),
        ...loadedQr.map((row) => ({
          attendance_date: row.attendance_date,
          person_identifier: row.person_identifier,
          person_name: row.person_name,
          person_type: "siswa" as const,
          class_name: row.class_name,
          status: row.session_type === "school_departure" ? "pulang" as const : row.status,
          note: row.note,
          session_type: row.session_type,
          subject: row.subject,
          teacher_name: row.teacher_name,
          user_category: "siswa" as const,
          created_at: row.created_at,
        })),
      ].sort((a, b) => a.attendance_date.localeCompare(b.attendance_date)
        || a.person_name.localeCompare(b.person_name, "id-ID")
        || a.created_at.localeCompare(b.created_at));
      setMonthlyReportRows(reportRows);
      setMonthlyLoadedMonth(month);
    } catch (reportError) {
      setMonthlyReportRows([]);
      setMonthlyLoadedMonth("");
      setMonthlyReportError(`Rekap bulanan gagal dimuat: ${errorMessage(reportError)}`);
    } finally {
      setMonthlyReportLoading(false);
    }
  };
  const handleMonthlyTemplateFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!/\.(html?|htm)$/i.test(file.name)) {
      setMonthlyTemplateError("Pilih file template .html atau .htm.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setMonthlyTemplateError("Ukuran file template maksimal 5 MB.");
      return;
    }
    try {
      const html = sanitizeAttendanceTemplateHtml(await file.text());
      if (!html.trim()) throw new Error("File tidak memiliki konten HTML yang dapat digunakan.");
      if (html.length > 200_000) throw new Error("Konten HTML maksimal 200 KB.");
      setMonthlyTemplate(html);
      setMonthlyTemplateFileName(file.name);
      setMonthlyTemplateError("");
    } catch (templateError) {
      setMonthlyTemplateError(`Template gagal dibaca: ${errorMessage(templateError)}`);
    }
  };
  const monthlyReportCategoryLabel = adminCategory === "all"
    ? "Semua"
    : adminCategory === "guru"
      ? adminTeacherFilter === "guru_bk" ? "Guru BK" : adminTeacherFilter === "guru" ? "Guru Mapel" : "Guru & Guru BK"
      : adminCategory === "tendik" ? "Tendik" : "Siswa";
  const monthlyFilteredRows = useMemo(() => monthlyReportRows.filter((row) => {
    if (adminCategory !== "all" && row.user_category !== adminCategory) return false;
    if (adminCategory === "guru" && row.user_category === "guru" && adminTeacherFilter !== "all") {
      return employeeClassifications.get(row.person_identifier)?.teacherRole === adminTeacherFilter;
    }
    return true;
  }), [adminCategory, adminTeacherFilter, employeeClassifications, monthlyReportRows]);
  const monthlyReportHtml = useMemo(() => {
    const monthLabel = /^\d{4}-\d{2}$/.test(month)
      ? new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric", timeZone: "UTC" })
        .format(new Date(`${month}-01T00:00:00Z`))
      : month;
    const records = monthlyLoadedMonth === month ? monthlyFilteredRows : [];
    const statusCounts = statuses.map((status) =>
      `<li>${status.label}: <strong>${records.filter((row) => row.status === status.value).length}</strong></li>`,
    ).join("");
    const rowsHtml = records.map((row, index) => `<tr>
      <td>${index + 1}</td>
      <td class="report-identifier">${escapeAttendanceHtml(row.person_identifier || "—")}</td>
      <td>${escapeAttendanceHtml(row.person_name)}</td>
      <td>${escapeAttendanceHtml(row.class_name ?? "—")}</td>
      <td>${escapeAttendanceHtml(row.session_type === "subject" ? row.subject ?? "Mapel" : row.user_category === "siswa" ? "Sekolah" : "Pribadi")}</td>
      <td>${escapeAttendanceHtml(row.session_type === "subject" ? row.teacher_name ?? "—" : "—")}</td>
      <td>${escapeAttendanceHtml(statusLabel(row.status))}</td>
      <td>${escapeAttendanceHtml(row.note ?? "—")}</td>
    </tr>`).join("");
    const table = `<table class="monthly-attendance"><thead><tr>
      <th>No.</th><th>NISN / NIP</th><th>Nama</th><th>Kelas</th><th>Mapel / Jenis</th><th>Guru Pengampu</th><th>Status</th><th>Keterangan</th>
      </tr></thead><tbody>${rowsHtml || `<tr><td colspan="8">Tidak ada catatan pada periode ini.</td></tr>`}</tbody></table>`;
    const letterhead = getSchoolLetterhead(schoolSettings, letterheadSlot);
    const safeImage = (url: string) => /^(?:https?:\/\/|\/(?!\/))/i.test(url) ? escapeAttendanceHtml(url) : "";
    const letterheadHtml = `<div class="report-letterhead kop-${letterhead.layout}">
      <img src="${safeImage(letterhead.province_logo_url)}" alt="">
      <div><p>PEMERINTAH PROVINSI SULAWESI SELATAN</p><p>DINAS PENDIDIKAN</p><h2>${escapeAttendanceHtml(letterhead.school_name)}</h2><p>${escapeAttendanceHtml(letterhead.letterhead)}</p></div>
      ${letterhead.layout === "2" ? `<img src="${safeImage(letterhead.school_logo_url)}" alt="">` : ""}
    </div><div class="report-rule"></div>`;
    const summary = `<ul class="report-summary">${statusCounts}<li>Total catatan: <strong>${records.length}</strong></li></ul>`;
    const variables: Record<string, string> = {
      kop_surat: letterheadHtml,
      judul_rekap: "REKAPITULASI KEHADIRAN BULANAN",
      kategori_pengguna: escapeAttendanceHtml(monthlyReportCategoryLabel),
      bulan_tahun: escapeAttendanceHtml(monthLabel),
      tabel_rekap_bulanan: table,
      ringkasan_rekap: summary,
      tanggal_unduh: escapeAttendanceHtml(new Intl.DateTimeFormat("id-ID", {
        dateStyle: "long",
        timeZone: attendanceTimezone,
      }).format(new Date())),
      kepala_sekolah: escapeAttendanceHtml(schoolSettings?.principal_name?.trim() || "—"),
      nip_kepala_sekolah: escapeAttendanceHtml(schoolSettings?.principal_nip?.trim() || "—"),
    };
    const template = sanitizeAttendanceTemplateHtml(monthlyTemplate);
    const hasTableToken = template.includes("{{tabel_rekap_bulanan}}");
    const defaultBody = `${letterheadHtml}<h1>REKAPITULASI KEHADIRAN BULANAN</h1>
      <p><strong>Kategori:</strong> ${variables.kategori_pengguna}</p>
      <p><strong>Periode:</strong> ${variables.bulan_tahun}</p>${summary}${table}
      <p>Diunduh pada ${variables.tanggal_unduh}</p>
      <div class="report-signature"><p>Kepala Sekolah</p><br><strong>${variables.kepala_sekolah}</strong><br>NIP. ${variables.nip_kepala_sekolah}</div>`;
    const body = template.includes("{{")
      ? template.replace(/\{\{(kop_surat|judul_rekap|kategori_pengguna|bulan_tahun|tabel_rekap_bulanan|ringkasan_rekap|tanggal_unduh|kepala_sekolah|nip_kepala_sekolah)\}\}/g,
        (_placeholder, key: string) => variables[key] ?? "")
      : template.trim() || defaultBody;
    const finalBody = hasTableToken ? body : `${body}${table}`;
    return `<!doctype html><html lang="id"><head><meta charset="utf-8"><title>Rekap Kehadiran ${escapeAttendanceHtml(monthLabel)}</title>
      <style>
        *{box-sizing:border-box}body{margin:0;padding:24px;color:#182033;font:12px Arial,sans-serif}
        h1{text-align:center;font-size:17px;margin:18px 0}.report-letterhead{display:grid;grid-template-columns:78px 1fr 78px;align-items:center;gap:12px;text-align:center}
        .report-letterhead.kop-1,.report-letterhead.kop-3{grid-template-columns:78px 1fr}.report-letterhead img{max-width:70px;max-height:70px;object-fit:contain}
        .report-letterhead p{margin:2px;font-size:10px}.report-letterhead h2{margin:3px;font-size:15px}.report-rule{border-top:3px double #111;margin:8px 0 16px}
        .monthly-attendance{width:100%;border-collapse:collapse;font-size:10px}.monthly-attendance th,.monthly-attendance td{border:1px solid #333;padding:5px;text-align:left;vertical-align:top}
        .monthly-attendance th{background:#edf1f8}.monthly-attendance .report-identifier{width:110px;white-space:nowrap;word-break:keep-all}
        .report-summary{display:flex;flex-wrap:wrap;gap:16px;list-style:none;padding:0}.report-signature{margin:35px 5% 0 auto;width:230px;text-align:center}.report-date{text-align:right}
        @page{size:A4 landscape;margin:12mm}@media print{body{padding:0}}
      </style></head><body>${finalBody}</body></html>`;
  }, [letterheadSlot, month, monthlyFilteredRows, monthlyLoadedMonth, monthlyReportCategoryLabel, monthlyTemplate, schoolSettings]);
  const printMonthlyReport = () => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      setMonthlyReportError("Jendela cetak diblokir browser. Izinkan pop-up lalu coba lagi.");
      return;
    }
    printWindow.document.open();
    printWindow.document.write(monthlyReportHtml);
    printWindow.document.close();
    printWindow.focus();
    window.setTimeout(() => printWindow.print(), 250);
  };
  const downloadMonthlyHtml = () => {
    const blob = new Blob([monthlyReportHtml], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Rekap-Kehadiran-${month}-${adminCategory}.html`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const attendanceTabs: Array<{ value: AttendanceView | "all" | AttendanceUserCategory; label: string }> =
    canManageAttendance
      ? [
        { value: "guru", label: "Rekap Guru" },
        { value: "tendik", label: "Rekap Tendik" },
        { value: "siswa", label: "Rekap Siswa" },
        { value: "all", label: "Semua" },
      ]
      : isTeacher
        ? [
          { value: "personal", label: "Absensi & Rekap Saya" },
          { value: "subjects", label: "Rekap Mapel Saya" },
          { value: "homeroom", label: "Kelas Perwalian" },
        ]
        : role === "guru_bk"
          ? [
            { value: "personal", label: "Absensi & Rekap Saya" },
            { value: "monitor", label: "Pantauan Siswa (Read-Only)" },
          ]
          : isSelfService
            ? [{ value: "personal", label: "Absensi & Rekap Kehadiran Saya" }]
            : [{ value: "admin", label: "Rekap Harian" }];
  const activeAttendanceTab = canManageAttendance ? adminCategory : attendanceView;
  if (!isSelfService && !canViewAllAttendance) {
    return <div className="attendance-page">
      <div className="attendance-alert error">
        <ShieldCheck size={17}/> Akun ini tidak memiliki hak akses ke modul Absensi Digital.
      </div>
    </div>;
  }

  return <div className="attendance-page">
    <div className="attendance-hero">
      <div className="attendance-hero-decoration" aria-hidden="true"><span/><span/><span/></div>
      <div className="attendance-hero-icon"><CalendarDays size={28}/></div>
      <div><span className="attendance-eyebrow">MANAJEMEN KEHADIRAN</span><h1>Absensi Digital</h1>
      <p>{isAdminMonitor
        ? "Pindai QR pribadi siswa dan atur jadwal kedatangan serta kepulangan sekolah."
        : isTeacher
          ? "Kelola QR mata pelajaran dan pantau rekap siswa pada sesi yang Anda buat."
          : isSelfService
            ? "Catat dan lihat kehadiran yang terhubung dengan akun Anda."
            : "Absensi siswa serta guru dan tenaga kependidikan dalam Super App SMAN 7 Maros."}</p></div>
    </div>
    <nav className="attendance-segment-tabs" aria-label="Kategori rekap kehadiran">
            {attendanceTabs.map((tab) => (
              <button
                type="button"
                key={tab.value}
                className={activeAttendanceTab === tab.value ? "is-active" : ""}
                aria-pressed={activeAttendanceTab === tab.value}
                onClick={() => {
                  setFilter("");
                  if (canManageAttendance) {
                    const nextCategory = tab.value as "all" | AttendanceUserCategory;
                    setAdminCategory(nextCategory);
                    setAttendanceView("admin");
                  } else {
                    setAttendanceView(tab.value as AttendanceView);
                  }
                }}
              >
                {tab.label}
              </button>
            ))}
    </nav>
    <div className="attendance-stats">
      {summary.map((s, index) => <div className={`attendance-stat stat-${s.value}`} style={{"--stat-delay": `${index * 70}ms`} as React.CSSProperties} key={s.value}>
        <div className="attendance-stat-icon">{s.value === "hadir" ? <UserCheck size={19}/> : s.value === "sakit" ? <Stethoscope size={19}/> : <CalendarDays size={19}/>}</div>
        <div><span>{s.label}</span><strong>{s.count}</strong></div>
      </div>)}
    </div>
    {(isTeacher || canManageAttendance) && <section className="attendance-qr-panel">
      <div className="attendance-qr-heading">
        <div>        <span className="attendance-qr-eyebrow">ABSENSI TANPA KONTAK</span>
          <h2>{isTeacher ? "QR Kehadiran Mata Pelajaran" : "Pemindaian QR Pribadi Siswa"}</h2>
          <p>{isTeacher
            ? "Tentukan mata pelajaran dan kelas. QR hanya berlaku untuk siswa kelas tersebut."
            : "Siswa menampilkan QR pribadi pada halaman Absensi. Petugas memindainya melalui formulir Catat Kehadiran di bawah."}</p>
        </div>
        <span className="attendance-qr-badge">QR TERBATAS WAKTU</span>
      </div>
      {isTeacher && (qrSession ? <div className="attendance-qr-active">
        <div className="attendance-qr-code"><QRCodeSVG value={`SMAN7ABSENSI|${qrSession.token}`} size={220} level="M" includeMargin/></div>
        <div className="attendance-qr-session-info">
          <strong>{qrSession.session_type === "subject" ? qrSession.subject : qrSession.session_type === "school_departure" ? "Kepulangan sekolah" : "Kedatangan sekolah"}</strong>
          <span>Untuk tanggal {new Date(`${qrSession.attendance_date}T00:00:00`).toLocaleDateString("id-ID",{day:"2-digit",month:"long",year:"numeric"})}</span>
          <span>{qrSession.class_name ? `Kelas ${qrSession.class_name}` : "Semua kelas"}</span>
          {qrSession.teacher_name && <span>Guru: {qrSession.teacher_name}</span>}
          {qrSession.expires_at
            ? <small className="attendance-qr-countdown">Sisa waktu sesi: {remainingTimeLabel(qrSession.expires_at, clockNow)} · berakhir pukul {new Date(qrSession.expires_at).toLocaleTimeString("id-ID", {hour:"2-digit",minute:"2-digit",timeZone:"Asia/Makassar"})} WITA</small>
            : <small>QR berlaku sampai akhir tanggal sesi atau ditutup admin. Pemindaian pulang mulai pukul {scheduleSettings.departure_scan_from} WITA.</small>}
          <div className="attendance-qr-manual-code">
            <span>KODE MANUAL TERBARU</span>
            <code>{qrSession.token}</code>
            <button type="button" className="attendance-qr-copy" onClick={()=>void copyQrToken()}>
              <ClipboardCopy size={15}/>
              {copiedQrToken === qrSession.token ? "Kode tersalin" : "Salin kode"}
            </button>
            <small>Siswa dapat memasukkan kode ini jika kamera bermasalah. Gunakan kode terbaru karena kode berubah otomatis.</small>
          </div>
          <button type="button" className="attendance-qr-close" onClick={()=>void closeQrSession()} disabled={qrBusy}>
            {qrBusy ? "Menutup..." : "Akhiri sesi QR"}
          </button>
        </div>
      </div> : <div className="attendance-qr-create">
        {isTeacher && <>
          <label className="attendance-qr-field">
            <span>Mata pelajaran</span>
            <select
              className="attendance-qr-select"
              value={qrSubject}
              onChange={event => {
                const nextSubject = event.target.value;
                setQrSubject(nextSubject);
                setQrClassId(
                  teacherSubjectAssignments.find(
                    (assignment) => assignment.subject === nextSubject,
                  )?.class_id ?? "",
                );
              }}
              disabled={teacherSubjectAssignmentsLoading || !availableQrSubjects.length}
              required
            >
              <option value="">
                {teacherSubjectAssignmentsLoading
                  ? "Memuat penugasan..."
                  : "Pilih mata pelajaran"}
              </option>
              {availableQrSubjects.map(subject => (
                <option key={subject} value={subject}>{subject}</option>
              ))}
            </select>
          </label>
          <label className="attendance-qr-field">
            <span>Kelas</span>
            <select
              className="attendance-qr-select"
              value={qrClassId}
              onChange={event => setQrClassId(event.target.value)}
              disabled={teacherSubjectAssignmentsLoading || !availableQrClasses.length}
              required
            >
              <option value="">Pilih kelas</option>
              {availableQrClasses.map(assignment => (
                <option key={assignment.assignment_id} value={assignment.class_id}>
                  {assignment.class_name} · Tingkat {assignment.grade_level}
                </option>
              ))}
            </select>
          </label>
        </>}
        <button type="button" className="attendance-primary" onClick={()=>void createQrSession()}
          disabled={qrBusy || (
            teacherSubjectAssignmentsLoading ||
            !availableQrSubjects.length ||
            !qrSubject.trim() ||
            !qrClassId
          )}>
          {qrBusy ? "Menyiapkan..." : "Buat QR Kehadiran"}
        </button>
      </div>)}
      {!isTeacher && <div className="attendance-qr-create">
        <p>Gunakan pemindai QR pada formulir Catat Kehadiran untuk memverifikasi QR pribadi siswa. QR sekolah bersama tidak digunakan.</p>
      </div>}
      {isTeacher && qrError && <div className="attendance-alert error" role="alert"><XCircle size={17}/>{qrError}</div>}
      {canManageAttendance && <section className="attendance-admin-arrival-broadcast">
        <div>
          <strong>Kirim QR Kedatangan ke Seluruh Akun Siswa</strong>
          <small>QR bersama berlaku sesuai durasi yang ditetapkan dan kedaluwarsa berdasarkan waktu server Supabase.</small>
        </div>
        {arrivalQrError && <div className="attendance-alert error" role="alert"><XCircle size={17}/>{arrivalQrError}</div>}
        {arrivalQrNotice && <div className="attendance-alert success" role="status"><CheckCircle2 size={17}/>{arrivalQrNotice}</div>}
        {adminArrivalQr && Date.parse(adminArrivalQr.expires_at) > clockNow ? <div className="attendance-qr-active">
          <div className="attendance-qr-code"><QRCodeSVG value={`SMAN7ABSENSI|${adminArrivalQr.token}`} size={200} level="M" includeMargin/></div>
          <div className="attendance-qr-session-info">
            <strong>QR Kedatangan aktif untuk seluruh siswa</strong>
            <span>Sisa waktu: {remainingTimeLabel(adminArrivalQr.expires_at, clockNow)}</span>
            <span>Berakhir pukul {formatWitaTime(adminArrivalQr.expires_at)} WITA</span>
            <div className="attendance-qr-manual-code">
              <span>KODE QR KEDATANGAN</span>
              <code>{adminArrivalQr.token}</code>
              <button type="button" className="attendance-qr-copy" onClick={()=>void copyText(adminArrivalQr.token, `arrival-${adminArrivalQr.token}`)}>
                <ClipboardCopy size={15}/>{copiedQrToken === `arrival-${adminArrivalQr.token}` ? "Kode tersalin" : "Salin Kode"}
              </button>
            </div>
            <button type="button" className="attendance-qr-close" onClick={()=>void closeAdminArrivalQr()} disabled={arrivalQrLoading}>
              {arrivalQrLoading ? "Mengakhiri..." : "Akhiri QR Kedatangan"}
            </button>
          </div>
        </div> : <div className="attendance-broadcast-create">
          <label>Durasi berlaku (menit)
            <input type="number" min={1} max={480} step={1} value={arrivalQrDuration} onChange={event=>setArrivalQrDuration(Number(event.target.value))}/>
          </label>
          <button type="button" className="attendance-primary" onClick={()=>void createAdminArrivalQr()} disabled={arrivalQrLoading}>
            {arrivalQrLoading ? "Mengaktifkan..." : "Aktifkan QR Kedatangan"}
          </button>
        </div>}
      </section>}
      {canManageAttendance && <section className="attendance-admin-arrival-broadcast">
        <div>
          <strong>Kirim QR Kepulangan ke Seluruh Akun Siswa</strong>
          <small>Masa berlaku dihitung dari waktu server dan tetap mengikuti jadwal pemindaian kepulangan sekolah.</small>
        </div>
        {departureQrError && <div className="attendance-alert error" role="alert"><XCircle size={17}/>{departureQrError}</div>}
        {departureQrNotice && <div className="attendance-alert success" role="status"><CheckCircle2 size={17}/>{departureQrNotice}</div>}
        {adminDepartureQr && Date.parse(adminDepartureQr.expires_at) > clockNow ? <div className="attendance-qr-active">
          <div className="attendance-qr-code"><QRCodeSVG value={`SMAN7ABSENSI|${adminDepartureQr.token}`} size={200} level="M" includeMargin/></div>
          <div className="attendance-qr-session-info">
            <strong>QR Kepulangan aktif untuk seluruh siswa</strong>
            <span>Sisa waktu: {remainingTimeLabel(adminDepartureQr.expires_at, clockNow)}</span>
            <span>Berakhir pukul {formatWitaTime(adminDepartureQr.expires_at)} WITA</span>
            <div className="attendance-qr-manual-code">
              <span>KODE QR KEPULANGAN</span>
              <code>{adminDepartureQr.token}</code>
              <button type="button" className="attendance-qr-copy" onClick={()=>void copyText(adminDepartureQr.token, `departure-${adminDepartureQr.token}`, setDepartureQrError)}>
                <ClipboardCopy size={15}/>{copiedQrToken === `departure-${adminDepartureQr.token}` ? "Kode tersalin" : "Salin Kode"}
              </button>
            </div>
            <button type="button" className="attendance-qr-close" onClick={()=>void closeAdminDepartureQr()} disabled={departureQrLoading}>
              {departureQrLoading ? "Mengakhiri..." : "Akhiri QR Kepulangan"}
            </button>
          </div>
        </div> : <div className="attendance-broadcast-create">
          <label>Durasi berlaku (menit)
            <input type="number" min={1} max={480} step={1} value={departureQrDuration} onChange={event=>setDepartureQrDuration(Number(event.target.value))}/>
          </label>
          <button type="button" className="attendance-primary" onClick={()=>void createAdminDepartureQr()} disabled={departureQrLoading}>
            {departureQrLoading ? "Mengaktifkan..." : "Aktifkan QR Kepulangan"}
          </button>
        </div>}
      </section>}
      {canManageAttendance && <details className="attendance-schedule-settings">
        <summary>Pengaturan jadwal absensi dan kalender sekolah</summary>
        {scheduleError && <div className="attendance-alert error" role="alert"><XCircle size={17}/>{scheduleError}</div>}
        {scheduleNotice && <div className="attendance-alert success" role="status"><CheckCircle2 size={17}/>{scheduleNotice}</div>}
        <div className="attendance-schedule-toggle">
          <label>
            <input
              type="checkbox"
              checked={scheduleSettings.automation_enabled}
              onChange={event=>setScheduleSettings(current=>({...current,automation_enabled:event.target.checked}))}
            />
            <span>Aktifkan otomatisasi harian Alpa dan peringatan BK</span>
          </label>
          <small>Berjalan pada hari sekolah (Senin–Jumat), kecuali tanggal yang tercatat sebagai libur.</small>
        </div>
        <div className="attendance-schedule-fields">
          <label>Mulai QR kedatangan (WITA)<input type="time" value={scheduleSettings.arrival_start_time} onChange={event=>setScheduleSettings(current=>({...current,arrival_start_time:event.target.value}))}/></label>
          <label>Batas hadir (WITA)<input type="time" value={scheduleSettings.arrival_ontime_until} onChange={event=>setScheduleSettings(current=>({...current,arrival_ontime_until:event.target.value}))}/></label>
          <label>Batas Alpa otomatis (WITA)<input type="time" value={scheduleSettings.arrival_absent_at} onChange={event=>setScheduleSettings(current=>({...current,arrival_absent_at:event.target.value}))}/></label>
          <label>Durasi QR kedatangan (menit)<input type="number" min={1} max={480} step={1} value={scheduleSettings.arrival_qr_duration_minutes} onChange={event=>setScheduleSettings(current=>({...current,arrival_qr_duration_minutes:Number(event.target.value)}))}/></label>
          <label>Mulai scan kepulangan (WITA)<input type="time" value={scheduleSettings.departure_scan_from} onChange={event=>setScheduleSettings(current=>({...current,departure_scan_from:event.target.value}))}/></label>
          <label>Durasi QR kepulangan (menit)<input type="number" min={1} max={480} step={1} value={scheduleSettings.departure_qr_duration_minutes} onChange={event=>setScheduleSettings(current=>({...current,departure_qr_duration_minutes:Number(event.target.value)}))}/></label>
          <label>Kirim peringatan BK (WITA)<input type="time" value={scheduleSettings.bk_alert_at} onChange={event=>setScheduleSettings(current=>({...current,bk_alert_at:event.target.value}))}/></label>
          <button type="button" className="attendance-primary" onClick={()=>void saveAttendanceSchedule()} disabled={scheduleSaving || scheduleLoading}>
            {scheduleSaving ? "Menyimpan..." : scheduleLoading ? "Memuat..." : "Simpan jadwal"}
          </button>
        </div>
        <p className="attendance-schedule-note">QR kedatangan dibatasi sampai durasi yang ditetapkan atau batas Alpa, mana yang lebih dulu. QR kepulangan berlaku selama durasi yang ditetapkan setelah jam mulai scan.</p>
        <div className="attendance-closure-manager">
          <div><strong>Kalender libur sekolah</strong><small>Tambahkan tanggal libur agar sistem melewati otomasi absensi pada hari tersebut.</small></div>
          <div className="attendance-closure-form">
            <label>Tanggal libur<input type="date" value={closureDate} onChange={event=>setClosureDate(event.target.value)}/></label>
            <label>Keterangan<input value={closureDescription} onChange={event=>setClosureDescription(event.target.value)} maxLength={160} placeholder="Contoh: Libur nasional"/></label>
            <button type="button" className="attendance-secondary" onClick={()=>void addSchoolClosure()} disabled={closureSaving || scheduleLoading}>
              {closureSaving ? "Menambahkan..." : "Tambah tanggal"}
            </button>
          </div>
          {schoolClosures.length > 0
            ? <ul className="attendance-closure-list">{schoolClosures.map(closure=><li key={closure.school_date}>
                <span><strong>{new Date(`${closure.school_date}T00:00:00`).toLocaleDateString("id-ID",{day:"2-digit",month:"long",year:"numeric"})}</strong>{closure.description && <small>{closure.description}</small>}</span>
                <button type="button" className="attendance-closure-remove" onClick={()=>void removeSchoolClosure(closure.school_date)}>Hapus</button>
              </li>)}</ul>
            : <p className="attendance-schedule-note">Belum ada tanggal libur tambahan. Akhir pekan otomatis dianggap bukan hari sekolah.</p>}
        </div>
      </details>}
    </section>}
    <div className="attendance-columns">
      {canRecordAttendance && attendanceView === "personal" && <form className="attendance-panel" onSubmit={event=>{
        if (role === "siswa") event.preventDefault();
        else void saveAttendance(event);
      }}>
        <div className="attendance-panel-title"><div><h2>{isSelfService ? "Absensi Saya" : "Catat Kehadiran"}</h2><p>{isSelfService ? "Identitas diambil dari akun dan Data Induk." : "Cari berdasarkan NISN/NIP; nama akan diisi dari Data Induk."}</p></div><UserCheck size={22}/></div>
        {isSelfService ? <>
          <div className="attendance-person-card">
            <div className="attendance-person-avatar"><UserCheck size={21}/></div>
            <div className="attendance-person-details">
              <span>{role === "siswa" ? "SISWA" : role === "guru_bk" ? "GURU BK" : "GURU / TENDIK"}</span>
              <strong>{identityLoading ? "Memuat identitas..." : identity?.name ?? "Identitas belum terhubung"}</strong>
              {identity && <small>{identity.identifier}{identity.className ? ` · Kelas ${identity.className}` : ""}</small>}
            </div>
            {identity && <CheckCircle2 size={20} className="attendance-person-verified"/>}
          </div>
          {identityError && <div className="attendance-alert error"><XCircle size={17}/>{identityError}</div>}
          <div className="attendance-self-date"><CalendarDays size={16}/><span>Tanggal absensi</span><strong>{role === "siswa" ? "6 hari terakhir" : date}</strong></div>
          {role === "siswa" && <section className="attendance-student-qr-list">
            {arrivalQrError && <div className="attendance-alert error" role="alert"><XCircle size={17}/>{arrivalQrError}</div>}
            {adminArrivalQr && Date.parse(adminArrivalQr.expires_at) > clockNow && <div className="attendance-admin-arrival-card">
              <strong>QR Kedatangan dari Administrator</strong>
              <QRCodeSVG value={`SMAN7ABSENSI|${adminArrivalQr.token}`} size={180} level="M" includeMargin/>
              <code>{adminArrivalQr.token}</code>
              <span>Sisa waktu {remainingTimeLabel(adminArrivalQr.expires_at, clockNow)} · berakhir pukul {formatWitaTime(adminArrivalQr.expires_at)} WITA</span>
              <button type="button" className="attendance-qr-copy" onClick={()=>void copyText(adminArrivalQr.token, `arrival-${adminArrivalQr.token}`)}>
                <ClipboardCopy size={15}/>{copiedQrToken === `arrival-${adminArrivalQr.token}` ? "Kode tersalin" : "Salin Kode QR"}
              </button>
            </div>}
            {adminDepartureQr && Date.parse(adminDepartureQr.expires_at) > clockNow && <div className="attendance-admin-arrival-card">
              <strong>QR Kepulangan dari Administrator</strong>
              <QRCodeSVG value={`SMAN7ABSENSI|${adminDepartureQr.token}`} size={180} level="M" includeMargin/>
              <code>{adminDepartureQr.token}</code>
              <span>Sisa waktu {remainingTimeLabel(adminDepartureQr.expires_at, clockNow)} · berakhir pukul {formatWitaTime(adminDepartureQr.expires_at)} WITA</span>
              <button type="button" className="attendance-qr-copy" onClick={()=>void copyText(adminDepartureQr.token, `departure-${adminDepartureQr.token}`, setDepartureQrError)}>
                <ClipboardCopy size={15}/>{copiedQrToken === `departure-${adminDepartureQr.token}` ? "Kode tersalin" : "Salin Kode QR"}
              </button>
            </div>}
            <div className="attendance-student-qr-heading">
              <strong>QR sekolah pribadi</strong>
              <small>Tunjukkan QR ini kepada petugas untuk dipindai. QR tidak dapat digunakan siswa untuk mencatat absensi sendiri.</small>
            </div>
            {studentQrError && <div className="attendance-alert error" role="alert"><XCircle size={17}/>{studentQrError}</div>}
            {studentQrLoading && <p className="attendance-hint">Memeriksa jadwal QR sekolah...</p>}
            {!studentQrLoading && myStudentQrs.length === 0 && !studentQrError
              && <p className="attendance-student-qr-inactive">QR kedatangan atau kepulangan akan tampil otomatis selama jadwal aktif pada hari sekolah.</p>}
            <div className="attendance-student-qr-grid">
              {myStudentQrs.map((studentQr) => (
                <div className="attendance-student-qr-card" key={studentQr.session_type}>
                  <strong>{studentQr.session_type === "school_arrival" ? "QR Kedatangan" : "QR Kepulangan"}</strong>
                  <QRCodeSVG value={`${studentQrPrefix}${studentQr.token}`} size={180} level="M" includeMargin/>
                  <span>Sisa waktu {remainingTimeLabel(studentQr.expires_at, clockNow)}</span>
                </div>
              ))}
            </div>
          </section>}
          {role === "siswa" && <div className="attendance-self-qr">
            <div><strong>Scan QR Mata Pelajaran</strong><small>Pindai kode QR dari guru saat pembelajaran berlangsung.</small></div>
            {qrError && <div className="attendance-alert error" role="alert"><XCircle size={17}/>{qrError}</div>}
            <button className="attendance-secondary" type="button" onClick={()=>cameraOn ? stopCamera() : void startCamera("attendance")}>
              <Camera size={18}/>{cameraOn ? "Tutup Kamera" : "Buka Pemindai QR"}
            </button>
            {cameraOn && <div className="attendance-camera"><video ref={videoRef} autoPlay muted playsInline/><button type="button" onClick={stopCamera} aria-label="Tutup kamera"><XCircle size={20}/></button></div>}
            <label className="attendance-qr-student-status">
              <span>Status untuk QR mata pelajaran</span>
              <select value={qrAttendanceStatus} onChange={event=>setQrAttendanceStatus(event.target.value as "hadir" | "izin" | "sakit")}>
                <option value="hadir">Hadir</option>
                <option value="izin">Izin</option>
                <option value="sakit">Sakit</option>
              </select>
            </label>
            {qrAttendanceStatus !== "hadir" && <label className="attendance-qr-student-note">
              <span>Keterangan {qrAttendanceStatus === "izin" ? "izin" : "sakit"} (wajib)</span>
              <textarea value={qrAttendanceNote} onChange={event=>setQrAttendanceNote(event.target.value)} maxLength={240} rows={2} placeholder="Tuliskan keterangan singkat"/>
            </label>}
            <p className="attendance-qr-manual-help">Pilih status sebelum memindai atau memasukkan kode. QR kedatangan/kepulangan pribadi ditampilkan di atas untuk dipindai petugas.</p>
            <div className="attendance-qr-manual">
              <input
                aria-label="Kode manual sesi QR"
                autoComplete="off"
                spellCheck={false}
                value={manualQrValue}
                onChange={event=>setManualQrValue(event.target.value)}
                placeholder="Masukkan atau tempel kode QR"
              />
              <button type="button" className="attendance-secondary" onClick={()=>void submitScannedAttendance(manualQrValue)} disabled={saving || !manualQrValue.trim()}>
                {saving ? "Memeriksa..." : "Kirim kode"}
              </button>
            </div>
          </div>}
        </> : <>
          <label>Tanggal absensi<input type="date" value={date} onChange={e=>setDate(e.target.value)} required/></label>
          <label>Jenis pengguna<select value={personType} onChange={e=>{const type=e.target.value as PersonType;setPersonType(type);setIdentifier("");setPersonName("");setClassName("");setStudentQrToken("");setVerifiedIdentifier("");setIdentityLookup("idle");setIdentityLookupMessage("");if(type==="guru_tendik")setClassName("");}}><option value="siswa">Siswa</option><option value="guru_tendik">Guru / Tendik</option></select></label>
          <button className="attendance-scan" type="button" onClick={()=>cameraOn ? stopCamera() : void startCamera("identity")}><Camera size={18}/>{cameraOn ? "Tutup Kamera" : "Scan QR dengan Kamera"}</button>
          {cameraOn && <div className="attendance-camera"><video ref={videoRef} autoPlay muted playsInline/><button type="button" onClick={stopCamera} aria-label="Tutup kamera"><XCircle size={20}/></button></div>}
          <p className="attendance-hint">Format QR yang didukung: <code>jenis|NISN/NIP|Nama|Kelas</code>. Identitas harus terdaftar di Data Induk.</p>
          <label>{personType === "siswa" ? "NISN" : "NIP"}<input value={identifier} onChange={e=>{setIdentifier(e.target.value);setStudentQrToken("");setVerifiedIdentifier("");setIdentityLookup("idle");setIdentityLookupMessage("");}} required placeholder={personType === "siswa" ? "Masukkan NISN" : "Masukkan NIP"}/></label>
          {identityLookupMessage && <p className={`attendance-lookup-message lookup-${identityLookup}`} role="status">{identityLookupMessage}</p>}
          <label>Nama lengkap<input value={personName} readOnly required placeholder="Nama terisi otomatis dari Data Induk"/></label>
          {personType === "siswa" && <label>Kelas<input value={className} readOnly placeholder="Kelas dari Data Induk"/></label>}
        </>}
        {role !== "siswa" && !studentQrToken && <div className="attendance-status-field">
          <span>Status kehadiran</span>
          <div className="attendance-status-picker" role="group" aria-label="Status kehadiran">
            {statuses.map(option=><button type="button" key={option.value}
              className={`attendance-status-option${status === option.value ? " is-selected" : ""} status-${option.value}`}
              onClick={()=>setStatus(option.value)} aria-pressed={status === option.value}>{option.label}</button>)}
          </div>
        </div>}
        {role !== "siswa" && !studentQrToken && <label>Keterangan (opsional)<textarea value={note} onChange={e=>setNote(e.target.value)} rows={2} placeholder="Keterangan sakit/izin atau catatan"/></label>}
        {error && <div className="attendance-alert error"><XCircle size={17}/>{error}</div>}
        {message && <div className="attendance-alert success"><CheckCircle2 size={17}/>{message}</div>}
        {role !== "siswa" && <button className="attendance-primary" disabled={saving || identityLoading || (isSelfService && !identity) || (!isSelfService && (identityLookup !== "found" || verifiedIdentifier !== identifier.trim()))}>{saving ? "Menyimpan..." : "Simpan Absensi"}</button>}
      </form>}
      <section className={`attendance-panel attendance-records${attendanceView !== "personal" ? " attendance-records-wide" : ""}`}>
          <header className="attendance-print-header">
            <SchoolLetterheadPreview letterhead={printHeader} />
            <h1>{attendanceView === "subjects" ? "Rekap Kehadiran Mapel Saya" : attendanceView === "monitor" || attendanceView === "homeroom" ? "Pantauan Kehadiran Siswa" : canManageAttendance ? "Rekap Kehadiran" : isSelfService ? "Riwayat Kehadiran Saya" : "Rekap Kehadiran"}</h1>
            <p>{date} · {visibleRows.length} catatan</p>
          </header>
        <div className="attendance-panel-title"><div><h2>{attendanceView === "subjects" ? "Rekap Kehadiran Mapel Saya" : attendanceView === "monitor" ? "Pantauan Kehadiran & Mapel Siswa" : attendanceView === "homeroom" ? "Pantauan Kehadiran Mapel di Kelas Perwalian" : canManageAttendance ? "Rekap Harian" : isSelfService ? "Riwayat Kehadiran Saya" : "Rekap Harian"}</h2><p>{attendanceView === "subjects" ? `${date} · ${filtered.length} catatan mapel` : attendanceView === "monitor" || attendanceView === "homeroom" ? `${date} · Hanya tampil, tidak dapat mengubah sesi guru lain` : role === "siswa" ? "6×24 jam terakhir" : `${date} · ${filtered.length} catatan`}</p></div><FileSpreadsheet size={22}/></div>
        {attendanceView === "subjects" && <div className="attendance-report-filters">
          <label>Tanggal<input type="date" value={date} onChange={event=>setDate(event.target.value)}/></label>
          <label>Mata pelajaran<select value={subjectFilter} onChange={event=>setSubjectFilter(event.target.value)}>
            <option value="all">Semua mata pelajaran</option>
            {availableQrSubjects.map(subject=><option key={subject} value={subject}>{subject}</option>)}
          </select></label>
          <label>Kelas<select value={subjectClassFilter} onChange={event=>setSubjectClassFilter(event.target.value)}>
            <option value="all">Semua kelas</option>
            {availableQrClasses
              .filter(assignment=>subjectFilter==="all" || assignment.subject===subjectFilter)
              .map(assignment=><option key={assignment.class_id} value={assignment.class_name}>{assignment.class_name}</option>)}
          </select></label>
        </div>}
        {(attendanceView === "admin" || canManageAttendance) && <div className="attendance-report-filters">
          <label>Tanggal rekap<input type="date" value={date} onChange={event=>setDate(event.target.value)}/></label>
          {adminCategory === "guru" && <label>Jenis guru<select value={adminTeacherFilter} onChange={event=>setAdminTeacherFilter(event.target.value as typeof adminTeacherFilter)}>
            <option value="all">Guru & Guru BK</option><option value="guru">Guru Mapel</option><option value="guru_bk">Guru BK</option>
          </select></label>}
        </div>}
        <div className="attendance-tools"><div className="attendance-search"><Search size={16}/><input value={filter} onChange={e=>setFilter(e.target.value)} placeholder="Cari nama, kode, kelas..."/></div>
          {role !== "siswa" && attendanceView !== "monitor" && attendanceView !== "homeroom" && <button className="attendance-secondary" onClick={()=>void exportRows(false)} disabled={exporting}><Download size={16}/> Excel</button>}
            {(!isSelfService || isTeacher) && <><SchoolLetterheadPicker value={letterheadSlot} onChange={setLetterheadSlot}/><button className="attendance-secondary" onClick={()=>window.print()}><Download size={16}/> PDF / Cetak</button></>}
        </div>
        <div className="attendance-table-wrap"><table><thead>
          {attendanceView === "subjects" || attendanceView === "monitor" || attendanceView === "homeroom"
            ? <tr><th>Tanggal</th><th>Mata pelajaran / kegiatan</th><th>Guru pengampu</th><th>Kelas</th><th>Nama / NISN</th><th>Status</th></tr>
            : <tr><th>Tanggal</th><th>Nama / ID</th><th>Jenis</th><th>Kelas</th><th>Status</th></tr>}
        </thead><tbody>
        {filtered.map(r=><tr key={r.id}>
          <td>{r.attendance_date}</td>
          {attendanceView === "subjects" || attendanceView === "monitor" || attendanceView === "homeroom"
            ? <>
              <td>{r.session_type === "subject"
                ? r.subject || "Mata pelajaran"
                : r.session_type === "school_departure" ? "Kepulangan sekolah" : "Kehadiran sekolah"}</td>
              <td>{r.teacher_name || "—"}</td>
              <td>{r.class_name || "—"}</td>
              <td><strong>{r.person_name}</strong><small className="attendance-identifier">{r.person_identifier || "—"}</small></td>
              <td><span className={`attendance-status status-${r.status}`}>{statusLabel(r.status)}</span></td>
            </>
            : <>
              <td><strong>{r.person_name}</strong><small className="attendance-identifier">{r.person_identifier || "—"}</small>{r.session_type === "subject" && <small className="attendance-row-subject">{r.subject || "Mapel"}{r.teacher_name ? ` · ${r.teacher_name}` : ""}</small>}</td>
              <td>{r.person_type==="siswa"?"Siswa":"Guru/Tendik"}</td><td>{r.class_name || "—"}</td><td><span className={`attendance-status status-${r.status}`}>{r.session_type === "school_departure" ? "Pulang" : statusLabel(r.status)}</span></td>
            </>}
        </tr>)}
        {!filtered.length && <tr><td colSpan={attendanceView === "subjects" || attendanceView === "monitor" || attendanceView === "homeroom" ? 6 : 5} className="attendance-empty">{loading?"Memuat data...":attendanceView==="monitor"||attendanceView==="homeroom"?"Belum ada kehadiran mapel pada kelas perwalian untuk tanggal ini.":"Belum ada data untuk tanggal/filter ini."}</td></tr>}
        </tbody></table></div>
        {role !== "siswa" && attendanceView !== "monitor" && attendanceView !== "homeroom" && <div className="attendance-month-export"><label>{isSelfService ? "Riwayat bulanan" : "Rekap bulanan"}<input type="month" value={month} onChange={e=>setMonth(e.target.value)}/></label><button className="attendance-primary" disabled={exporting} onClick={()=>void exportRows(true)}><Download size={16}/>{exporting ? "Menyiapkan..." : isSelfService ? "Ekspor Riwayat Saya" : "Ekspor Excel Bulanan"}</button></div>}
        <p className="attendance-hint"><ShieldCheck size={14}/> {role === "siswa" ? "Riwayat kehadiran dapat dilihat di halaman ini dan tidak menyediakan fitur unduh." : "Data ditampilkan sesuai hak akses Supabase yang diberikan ke akun login."}</p>
      </section>
    </div>
    {canManageAttendance && <section className="attendance-panel attendance-monthly-report">
      <div className="attendance-panel-title">
        <div><h2>Rekap Bulanan HTML</h2><p>Pratinjau cetak/PDF dan HTML untuk Guru, Guru BK, Tendik, dan Siswa.</p></div>
        <FileSpreadsheet size={22}/>
      </div>
      <div className="attendance-monthly-controls">
        <label>Bulan rekap<input type="month" value={month} onChange={event=>setMonth(event.target.value)}/></label>
        <SchoolLetterheadPicker value={letterheadSlot} onChange={setLetterheadSlot}/>
        <button type="button" className="attendance-primary" onClick={()=>void loadMonthlyReport()} disabled={monthlyReportLoading}>
          {monthlyReportLoading ? "Memuat rekap..." : "Tampilkan Rekap Bulanan"}
        </button>
      </div>
      <SchoolLetterheadPreview letterhead={printHeader} />
      {adminCategory === "guru" && <label className="attendance-monthly-teacher-filter">Kategori Guru
        <select value={adminTeacherFilter} onChange={event=>setAdminTeacherFilter(event.target.value as typeof adminTeacherFilter)}>
          <option value="all">Guru & Guru BK</option>
          <option value="guru">Guru Mapel</option>
          <option value="guru_bk">Guru BK</option>
        </select>
      </label>}
      <input
        ref={monthlyTemplateInputRef}
        className="attendance-file-input"
        type="file"
        accept=".html,.htm"
        onChange={event=>void handleMonthlyTemplateFile(event)}
      />
      <div className="attendance-weekly-template-tools">
        <span>{monthlyTemplateFileName || "Template default siap pakai · dapat diedit atau diganti dengan HTML."}</span>
        <button type="button" className="attendance-secondary" onClick={()=>monthlyTemplateInputRef.current?.click()}>
          Unggah template HTML
        </button>
      </div>
      <label className="attendance-template-editor">
        Editor template HTML
        <textarea value={monthlyTemplate} onChange={event=>setMonthlyTemplate(event.target.value)} rows={8} maxLength={200_000}/>
      </label>
      <p className="attendance-hint">Token tersedia: {"{{kop_surat}}"}, {"{{judul_rekap}}"}, {"{{kategori_pengguna}}"}, {"{{bulan_tahun}}"}, {"{{tabel_rekap_bulanan}}"}, {"{{ringkasan_rekap}}"}, {"{{tanggal_unduh}}"}, {"{{kepala_sekolah}}"}, {"{{nip_kepala_sekolah}}"}.</p>
      {monthlyReportError && <div className="attendance-alert error" role="alert"><XCircle size={17}/>{monthlyReportError}</div>}
      {monthlyTemplateError && <div className="attendance-alert error" role="alert"><XCircle size={17}/>{monthlyTemplateError}</div>}
      <div className="attendance-monthly-actions">
        <span>{monthlyLoadedMonth === month ? `${monthlyFilteredRows.length} catatan · ${monthlyReportCategoryLabel}` : "Muat rekap untuk periode yang dipilih sebelum mengunduh."}</span>
        <button type="button" className="attendance-secondary" onClick={downloadMonthlyHtml} disabled={monthlyLoadedMonth !== month}>
          <Download size={16}/> Unduh HTML
        </button>
        <button type="button" className="attendance-primary" onClick={printMonthlyReport} disabled={monthlyLoadedMonth !== month}>
          <Download size={16}/> Unduh PDF / Cetak
        </button>
      </div>
      <iframe
        className="attendance-monthly-preview"
        srcDoc={monthlyReportHtml}
        title="Pratinjau langsung rekap bulanan"
        sandbox="allow-same-origin"
      />
    </section>}
    {canManageAttendance && <section className="attendance-panel attendance-weekly-template">
      <div className="attendance-panel-title">
        <div><h2>Format Rekap Mingguan</h2><p>Unggah .docx/.html atau edit HTML. Placeholder kop dan tabel siswa: {"{{kop_surat}}"} dan {"{{baris_siswa}}"}.</p></div>
        <FileSpreadsheet size={22}/>
      </div>
      <input
        ref={weeklyTemplateInputRef}
        className="attendance-file-input"
        type="file"
        accept=".docx,.html,.htm"
        onChange={event=>void handleWeeklyTemplateFile(event)}
      />
      <div className="attendance-weekly-template-tools">
        <span>{weeklyTemplateFileName || "Belum ada file sumber. Template dapat diedit langsung."}</span>
        <button type="button" className="attendance-secondary" onClick={()=>weeklyTemplateInputRef.current?.click()} disabled={weeklyTemplateLoading || weeklyTemplateSaving}>
          {weeklyTemplateLoading ? "Memuat..." : "Unggah format"}
        </button>
      </div>
      <label className="attendance-template-editor">
        HTML format rekap
        <textarea value={weeklyTemplate} onChange={event=>setWeeklyTemplate(event.target.value)} rows={10} maxLength={200_000}/>
      </label>
      {weeklyTemplateError && <div className="attendance-alert error" role="alert"><XCircle size={17}/>{weeklyTemplateError}</div>}
      {weeklyTemplateNotice && <div className="attendance-alert success" role="status"><CheckCircle2 size={17}/>{weeklyTemplateNotice}</div>}
      <button type="button" className="attendance-primary" onClick={()=>void saveWeeklyTemplate()} disabled={weeklyTemplateLoading || weeklyTemplateSaving}>
        {weeklyTemplateSaving ? "Menyimpan..." : "Simpan format rekap"}
      </button>
    </section>}
    {isHomeroomTeacher && (attendanceView === "homeroom" || attendanceView === "monitor") && <section className="attendance-panel attendance-homeroom-weekly">
      <div className="attendance-panel-title">
        <div><h2>Rekapitulasi Kehadiran Mingguan</h2><p>Daftar kelas mengikuti relasi wali kelas, penugasan mata pelajaran, atau binaan Guru BK.</p></div>
        <FileSpreadsheet size={22}/>
      </div>
      <div className="attendance-weekly-controls">
        <label>Minggu dimulai (Senin)
          <input type="date" value={weeklyStartDate} onChange={event=>event.target.value && setWeeklyStartDate(mondayOfWeek(event.target.value))}/>
        </label>
        <SchoolLetterheadPicker value={letterheadSlot} onChange={setLetterheadSlot}/>
      </div>
      {homeroomError && <div className="attendance-alert error" role="alert"><XCircle size={17}/>{homeroomError}</div>}
      {homeroomLoading && <p className="attendance-hint">Memuat kelas dan seluruh siswa aktif...</p>}
      {!homeroomLoading && weeklyReportData.length === 0 && !homeroomError
        && <p className="attendance-hint">Belum ada kelas yang terhubung melalui wali kelas, penugasan mapel, atau assignment BK.</p>}
      {weeklyReportData.map(report => (
        <section className="attendance-homeroom-class" key={report.classId}>
          <div className="attendance-homeroom-heading">
            <div><h3>Rekap Kelas / Rombel ({report.className})</h3><span>Tingkat {report.gradeLevel} · {report.students.length} siswa · {report.effectiveDayCount} hari efektif</span></div>
            <div className="attendance-homeroom-actions">
              <button type="button" className="attendance-secondary" onClick={()=>printWeeklyReport(report)} disabled={weeklyTemplateLoading}><Download size={15}/>Cetak / PDF</button>
              <button type="button" className="attendance-secondary" onClick={()=>exportWeeklyReport(report)}><FileSpreadsheet size={15}/>Excel</button>
            </div>
          </div>
          <div className="attendance-table-wrap attendance-homeroom-table">
            <table className="attendance-weekly-report-table"><thead>
              <tr><th rowSpan={2}>No.</th><th rowSpan={2}>NISN</th><th rowSpan={2}>Nama Siswa</th><th rowSpan={2}>JK</th>
                {["Senin", "Selasa", "Rabu", "Kamis", "Jum'at"].map(day=><th key={day}>{day}</th>)}
                <th colSpan={5}>Rekapitulasi</th><th rowSpan={2}>Persentase Hadir</th><th rowSpan={2}>Keterangan / Tindak Lanjut</th>
              </tr>
              <tr>{weeklyDays.map(day=><th key={`date-${day}`}>({new Intl.DateTimeFormat("id-ID",{day:"2-digit",month:"2-digit",timeZone:"UTC"}).format(new Date(`${day}T00:00:00Z`))})</th>)}
                {["H", "T", "S", "I", "A"].map(code=><th key={code}>{code}</th>)}
              </tr></thead><tbody>
              {report.students.map((student,index)=><tr key={student.studentId}>
                <td>{index+1}</td><td className="attendance-identifier">{student.identifier || "—"}</td><td>{student.name}</td><td>{student.gender ?? "—"}</td>
                {weeklyDays.map(day=>{
                  const record=student.days.get(day);
                  const code=record ? weeklyStatusCode[record.status] : undefined;
                  return <td key={day}>{code ?? (day > today() || record?.is_effective_day ? "—" : "Libur")}
                    {record?.recorded_at && <small>{formatWitaTime(record.recorded_at)}</small>}
                    {record?.note && <small>{record.note}</small>}
                  </td>;
                })}
                <td>{student.counts.H}</td><td>{student.counts.T}</td><td>{student.counts.S}</td><td>{student.counts.I}</td><td>{student.counts.A}</td>
                <td>{student.percentage === null ? "—" : `${student.percentage}%`}</td><td>{student.remarks}</td>
              </tr>)}
            </tbody></table>
          </div>
        </section>
      ))}
    </section>}
    <div className="attendance-footnote"><Stethoscope size={16}/> Status Sakit dan Izin dapat dilengkapi keterangan. Notifikasi WhatsApp hanya aktif sesuai pengaturan administrator.</div>
    {canManageWhatsapp && <section className="attendance-panel attendance-wa-settings">
      <div className="attendance-panel-title">
        <div><h2>Pengaturan Notifikasi WhatsApp</h2><p>Kontrol otomatisasi pesan orang tua. Pesan dikirim melalui Supabase Edge Function.</p></div>
        <Settings2 size={22}/>
      </div>
      <label className="attendance-wa-toggle">
        <input type="checkbox" checked={waEnabled} onChange={e => setWaEnabled(e.target.checked)} />
        <span><strong>Aktifkan notifikasi orang tua</strong><small>Pesan hanya dikirim untuk QR kedatangan dan kepulangan sekolah, bukan QR mata pelajaran.</small></span>
        <BellRing size={19}/>
      </label>
      <label>Template pesan<textarea rows={6} value={waTemplate} onChange={e => setWaTemplate(e.target.value)} /></label>
      <p className="attendance-hint">Variabel: <code>{"{nama}"}</code>, <code>{"{status}"}</code>, <code>{"{tanggal}"}</code>, <code>{"{jam}"}</code>, <code>{"{kelas}"}</code>. Untuk QR: status otomatis menjadi “hadir di sekolah” atau “pulang dari sekolah”.</p>
      <button type="button" className="attendance-primary" disabled={waSaving} onClick={() => void saveWhatsappSettings()}>{waSaving ? "Menyimpan..." : "Simpan Pengaturan WhatsApp"}</button>
    </section>}
  </div>;
}
