import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getValidSupabaseSession, supabase } from "./lib/supabase";
import * as XLSX from "xlsx";
import {
  CalendarDays, Camera, CheckCircle2, ClipboardCopy, Download, FileSpreadsheet, LogIn, LogOut, RefreshCw,
  Search, ShieldCheck, Stethoscope, UserCheck, XCircle, BellRing, Settings2
} from "lucide-react";
import "./AbsensiDigital.css";
import "./AbsensiDigitalQr.css";
import { QRCodeSVG } from "qrcode.react";
import type { SchoolUser } from "./context/school-context";

type AttendanceStatus = "hadir" | "sakit" | "izin" | "terlambat" | "alpa" | "pulang";
type PersonType = "siswa" | "guru_tendik";
type AttendanceRow = {
  id: string; attendance_date: string; person_type: PersonType;
  person_identifier: string; person_name: string; class_name: string | null;
  status: AttendanceStatus; note: string | null; created_at: string;
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
type AttendanceScheduleSettings = {
  automation_enabled: boolean;
  arrival_start_time: string;
  arrival_ontime_until: string;
  arrival_absent_at: string;
  departure_scan_from: string;
  bk_alert_at: string;
};
type AttendanceSchoolClosure = { school_date: string; description: string };
const initialAttendanceSchedule: AttendanceScheduleSettings = {
  automation_enabled: false,
  arrival_start_time: "06:00",
  arrival_ontime_until: "07:30",
  arrival_absent_at: "10:00",
  departure_scan_from: "15:40",
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
function isAttendanceQrSubmission(value: unknown): value is {
  session_type: AttendanceQrSessionType;
  subject: string | null;
  attendance_status: "hadir" | "terlambat" | "pulang";
  attendance_date: string;
  already_recorded: boolean;
  qr_record_id: string | null;
} {
  if (!value || typeof value !== "object") return false;
  const result = value as Record<string, unknown>;
  return (result.session_type === "school_arrival" || result.session_type === "school_departure" || result.session_type === "subject")
    && (result.subject === null || typeof result.subject === "string")
    && (result.attendance_status === "hadir" || result.attendance_status === "terlambat" || result.attendance_status === "pulang")
    && typeof result.attendance_date === "string"
    && typeof result.already_recorded === "boolean"
    && (result.qr_record_id === null || typeof result.qr_record_id === "string");
}
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
const attendancePageSize = 1000;
const attendanceTimezone = "Asia/Makassar";
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
const statusLabel = (s: AttendanceStatus) => s === "pulang" ? "Pulang" : statuses.find(x => x.value === s)?.label ?? s;
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
  const [date, setDate] = useState(today());
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
  const [qrSubject, setQrSubject] = useState("");
  const [qrClassId, setQrClassId] = useState("");
  const [teacherSubjectAssignments, setTeacherSubjectAssignments] = useState<TeacherAttendanceAssignment[]>([]);
  const [teacherSubjectAssignmentsLoading, setTeacherSubjectAssignmentsLoading] = useState(false);
  const [qrSessionType, setQrSessionType] = useState<AttendanceQrSessionType>("school_arrival");
  const [qrSession, setQrSession] = useState<AttendanceQrSession | null>(null);
  const [qrBusy, setQrBusy] = useState(false);
  const [qrError, setQrError] = useState("");
  const [manualQrValue, setManualQrValue] = useState("");
  const [copiedQrToken, setCopiedQrToken] = useState("");
  const [scheduleSettings, setScheduleSettings] = useState<AttendanceScheduleSettings>(initialAttendanceSchedule);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const [scheduleError, setScheduleError] = useState("");
  const [scheduleNotice, setScheduleNotice] = useState("");
  const [schoolClosures, setSchoolClosures] = useState<AttendanceSchoolClosure[]>([]);
  const [closureDate, setClosureDate] = useState("");
  const [closureDescription, setClosureDescription] = useState("");
  const [closureSaving, setClosureSaving] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanTimer = useRef<number | null>(null);
  const loadRequestRef = useRef(0);
  const role = currentUser?.role ?? userRole;
  const isSelfService = ["siswa", "guru", "guru_bk", "tendik"].includes(role);
  const isTeacher = role === "guru";
  const isAdminMonitor = role === "super_admin";
  const canManageAttendance = ["super_admin", "operator"].includes(role);
  const canRecordAttendance = isSelfService || role === "operator";
  const canViewAllAttendance = ["super_admin", "operator", "kepala_sekolah", "kepala_tata_usaha", "staff_tata_usaha"].includes(role);
  const canManageWhatsapp = ["super_admin", "operator", "kepala_sekolah"].includes(role);

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
        if (active) {
          setTeacherSubjectAssignments(data);
          if (data.length === 0) {
            setQrError(
              "Belum ada penugasan mata pelajaran dan kelas untuk akun ini. Hubungi admin/operator di Data Induk.",
            );
            setQrSubject("");
            setQrClassId("");
          } else {
            const initialSubject = data[0].subject;
            setQrSubject(initialSubject);
            setQrClassId(
              data.find((assignment) => assignment.subject === initialSubject)?.class_id ?? "",
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
          .select("id,attendance_date,person_type,person_identifier,person_name,class_name,status,note,created_at")
          .eq("attendance_date", date);
        const scopedQuery = isSelfService && identity
          ? attendanceQuery
            .eq("person_type", identity.personType)
            .eq("person_identifier", identity.identifier)
          : attendanceQuery;
        const { data, error: queryError } = await scopedQuery
          .order("created_at", {ascending:false})
          .range(offset, offset + attendancePageSize - 1);
        if (queryError) throw queryError;

        const page = (data ?? []) as AttendanceRow[];
        loadedRows.push(...page);
        if (page.length < attendancePageSize) break;
        offset += attendancePageSize;
      }

      let qrOffset = 0;
      while (true) {
        const { data, error: qrQueryError } = await supabase
          .from("attendance_qr_records")
          .select("id,attendance_date,person_type,person_identifier,person_name,class_name,status,created_at,session_type,subject,teacher_name")
          .eq("attendance_date", date)
          .in("session_type", ["subject", "school_departure"])
          .order("created_at", { ascending: false })
          .range(qrOffset, qrOffset + attendancePageSize - 1);
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
          note: null,
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
  }, [date, identity, isSelfService]);

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
          .select("automation_enabled,arrival_start_time,arrival_ontime_until,arrival_absent_at,departure_scan_from,bk_alert_at")
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
        departure_scan_from: timeValue(settingsResult.data.departure_scan_from),
        bk_alert_at: timeValue(settingsResult.data.bk_alert_at),
      });
      setSchoolClosures((closuresResult.data ?? []) as AttendanceSchoolClosure[]);
    } catch (loadError) {
      setScheduleError(`Pengaturan jadwal gagal dimuat: ${errorMessage(loadError)}`);
    } finally {
      setScheduleLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!canManageAttendance) return;
    const timer = window.setTimeout(() => { void loadAttendanceSchedule(); }, 0);
    return () => window.clearTimeout(timer);
  }, [canManageAttendance, loadAttendanceSchedule]);

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
    setQrError("");
    setQrBusy(true);
    try {
      const { data, error: createError } = await supabase
        .rpc("create_attendance_qr_session", {
          p_session_type: isTeacher ? "subject" : qrSessionType,
          p_subject: isTeacher ? qrSubject : null,
          p_class_id: isTeacher ? qrClassId : null,
        })
        .maybeSingle();
      if (createError) throw createError;
      if (!isAttendanceQrSession(data)) {
        throw new Error("Respons pembuatan QR tidak valid. Pastikan migrasi absensi QR sudah diterapkan.");
      }
      setQrSession(data);
      setQrError("");
    } catch (createError) {
      setQrError(errorMessage(createError));
    } finally {
      setQrBusy(false);
    }
  };

  useEffect(() => {
    if (!qrSession) return;
    const timer = window.setInterval(() => {
      if (qrSession.attendance_date < today()) {
        setQrSession(null);
        setQrError("Sesi QR hari sebelumnya telah berakhir. Buat sesi baru untuk melanjutkan.");
        return;
      }
      if (qrSession.expires_at && Date.parse(qrSession.expires_at) <= Date.now()) {
        setQrSession(null);
        setQrError("Sesi QR telah berakhir. Buat sesi baru untuk melanjutkan.");
      }
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [qrSession]);

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

  const submitScannedAttendance = async (rawValue: string) => {
    const token = attendanceQrToken(rawValue);
    if (!token) {
      setError("Kode QR absensi kosong.");
      return;
    }

    setError("");
    setMessage("");
    setSaving(true);
    try {
      const { data, error: submitError } = await supabase
        .rpc("submit_attendance_qr", { p_token: token })
        .maybeSingle();
      if (submitError) throw submitError;
      if (!isAttendanceQrSubmission(data)) {
        throw new Error("Respons absensi QR tidak valid. Pastikan migrasi absensi QR sudah diterapkan.");
      }
      const label = data.session_type === "subject"
        ? `absensi mata pelajaran ${typeof data.subject === "string" ? data.subject : ""}`
        : data.session_type === "school_departure"
          ? "kepulangan sekolah"
          : data.attendance_status === "terlambat"
            ? "terlambat di sekolah"
            : "kedatangan sekolah";
      let notificationNotice = "";
      let notificationProblem = "";
      if (data.session_type !== "subject") {
        if (!identity) {
          notificationProblem = "Identitas siswa belum tersedia untuk mengirim notifikasi WhatsApp.";
        } else if (!data.qr_record_id) {
          notificationProblem = "QR tersimpan, tetapi referensi catatan tidak tersedia untuk notifikasi WhatsApp.";
        } else {
          try {
            const { data: notifyData, error: notifyError } = await supabase.functions.invoke(
              "send-attendance-whatsapp",
              {
                body: {
                  attendance_date: data.attendance_date,
                  person_identifier: identity.identifier,
                  event_type: data.session_type,
                  qr_record_id: data.qr_record_id,
                },
              },
            );
            if (notifyError) {
              notificationProblem = `Kehadiran tersimpan, tetapi notifikasi WhatsApp gagal: ${errorMessage(notifyError)}`;
            } else {
              const result = getWhatsAppResult(notifyData);
              if (result?.sent) {
                notificationNotice = " Notifikasi WhatsApp diterima Fonnte untuk diproses.";
              } else if (result?.reason === "disabled") {
                notificationNotice = " Notifikasi WhatsApp belum diaktifkan.";
              } else if (result?.reason === "parent_phone_missing") {
                notificationNotice = " Nomor WhatsApp orang tua belum tercatat.";
              } else if (result?.reason === "parent_phone_invalid") {
                notificationNotice = " Nomor WhatsApp orang tua tidak valid.";
              } else if (result?.reason === "already_sent") {
                notificationNotice = " Notifikasi WhatsApp untuk kejadian ini sudah pernah dikirim.";
              } else if (result?.reason === "provider_rejected") {
                notificationProblem = `Kehadiran tersimpan, tetapi Fonnte menolak pesan: ${result.detail ?? "Periksa status perangkat dan respons provider."}`;
              } else {
                notificationProblem = "Kehadiran tersimpan, tetapi status pengiriman WhatsApp tidak dapat dipastikan.";
              }
            }
          } catch (notifyError) {
            notificationProblem = `Kehadiran tersimpan, tetapi notifikasi WhatsApp gagal: ${errorMessage(notifyError)}`;
          }
        }
      }
      setMessage(data.already_recorded
        ? `Absensi ${label} pada sesi QR ini sudah pernah dicatat.${notificationNotice}`
        : `Berhasil mencatat ${label}.${notificationNotice}`);
      if (notificationProblem) setError(notificationProblem);
      setManualQrValue("");
      await loadRows();
    } catch (submitError) {
      setError(errorMessage(submitError));
    } finally {
      setSaving(false);
    }
  };

  const stopCamera = useCallback(() => {
    if (scanTimer.current !== null) window.clearTimeout(scanTimer.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null; setCameraOn(false);
  }, []);
  useEffect(() => () => { streamRef.current?.getTracks().forEach(t => t.stop()); }, []);

  const startCamera = async (mode: "identity" | "attendance" = "identity") => {
    setError(""); setMessage("");
    try {
      const Detector = (window as BarcodeDetectorWindow).BarcodeDetector;
      if (!Detector) {
        setError("Pemindai QR bawaan tidak didukung browser ini. Gunakan Chrome terbaru atau masukkan kode QR secara manual.");
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:"environment"}},audio:false});
      streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); }
      setCameraOn(true);
      const detector = new Detector({formats:["qr_code"]});
      const scan = async () => {
        if (!streamRef.current || !videoRef.current) return;
        try {
          const found = await detector.detect(videoRef.current);
          if (found?.length && found[0].rawValue) {
            const value = found[0].rawValue;
            stopCamera();
            if (mode === "attendance") {
              void submitScannedAttendance(value);
            } else {
              parseQr(value);
              setMessage("QR berhasil dibaca. Periksa data lalu tekan Simpan Absensi.");
            }
            return;
          }
        } catch {
          scanTimer.current = window.setTimeout(scan, 350);
          return;
        }
        scanTimer.current = window.setTimeout(scan, 350);
      };
      scanTimer.current = window.setTimeout(scan, 350);
    } catch {
      stopCamera();
      setError("Kamera tidak dapat dibuka. Izinkan akses kamera dan gunakan HTTPS (Vercel sudah HTTPS).");
    }
  };
  const parseQr = (raw: string) => {
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
  };
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
  const filtered = useMemo(() => rows.filter(r =>
    `${r.person_identifier} ${r.person_name} ${r.class_name ?? ""} ${r.status}`.toLowerCase().includes(filter.toLowerCase())
  ), [rows, filter]);
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
  const summary = useMemo(() => statuses.map(s => ({
    ...s, count: rows.filter(r => r.status === s.value).length
  })), [rows]);
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

      let qrOffset = 0;
      while (true) {
        let query = supabase
          .from("attendance_qr_records")
          .select("attendance_date,person_identifier,person_name,class_name,session_type,subject,teacher_name,created_at")
          .in("session_type", ["subject", "school_departure"])
          .order("attendance_date")
          .order("created_at");
        if (isSelfService && identity?.personType === "siswa") {
          query = query
            .eq("person_type", "siswa")
            .eq("person_identifier", identity.identifier);
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
          status: row.session_type === "school_departure" ? "pulang" : "hadir",
          note: row.session_type === "school_departure"
            ? "QR kepulangan sekolah"
            : `QR mata pelajaran: ${row.subject || "—"}${row.teacher_name ? ` · ${row.teacher_name}` : ""}`,
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
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(output), "Rekap Absensi");
      XLSX.writeFile(wb, `Rekap-Absensi-${monthly ? month : date}.xlsx`);
    } catch (exportError) {
      setError("Ekspor gagal: " + errorMessage(exportError));
    } finally {
      setExporting(false);
    }
  };
  if (!isSelfService && !canManageAttendance) {
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
        ? "Pantau rekap kehadiran dan kendalikan sesi QR kedatangan sekolah."
        : isTeacher
          ? "Kelola QR mata pelajaran dan pantau rekap siswa pada sesi yang Anda buat."
          : isSelfService
            ? "Catat dan lihat kehadiran yang terhubung dengan akun Anda."
            : "Absensi siswa serta guru dan tenaga kependidikan dalam Super App SMAN 7 Maros."}</p></div>
      <button className={`attendance-secondary attendance-refresh${loading ? " is-loading" : ""}`} onClick={() => void loadRows()} disabled={loading}><RefreshCw size={16}/> {loading ? "Memuat..." : "Muat ulang"}</button>
    </div>
    <div className="attendance-stats">
      {summary.map((s, index) => <div className={`attendance-stat stat-${s.value}`} style={{"--stat-delay": `${index * 70}ms`} as React.CSSProperties} key={s.value}>
        <div className="attendance-stat-icon">{s.value === "hadir" ? <UserCheck size={19}/> : s.value === "sakit" ? <Stethoscope size={19}/> : <CalendarDays size={19}/>}</div>
        <div><span>{s.label}</span><strong>{s.count}</strong></div>
      </div>)}
    </div>
    {(isTeacher || canManageAttendance) && <section className="attendance-qr-panel">
      <div className="attendance-qr-heading">
        <div>        <span className="attendance-qr-eyebrow">ABSENSI TANPA KONTAK</span>
          <h2>{isTeacher ? "QR Kehadiran Mata Pelajaran" : qrSessionType === "school_departure" ? "QR Kepulangan Sekolah" : "QR Kedatangan Sekolah"}</h2>
          <p>{isTeacher
            ? "Tentukan mata pelajaran dan kelas. QR hanya berlaku untuk siswa kelas tersebut."
            : qrSessionType === "school_departure"
              ? "Buat QR kepulangan sekolah. Pemindaian mencatat waktu pulang dan mengirim notifikasi kepada orang tua jika WhatsApp aktif."
              : "Buat QR kedatangan sekolah. Pemindaian mencatat waktu tiba dan mengirim notifikasi kepada orang tua jika WhatsApp aktif."}</p>
        </div>
        <span className="attendance-qr-badge">QR TERBATAS WAKTU</span>
      </div>
      {qrSession ? <div className="attendance-qr-active">
        <div className="attendance-qr-code"><QRCodeSVG value={`SMAN7ABSENSI|${qrSession.token}`} size={220} level="M" includeMargin/></div>
        <div className="attendance-qr-session-info">
          <strong>{qrSession.session_type === "subject" ? qrSession.subject : qrSession.session_type === "school_departure" ? "Kepulangan sekolah" : "Kedatangan sekolah"}</strong>
          <span>Untuk tanggal {new Date(`${qrSession.attendance_date}T00:00:00`).toLocaleDateString("id-ID",{day:"2-digit",month:"long",year:"numeric"})}</span>
          <span>{qrSession.class_name ? `Kelas ${qrSession.class_name}` : "Semua kelas"}</span>
          {qrSession.teacher_name && <span>Guru: {qrSession.teacher_name}</span>}
          {qrSession.expires_at
            ? <small>QR berlaku hingga sesi berakhir pukul {new Date(qrSession.expires_at).toLocaleTimeString("id-ID", {hour:"2-digit",minute:"2-digit",timeZone:"Asia/Makassar"})} WITA</small>
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
        {!isTeacher && <fieldset className="attendance-qr-type-picker">
          <legend>Jenis sesi QR</legend>
          <div className="attendance-qr-type-options">
            <label className={qrSessionType === "school_arrival" ? "is-selected" : ""}>
              <input
                type="radio"
                name="attendance-qr-session-type"
                value="school_arrival"
                checked={qrSessionType === "school_arrival"}
                onChange={() => setQrSessionType("school_arrival")}
              />
              <span className="attendance-qr-type-icon"><LogIn size={19}/></span>
              <span className="attendance-qr-type-copy"><strong>Kedatangan sekolah</strong><small>Catat siswa tiba di sekolah</small></span>
              <CheckCircle2 className="attendance-qr-type-check" size={18}/>
            </label>
            <label className={qrSessionType === "school_departure" ? "is-selected" : ""}>
              <input
                type="radio"
                name="attendance-qr-session-type"
                value="school_departure"
                checked={qrSessionType === "school_departure"}
                onChange={() => setQrSessionType("school_departure")}
              />
              <span className="attendance-qr-type-icon is-departure"><LogOut size={19}/></span>
              <span className="attendance-qr-type-copy"><strong>Kepulangan sekolah</strong><small>Catat siswa pulang dari sekolah</small></span>
              <CheckCircle2 className="attendance-qr-type-check" size={18}/>
            </label>
          </div>
        </fieldset>}
        <button type="button" className="attendance-primary" onClick={()=>void createQrSession()}
          disabled={qrBusy || (isTeacher && (
            teacherSubjectAssignmentsLoading ||
            !availableQrSubjects.length ||
            !qrSubject.trim() ||
            !qrClassId
          ))}>
          {qrBusy ? "Menyiapkan QR..." : qrSessionType === "school_departure" && !isTeacher ? "Buat QR Kepulangan" : "Buat QR Kehadiran"}
        </button>
      </div>}
      {qrError && <div className="attendance-alert error" role="alert"><XCircle size={17}/>{qrError}</div>}
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
          <label>Mulai scan kepulangan (WITA)<input type="time" value={scheduleSettings.departure_scan_from} onChange={event=>setScheduleSettings(current=>({...current,departure_scan_from:event.target.value}))}/></label>
          <label>Kirim peringatan BK (WITA)<input type="time" value={scheduleSettings.bk_alert_at} onChange={event=>setScheduleSettings(current=>({...current,bk_alert_at:event.target.value}))}/></label>
          <button type="button" className="attendance-primary" onClick={()=>void saveAttendanceSchedule()} disabled={scheduleSaving || scheduleLoading}>
            {scheduleSaving ? "Menyimpan..." : scheduleLoading ? "Memuat..." : "Simpan jadwal"}
          </button>
        </div>
        <p className="attendance-schedule-note">Scan kedatangan setelah batas hadir tetap diterima sampai batas Alpa dan dicatat sebagai terlambat. Sesi QR kepulangan tetap aktif sampai admin menutupnya.</p>
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
      {canRecordAttendance && <form className="attendance-panel" onSubmit={event=>{
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
          <div className="attendance-self-date"><CalendarDays size={16}/><span>Tanggal absensi</span><strong>{date}</strong></div>
          {role === "siswa" && <div className="attendance-self-qr">
            <div><strong>Scan QR Kehadiran</strong><small>Gunakan QR kedatangan sekolah atau QR mata pelajaran guru.</small></div>
            {qrError && <div className="attendance-alert error" role="alert"><XCircle size={17}/>{qrError}</div>}
            <button className="attendance-secondary" type="button" onClick={()=>cameraOn ? stopCamera() : void startCamera("attendance")}>
              <Camera size={18}/>{cameraOn ? "Tutup Kamera" : "Buka Pemindai QR"}
            </button>
            {cameraOn && <div className="attendance-camera"><video ref={videoRef} muted playsInline/><button type="button" onClick={stopCamera} aria-label="Tutup kamera"><XCircle size={20}/></button></div>}
            <p className="attendance-qr-manual-help">Jika kamera bermasalah, masukkan kode terbaru yang ditampilkan pada layar QR kedatangan atau kepulangan.</p>
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
          <label>Jenis pengguna<select value={personType} onChange={e=>{const type=e.target.value as PersonType;setPersonType(type);setIdentifier("");setPersonName("");setClassName("");setVerifiedIdentifier("");setIdentityLookup("idle");setIdentityLookupMessage("");if(type==="guru_tendik")setClassName("");}}><option value="siswa">Siswa</option><option value="guru_tendik">Guru / Tendik</option></select></label>
          <button className="attendance-scan" type="button" onClick={()=>cameraOn ? stopCamera() : void startCamera("identity")}><Camera size={18}/>{cameraOn ? "Tutup Kamera" : "Scan QR dengan Kamera"}</button>
          {cameraOn && <div className="attendance-camera"><video ref={videoRef} muted playsInline/><button type="button" onClick={stopCamera} aria-label="Tutup kamera"><XCircle size={20}/></button></div>}
          <p className="attendance-hint">Format QR yang didukung: <code>jenis|NISN/NIP|Nama|Kelas</code>. Identitas harus terdaftar di Data Induk.</p>
          <label>{personType === "siswa" ? "NISN" : "NIP"}<input value={identifier} onChange={e=>{setIdentifier(e.target.value);setVerifiedIdentifier("");setIdentityLookup("idle");setIdentityLookupMessage("");}} required placeholder={personType === "siswa" ? "Masukkan NISN" : "Masukkan NIP"}/></label>
          {identityLookupMessage && <p className={`attendance-lookup-message lookup-${identityLookup}`} role="status">{identityLookupMessage}</p>}
          <label>Nama lengkap<input value={personName} readOnly required placeholder="Nama terisi otomatis dari Data Induk"/></label>
          {personType === "siswa" && <label>Kelas<input value={className} readOnly placeholder="Kelas dari Data Induk"/></label>}
        </>}
        {role !== "siswa" && <div className="attendance-status-field">
          <span>Status kehadiran</span>
          <div className="attendance-status-picker" role="group" aria-label="Status kehadiran">
            {statuses.map(option=><button type="button" key={option.value}
              className={`attendance-status-option${status === option.value ? " is-selected" : ""} status-${option.value}`}
              onClick={()=>setStatus(option.value)} aria-pressed={status === option.value}>{option.label}</button>)}
          </div>
        </div>}
        {role !== "siswa" && <label>Keterangan (opsional)<textarea value={note} onChange={e=>setNote(e.target.value)} rows={2} placeholder="Keterangan sakit/izin atau catatan"/></label>}
        {error && <div className="attendance-alert error"><XCircle size={17}/>{error}</div>}
        {message && <div className="attendance-alert success"><CheckCircle2 size={17}/>{message}</div>}
        {role !== "siswa" && <button className="attendance-primary" disabled={saving || identityLoading || (isSelfService && !identity) || (!isSelfService && (identityLookup !== "found" || verifiedIdentifier !== identifier.trim()))}>{saving ? "Menyimpan..." : "Simpan Absensi"}</button>}
      </form>}
      <section className={`attendance-panel attendance-records${!canRecordAttendance ? " attendance-records-wide" : ""}`}>
        <div className="attendance-panel-title"><div><h2>{isTeacher ? "Rekap Kehadiran Mapel Saya" : isSelfService ? "Riwayat Kehadiran Saya" : "Rekap Harian"}</h2><p>{date} · {rows.length} catatan</p></div><FileSpreadsheet size={22}/></div>
        <div className="attendance-tools"><div className="attendance-search"><Search size={16}/><input value={filter} onChange={e=>setFilter(e.target.value)} placeholder="Cari nama, kode, kelas..."/></div>
          {role !== "siswa" && <button className="attendance-secondary" onClick={()=>void exportRows(false)} disabled={exporting}><Download size={16}/> Excel</button>}
          {(!isSelfService || isTeacher) && <button className="attendance-secondary" onClick={()=>window.print()}><Download size={16}/> PDF / Cetak</button>}
        </div>
        <div className="attendance-table-wrap"><table><thead><tr><th>Nama / ID</th><th>Jenis</th><th>Kelas</th><th>Status</th></tr></thead><tbody>
        {filtered.map(r=><tr key={r.id}><td><strong>{r.person_name}</strong><small>{r.person_identifier}</small>{r.session_type === "subject" && <small className="attendance-row-subject">{r.subject || "Mapel"}{r.teacher_name ? ` · ${r.teacher_name}` : ""}</small>}</td><td>{r.person_type==="siswa"?"Siswa":"Guru/Tendik"}</td><td>{r.class_name || "—"}</td><td><span className={`attendance-status status-${r.status}`}>{r.session_type === "school_departure" ? "Pulang" : statusLabel(r.status)}</span></td></tr>)}
        {!filtered.length && <tr><td colSpan={4} className="attendance-empty">{loading?"Memuat data...":"Belum ada data untuk tanggal/filter ini."}</td></tr>}
        </tbody></table></div>
        {role !== "siswa" && <div className="attendance-month-export"><label>{isSelfService ? "Riwayat bulanan" : "Rekap bulanan"}<input type="month" value={month} onChange={e=>setMonth(e.target.value)}/></label><button className="attendance-primary" disabled={exporting} onClick={()=>void exportRows(true)}><Download size={16}/>{exporting ? "Menyiapkan..." : isSelfService ? "Ekspor Riwayat Saya" : "Ekspor Excel Bulanan"}</button></div>}
        <p className="attendance-hint"><ShieldCheck size={14}/> {role === "siswa" ? "Riwayat kehadiran dapat dilihat di halaman ini dan tidak menyediakan fitur unduh." : "Data ditampilkan sesuai hak akses Supabase yang diberikan ke akun login."}</p>
      </section>
    </div>
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
