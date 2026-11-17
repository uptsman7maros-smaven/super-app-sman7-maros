import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import "./KesiswaanBK.css";
import AttendanceAlertsPanel from "./features/kesiswaan-bk/components/AttendanceAlertsPanel";
import ConfirmModal from "./features/kesiswaan-bk/components/ConfirmModal";
import CounselorAssignmentsPanel from "./features/kesiswaan-bk/components/CounselorAssignmentsPanel";
import DataTable from "./features/kesiswaan-bk/components/DataTable";
import SectionForm from "./features/kesiswaan-bk/components/SectionForm";
import StatsHeader from "./features/kesiswaan-bk/components/StatsHeader";
import StudentProfileDrawer from "./features/kesiswaan-bk/components/StudentProfileDrawer";
import { SECTION_BY_KEY, SECTION_CONFIGS } from "./features/kesiswaan-bk/constants";
import {
  deleteSectionRecord,
  exportSectionCsv,
  loadAttendanceAlerts,
  loadCounselorAssignments,
  loadSectionRows,
  loadStudentsAndYears,
  loadSummaryStats,
  markAttendanceAlertRead,
  saveCounselorAssignment,
  saveSectionRecord,
} from "./features/kesiswaan-bk/services/kesiswaanBkService";
import type {
  AcademicYearOption,
  AssignmentStudent,
  AttendanceBkAlert,
  CounselorOption,
  KbRow,
  QueryFilters,
  SectionFormValue,
  SectionKey,
  StudentOption,
  SummaryStats,
  UserRole,
  ViewMode,
} from "./features/kesiswaan-bk/types";
import type { SchoolUser } from "./context/school-context";

const EMPTY_FILTERS: QueryFilters = {
  search: "",
  academicYearId: "",
  semester: "",
  classId: "",
  dateFrom: "",
  dateTo: "",
};

const EMPTY_STATS: SummaryStats = {
  unreadAlerts: null,
  activeCases: null,
  permitsToday: null,
  achievements: null,
};

function messageOf(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function fieldValue(row: KbRow, key: string, kind?: string) {
  const value = row[key];
  if (value === null || value === undefined) return "";
  const text = String(value);
  if (kind === "date") return text.slice(0, 10);
  if (kind === "time") return text.slice(0, 5);
  return text;
}

export default function KesiswaanBK({
  currentUser,
  userRole,
}: {
  currentUser: SchoolUser;
  userRole: string;
}) {
  const [active, setActive] = useState<SectionKey>("Prestasi");
  const [view, setView] = useState<ViewMode>("data");
  const role = (userRole || currentUser.role) as UserRole;
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [academicYears, setAcademicYears] = useState<AcademicYearOption[]>([]);
  const [rows, setRows] = useState<KbRow[]>([]);
  const [count, setCount] = useState(0);
  const [filters, setFilters] = useState<QueryFilters>(EMPTY_FILTERS);
  const [page, setPage] = useState(0);
  const [form, setForm] = useState<SectionFormValue>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [rowToDelete, setRowToDelete] = useState<KbRow | null>(null);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [stats, setStats] = useState<SummaryStats>(EMPTY_STATS);
  const [alerts, setAlerts] = useState<AttendanceBkAlert[]>([]);
  const [assignmentStudents, setAssignmentStudents] = useState<AssignmentStudent[]>([]);
  const [counselors, setCounselors] = useState<CounselorOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [alertsLoading, setAlertsLoading] = useState(false);
  const [assignmentsLoading, setAssignmentsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingAssignmentId, setSavingAssignmentId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const rowsRequestId = useRef(0);

  const config = SECTION_BY_KEY[active];
  const isSensitive = config.private === true;
  const canSeePrivateNotes = role === "super_admin" || role === "guru_bk";
  const canManageAssignments = role === "super_admin" || role === "operator";
  const canSeeAlerts = role === "guru_bk" || role === "super_admin" || role === "operator";
  const studentById = useMemo(() => new Map(students.map(student => [student.id, student])), [students]);
  const statsFilters = useMemo(() => ({
    ...EMPTY_FILTERS,
    academicYearId: filters.academicYearId,
    semester: filters.semester,
  }), [filters.academicYearId, filters.semester]);

  const refreshRows = useCallback(async () => {
    const requestId = ++rowsRequestId.current;
    if (isSensitive && !canSeePrivateNotes) {
      if (requestId === rowsRequestId.current) {
        setRows([]);
        setCount(0);
      }
      return;
    }
    setLoading(true);
    try {
      const result = await loadSectionRows(config, filters, page, students);
      if (requestId === rowsRequestId.current) {
        setRows(result.rows);
        setCount(result.count);
        setError("");
      }
    } catch (loadError) {
      if (requestId === rowsRequestId.current) setError(messageOf(loadError, "Data gagal dimuat."));
    } finally {
      if (requestId === rowsRequestId.current) setLoading(false);
    }
  }, [canSeePrivateNotes, config, filters, isSensitive, page, students]);

  const refreshAlerts = useCallback(async () => {
    setAlertsLoading(true);
    try {
      const result = await loadAttendanceAlerts();
      setAlerts(result.alerts);
      setStats(current => ({ ...current, unreadAlerts: result.unreadCount }));
      setError("");
    } catch (loadError) {
      setError(messageOf(loadError, "Peringatan absensi gagal dimuat."));
    } finally {
      setAlertsLoading(false);
    }
  }, []);

  useEffect(() => {
    let activeEffect = true;
    void loadStudentsAndYears().then(result => {
      if (!activeEffect) return;
      setStudents(result.students);
      setAcademicYears(result.academicYears);
      const currentYear = result.academicYears.find(year => year.is_active);
      if (currentYear) setFilters(current => current.academicYearId ? current : { ...current, academicYearId: currentYear.id });
    }).catch(loadError => {
      if (activeEffect) setError(messageOf(loadError, "Data siswa dan tahun ajaran gagal dimuat."));
    });
    return () => { activeEffect = false; };
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void refreshRows(); }, filters.search ? 280 : 0);
    return () => {
      window.clearTimeout(timer);
      rowsRequestId.current += 1;
    };
  }, [filters, refreshRows]);

  useEffect(() => {
    let activeEffect = true;
    void loadSummaryStats(role, statsFilters).then(result => {
      if (activeEffect) setStats(result);
    }).catch(statsError => {
      if (activeEffect) setError(messageOf(statsError, "Ringkasan statistik gagal dimuat."));
    });
    return () => { activeEffect = false; };
  }, [role, statsFilters]);

  useEffect(() => {
    if (view !== "alerts" || !canSeeAlerts) return;
    const timer = window.setTimeout(() => { void refreshAlerts(); }, 0);
    const interval = window.setInterval(() => { void refreshAlerts(); }, 60_000);
    return () => {
      window.clearTimeout(timer);
      window.clearInterval(interval);
    };
  }, [canSeeAlerts, refreshAlerts, view]);

  useEffect(() => {
    if (view !== "assignments" || !canManageAssignments) return;
    let activeEffect = true;
    const timer = window.setTimeout(() => {
      setAssignmentsLoading(true);
      void loadCounselorAssignments().then(result => {
        if (!activeEffect) return;
        setAssignmentStudents(result.students);
        setCounselors(result.counselors);
        setError("");
      }).catch(loadError => {
        if (activeEffect) setError(messageOf(loadError, "Penugasan Guru BK gagal dimuat."));
      }).finally(() => {
        if (activeEffect) setAssignmentsLoading(false);
      });
    }, 0);
    return () => {
      activeEffect = false;
      window.clearTimeout(timer);
    };
  }, [canManageAssignments, view]);

  function changeFilters(changes: Partial<QueryFilters>) {
    setFilters(current => ({ ...current, ...changes }));
    setPage(0);
  }

  function selectSection(section: SectionKey) {
    setActive(section);
    setView("data");
    setForm({});
    setEditingId(null);
    setNotice("");
    setError("");
  }

  function startAlertFollowUp(alert: AttendanceBkAlert, kind: "note" | "schedule") {
    const student = studentById.get(alert.student_id);
    setActive(kind === "note" ? "Catatan BK" : "Jadwal BK");
    setView("data");
    setEditingId(null);
    setForm(kind === "note"
      ? {
          student_id: alert.student_id,
          tanggal: alert.attendance_date,
          bidang_layanan: "Pribadi",
          jenis_layanan: "Konseling Individu",
          prioritas: "Pantauan",
          status_kasus: "Terbuka",
          ringkasan: `${alert.title}: ${alert.body}`,
          source_alert_id: alert.id,
        }
      : {
          student_id: alert.student_id,
          nama_guru_bk: student?.counselor_name ?? "Guru BK",
          hari_tanggal: alert.attendance_date,
          keterangan: `Tindak lanjut peringatan absensi: ${alert.body}`,
        });
  }

  function editRow(row: KbRow) {
    const values: SectionFormValue = {};
    for (const field of config.fields) values[field.key] = fieldValue(row, field.key, field.kind);
    if (typeof row.student_id === "string") {
      const student = studentById.get(row.student_id);
      if (student) values.student_id_search = `${student.full_name} · ${student.nisn}${student.class_name ? ` · ${student.class_name}` : ""}`;
    }
    if (config.key === "Catatan BK" && typeof row.source_alert_id === "string") {
      values.source_alert_id = row.source_alert_id;
    }
    setForm(values);
    setEditingId(row.id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function submitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");
    if (config.fields.some(field => field.key === "student_id" && field.required) && !form.student_id) {
      setError("Pilih siswa dari daftar yang tersedia.");
      return;
    }
    setSaving(true);
    try {
      await saveSectionRecord(config, form, students, academicYears, filters.semester, editingId);
      setNotice(editingId ? "Data berhasil diperbarui." : "Data berhasil ditambahkan.");
      setForm({});
      setEditingId(null);
      await refreshRows();
      const nextStats = await loadSummaryStats(role, filters);
      setStats(nextStats);
    } catch (saveError) {
      setError(messageOf(saveError, "Data gagal disimpan."));
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!rowToDelete) return;
    setDeleting(true);
    setError("");
    try {
      await deleteSectionRecord(config, rowToDelete.id);
      setRowToDelete(null);
      setNotice("Data berhasil dihapus.");
      await refreshRows();
    } catch (deleteError) {
      setError(messageOf(deleteError, "Data gagal dihapus."));
    } finally {
      setDeleting(false);
    }
  }

  async function markAlertRead(alert: AttendanceBkAlert) {
    try {
      await markAttendanceAlertRead(alert.id);
      setAlerts(current => current.map(item => item.id === alert.id ? { ...item, is_read: true } : item));
      setStats(current => ({ ...current, unreadAlerts: Math.max(0, (current.unreadAlerts ?? 1) - 1) }));
    } catch (updateError) {
      setError(messageOf(updateError, "Peringatan gagal diperbarui."));
    }
  }

  async function updateAssignment(studentId: string, counselorId: string) {
    setSavingAssignmentId(studentId);
    setError("");
    setNotice("");
    try {
      await saveCounselorAssignment(studentId, counselorId);
      setAssignmentStudents(current => current.map(student => student.id === studentId
        ? { ...student, counselor_profile_id: counselorId || null }
        : student));
      setStudents(current => current.map(student => student.id === studentId
        ? { ...student, counselor_profile_id: counselorId || null, counselor_name: counselors.find(item => item.id === counselorId)?.name ?? null }
        : student));
      setNotice("Penanggung jawab Guru BK berhasil diperbarui.");
    } catch (saveError) {
      setError(messageOf(saveError, "Penugasan Guru BK gagal disimpan."));
    } finally {
      setSavingAssignmentId(null);
    }
  }

  async function exportCsv() {
    setError("");
    try {
      const csv = await exportSectionCsv(config, filters, students);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${config.table}-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (exportError) {
      setError(messageOf(exportError, "Ekspor CSV gagal."));
    }
  }

  return (
    <main className="kb-shell">
      <div className="kb-hero">
        <div>
          <span className="kb-eyebrow">SUPER APP · SMAN 7 MAROS</span>
          <h1>Kesiswaan <em>& BK</em></h1>
          <p>Pusat pengelolaan prestasi, pembinaan, layanan konseling, perizinan, dan kegiatan siswa.</p>
        </div>
        <div className="kb-hero-icon">✦</div>
      </div>

      <StatsHeader
        stats={stats}
        academicYearId={filters.academicYearId}
        academicYears={academicYears}
        semester={filters.semester}
      />
      {error && <div className="kb-alert" role="alert">{error}</div>}
      {notice && <div className="kb-success" role="status">{notice}</div>}

      <nav className="kb-tabs" aria-label="Bagian Kesiswaan dan BK">
        {SECTION_CONFIGS.filter(section => section.key !== "Rencana Karir" || canSeePrivateNotes).map(section => (
          <button
            key={section.key}
            className={view === "data" && active === section.key ? "active" : ""}
            type="button"
            onClick={() => selectSection(section.key)}
          >{section.key}</button>
        ))}
        {canSeeAlerts && <button className={view === "alerts" ? "active" : ""} type="button" onClick={() => setView("alerts")}>
          🔔 Peringatan Absensi{stats.unreadAlerts ? ` (${stats.unreadAlerts})` : ""}
        </button>}
        {canManageAssignments && <button className={view === "assignments" ? "active" : ""} type="button" onClick={() => setView("assignments")}>👥 Penugasan Guru BK</button>}
      </nav>

      {view === "data" && <>
        {isSensitive && <div className="kb-privacy">🔐 Catatan BK bersifat rahasia. Akses rinci dibatasi oleh RLS berdasarkan peran dan penugasan.</div>}
        {isSensitive && !canSeePrivateNotes ? (
          <section className="kb-panel">
            <div className="kb-panel-heading"><div><span className="kb-eyebrow">RINGKASAN SAJA</span><h2>Status kasus BK</h2></div></div>
            <p className="kb-attendance-alert-intro">Kepala sekolah tidak dapat membuka isi catatan konseling. Ringkasan status agregat ditampilkan di kartu statistik.</p>
          </section>
        ) : <>
          <SectionForm
            config={config}
            form={form}
            students={students}
            academicYears={academicYears}
            academicYearId={filters.academicYearId}
            semester={filters.semester}
            editing={editingId !== null}
            busy={saving}
            error={error}
            onFormChange={setForm}
            onAcademicYearChange={value => changeFilters({ academicYearId: value })}
            onSemesterChange={value => changeFilters({ semester: value })}
            onSubmit={submitForm}
            onReset={() => { setForm({}); setEditingId(null); setError(""); }}
          />
          <DataTable
            config={config}
            rows={rows}
            students={students}
            academicYears={academicYears}
            filters={filters}
            count={count}
            page={page}
            loading={loading}
            onFiltersChange={changeFilters}
            onPageChange={setPage}
            onEdit={editRow}
            onDelete={setRowToDelete}
            onOpenProfile={student => setSelectedStudentId(student.id)}
            onExport={() => void exportCsv()}
            onPrint={() => window.print()}
          />
        </>}
      </>}

      {view === "alerts" && canSeeAlerts && (
        <AttendanceAlertsPanel
          alerts={alerts}
          students={students}
          loading={alertsLoading}
          error=""
          onRefresh={() => void refreshAlerts()}
          onMarkRead={alert => void markAlertRead(alert)}
          onFollowUp={startAlertFollowUp}
          onOpenProfile={student => setSelectedStudentId(student.id)}
        />
      )}
      {view === "assignments" && canManageAssignments && (
        <CounselorAssignmentsPanel
          students={assignmentStudents}
          counselors={counselors}
          loading={assignmentsLoading}
          savingStudentId={savingAssignmentId}
          error=""
          notice=""
          onSave={(studentId, counselorId) => void updateAssignment(studentId, counselorId)}
          onOpenProfile={student => setSelectedStudentId(student.id)}
        />
      )}

      {selectedStudentId && <StudentProfileDrawer
        key={selectedStudentId}
        studentId={selectedStudentId}
        role={role}
        onClose={() => setSelectedStudentId(null)}
      />}
      <ConfirmModal
        open={rowToDelete !== null}
        title="Hapus data?"
        message="Data akan dihapus dan tidak dapat dipulihkan."
        busy={deleting}
        onCancel={() => setRowToDelete(null)}
        onConfirm={() => void confirmDelete()}
      />
      <p className="kb-foot">Kesiswaan & BK · SMAN 7 Maros · Lindungi data pribadi siswa dan catatan konseling.</p>
    </main>
  );
}
