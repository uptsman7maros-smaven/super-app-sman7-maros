import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import type { ReactNode } from "react";
import type { SchoolUser } from "../../../context/school-context";
import ReportActions from "./ReportActions";
import {
  createCurhatThread,
  generateBkAkpdQuestions,
  generateBkRplDraft,
  listAkpdForms,
  listAkpdResponses,
  listConsultations,
  listCurhatMessages,
  listCurhatThreads,
  listHomeVisits,
  listRpl,
  loadStudentCounselingProfile,
  loadStudentServiceCounts,
  markCurhatRead,
  saveAkpdForm,
  saveAkpdResponse,
  saveConsultation,
  saveHomeVisit,
  saveRpl,
  saveStudentCounselingProfile,
  sendCurhatMessage,
  updateCurhatStatus,
} from "../services/bkWorkflowService";
import type {
  AkpdFormRow,
  AkpdResponseRow,
  ClassOption,
  ConsultationRow,
  CurhatMessageRow,
  CurhatThreadRow,
  HomeVisitRow,
  RplRow,
  SchoolHeader,
  StudentCounselingProfile,
  StudentOption,
  AcademicYearOption,
  UserRole,
} from "../types";

export type CounselingWorkspaceTab =
  | "Konsultasi BK"
  | "Kunjungan Rumah"
  | "Generator RPL"
  | "Daftar Siswa Asuh"
  | "Kotak Masuk Curhat"
  | "Curhat ke Guru BK"
  | "Pengajuan Konsultasi"
  | "Angket Kebutuhan Siswa";

type Props = {
  tab: CounselingWorkspaceTab;
  role: UserRole;
  currentUser: SchoolUser;
  students: StudentOption[];
  classes: ClassOption[];
  academicYears: AcademicYearOption[];
  schoolHeader: SchoolHeader;
  initialRplTopic?: string;
  consultationStudentId?: string | null;
  consultationPrefillTopic?: string;
  onCreateRplFromTopic: (topic: string) => void;
};

const AREA_OPTIONS = ["Pribadi", "Sosial", "Belajar", "Karir"] as const;
const RPL_PRESETS = [
  "Pencegahan & Penanganan Bullying (Perundungan)",
  "Membangun Kepercayaan Diri (Self-Confidence)",
  "Pencegahan Kekerasan Seksual & Menjaga Batasan Diri",
  "Hubungan Pertemanan & Komunikasi Sosial yang Sehat",
  "Topik kustom",
] as const;
const RPL_FIELDS = [
  "Tujuan umum",
  "Tujuan khusus",
  "Metode dan teknik",
  "Media / alat",
  "Tahap awal / pendahuluan",
  "Tahap inti",
  "Tahap penutup",
  "Evaluasi proses",
  "Evaluasi hasil",
] as const;
const AKPD_DEFAULT_QUESTIONS = [
  { area: "Pribadi", text: "Saya membutuhkan cara untuk membangun kepercayaan diri dan menerima diri." },
  { area: "Pribadi", text: "Saya mengetahui cara mencari bantuan dan menjaga keamanan diri dari kekerasan atau perundungan." },
  { area: "Sosial", text: "Saya membutuhkan bantuan menghadapi perundungan atau konflik pertemanan." },
  { area: "Sosial", text: "Saya ingin belajar berkomunikasi dan membangun pertemanan yang sehat." },
  { area: "Belajar", text: "Saya membutuhkan bantuan beradaptasi dengan pola belajar di SMA." },
  { area: "Belajar", text: "Saya ingin belajar mengatur waktu, fokus, dan motivasi belajar." },
  { area: "Karir", text: "Saya membutuhkan informasi untuk mengenali minat, bakat, dan pilihan karir." },
  { area: "Karir", text: "Saya membutuhkan bantuan merencanakan studi lanjut atau pekerjaan." },
];

function weekday(date: string) {
  return date ? new Date(`${date}T00:00:00`).toLocaleDateString("id-ID", { weekday: "long" }) : "";
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character] ?? character);
}

function safeExportRows(rows: Record<string, unknown>[]) {
  return rows.map(row => Object.fromEntries(Object.entries(row).map(([key, value]) => {
    if (typeof value !== "string") return [key, value];
    const first = value.trimStart()[0];
    return [key, first && "=-+@".includes(first) ? `'${value}` : value];
  })));
}

function downloadCsv(filename: string, rows: Record<string, unknown>[]) {
  const sheet = XLSX.utils.json_to_sheet(safeExportRows(rows));
  const csv = XLSX.utils.sheet_to_csv(sheet);
  const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function homeVisitExportRows(visits: HomeVisitRow[]) {
  return visits.map(item => ({ ...item }));
}

function downloadExcel(filename: string, rows: Record<string, unknown>[]) {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(safeExportRows(rows)), "Laporan BK");
  XLSX.writeFile(workbook, filename);
}

function PrintHeader({ header, title }: { header: SchoolHeader; title: string }) {
  return (
    <header className="kb-print-header">
      {header.letterhead && <p>{header.letterhead}</p>}
      <h1>{header.school_name}</h1>
      {header.npsn && <p>NPSN {header.npsn}</p>}
      <hr />
      <h2>{title}</h2>
    </header>
  );
}

function LabelCaption({ children, required = false }: { children: ReactNode; required?: boolean }) {
  return <span className="kb-label-caption">{children}{required && <b className="kb-required-mark" aria-hidden="true">*</b>}</span>;
}

function Signatures() {
  return (
    <div className="kb-signatures">
      <p>Mengetahui,<br />Kepala Sekolah</p>
      <p>Guru Bimbingan dan Konseling</p>
      <div />
      <div />
      <span>(........................................)</span>
      <span>(........................................)</span>
    </div>
  );
}

export default function CounselingWorkflowPanel({
  tab,
  role,
  currentUser,
  students,
  classes,
  academicYears,
  schoolHeader,
  initialRplTopic = "",
  consultationStudentId = null,
  consultationPrefillTopic = "",
  onCreateRplFromTopic,
}: Props) {
  const isStudent = role === "siswa";
  const canManage = ["guru_bk", "super_admin", "operator"].includes(role);
  const canEditStudentProfile = role === "guru_bk" || role === "super_admin";
  const student = isStudent
    ? students.find(item => item.profile_id === currentUser.id) ?? students[0]
    : undefined;
  const activeYear = academicYears.find(year => year.is_active)?.id ?? "";
  const [consultations, setConsultations] = useState<ConsultationRow[]>([]);
  const [consultationDrafts, setConsultationDrafts] = useState<Record<string, {
    scheduled_date: string;
    start_time: string;
    end_time: string;
    outcome_summary: string;
    follow_up: string;
  }>>({});
  const [visits, setVisits] = useState<HomeVisitRow[]>([]);
  const [rpls, setRpls] = useState<RplRow[]>([]);
  const [forms, setForms] = useState<AkpdFormRow[]>([]);
  const [responses, setResponses] = useState<AkpdResponseRow[]>([]);
  const [threads, setThreads] = useState<CurhatThreadRow[]>([]);
  const [messages, setMessages] = useState<CurhatMessageRow[]>([]);
  const [selectedThread, setSelectedThread] = useState<CurhatThreadRow | null>(null);
  const [selectedStudent, setSelectedStudent] = useState<StudentOption | null>(null);
  const [studentProfile, setStudentProfile] = useState<StudentCounselingProfile | null>(null);
  const [search, setSearch] = useState("");
  const [classFilter, setClassFilter] = useState("");
  const [counselorFilter, setCounselorFilter] = useState("");
  const [serviceCounts, setServiceCounts] = useState<Map<string, number>>(new Map());
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [consultForm, setConsultForm] = useState({
    student_id: consultationStudentId ?? student?.id ?? "",
    requester_name: currentUser.full_name || currentUser.username,
    topic: consultationPrefillTopic,
    scheduled_date: "",
    start_time: "",
    end_time: "",
  });
  const [visitForm, setVisitForm] = useState({
    student_id: "",
    visit_date: new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Makassar" }),
    visit_time: "",
    address: "",
    people_met: "Ayah",
    purpose: "",
    observations: "",
    agreement_follow_up: "",
    auto_agenda: true,
  });
  const [rplId, setRplId] = useState("");
  const [rplTitle, setRplTitle] = useState(initialRplTopic);
  const [rplTopic, setRplTopic] = useState(initialRplTopic);
  const [rplGrade, setRplGrade] = useState("");
  const [rplArea, setRplArea] = useState("Pribadi");
  const [rplDuration, setRplDuration] = useState("2 x 45 menit");
  const [rplYearId, setRplYearId] = useState(activeYear);
  const [rplContent, setRplContent] = useState<Record<string, string>>({});
  const [questionDraft, setQuestionDraft] = useState("");
  const [formTitle, setFormTitle] = useState("Angket Kebutuhan Peserta Didik");
  const [akpdId, setAkpdId] = useState("");
  const [akpdYearId, setAkpdYearId] = useState(activeYear);
  const [targetGrade, setTargetGrade] = useState("Semua");
  const [formActive, setFormActive] = useState(true);
  const [selectedForm, setSelectedForm] = useState("");
  const [answerDraft, setAnswerDraft] = useState<Record<string, string>>({});
  const [messageDraft, setMessageDraft] = useState("");
  const [profileDraft, setProfileDraft] = useState<StudentCounselingProfile | null>(null);

  async function reloadTab() {
    setError("");
    try {
      if (tab === "Konsultasi BK" || tab === "Pengajuan Konsultasi") {
        setConsultations(await listConsultations(isStudent ? student?.id : undefined));
      } else if (tab === "Kunjungan Rumah") {
        setVisits(await listHomeVisits());
      } else if (tab === "Generator RPL") {
        setRpls(await listRpl());
      } else if (tab === "Angket Kebutuhan Siswa") {
        const [loadedForms, loadedResponses] = await Promise.all([
          listAkpdForms(isStudent),
          listAkpdResponses(),
        ]);
        setForms(loadedForms);
        setResponses(loadedResponses);
        if (!selectedForm && loadedForms.length) setSelectedForm(loadedForms[0].id);
      } else if (tab === "Kotak Masuk Curhat" || tab === "Curhat ke Guru BK") {
        setThreads(await listCurhatThreads(isStudent ? student?.id : undefined));
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Data BK gagal dimuat.");
    }
  }

  useEffect(() => {
    const timerId = window.setTimeout(() => { void reloadTab(); }, 0);
    return () => window.clearTimeout(timerId);
  // reloadTab uses the active tab and the student scope as its request key.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, student?.id]);

  useEffect(() => {
    if (!selectedThread) return;
    let active = true;
    void Promise.all([
      listCurhatMessages(selectedThread.id),
      markCurhatRead(selectedThread.id, isStudent ? "siswa" : "guru_bk"),
    ]).then(([loaded]) => {
      if (active) {
        setMessages(loaded);
        setThreads(current => current.map(thread => thread.id === selectedThread.id
          ? {
              ...thread,
              unread_by_counselor: isStudent ? thread.unread_by_counselor : false,
              unread_by_student: isStudent ? false : thread.unread_by_student,
              status: !isStudent && thread.status === "Baru" ? "Dibaca" : thread.status,
            }
          : thread));
      }
    }).catch(loadError => {
      if (active) setError(loadError instanceof Error ? loadError.message : "Percakapan gagal dimuat.");
    });
    return () => { active = false; };
  }, [isStudent, selectedThread]);

  useEffect(() => {
    if (!selectedStudent) return;
    if (!canEditStudentProfile) return;
    let active = true;
    void loadStudentCounselingProfile(selectedStudent.id).then(profile => {
      if (active) {
        const nextProfile = profile ?? {
          student_id: selectedStudent.id,
          home_address: "",
          guardian_name: "",
          guardian_occupation: "",
          talents: "",
          career_plan: "",
          health_notes: "",
        };
        setStudentProfile(profile);
        setProfileDraft(nextProfile);
      }
    }).catch(loadError => {
      if (active) setError(loadError instanceof Error ? loadError.message : "Biodata BK gagal dimuat.");
    });
    return () => { active = false; };
  }, [canEditStudentProfile, selectedStudent]);

  const visibleStudents = useMemo(() => students.filter(item => {
    const assigned = role !== "guru_bk" || item.counselor_profile_id === currentUser.id;
    return assigned
      && (!classFilter || item.class_id === classFilter)
      && (!counselorFilter || item.counselor_profile_id === counselorFilter)
      && `${item.full_name} ${item.nisn} ${item.class_name}`.toLowerCase().includes(search.toLowerCase());
  }), [classFilter, counselorFilter, currentUser.id, role, search, students]);
  const counselorOptions = [...new Map(students.filter(item => item.counselor_profile_id)
    .map(item => [item.counselor_profile_id as string, item.counselor_name ?? "Guru BK"])).entries()];

  const selectedAkpd = forms.find(form => form.id === selectedForm) ?? forms[0] ?? null;
  const studentResponse = selectedAkpd && student
    ? responses.find(response => response.form_id === selectedAkpd.id && response.student_id === student.id)
    : undefined;

  useEffect(() => {
    if (tab !== "Daftar Siswa Asuh" || !canEditStudentProfile) return;
    const timerId = window.setTimeout(() => {
      void loadStudentServiceCounts().then(setServiceCounts).catch(loadError => {
        setError(loadError instanceof Error ? loadError.message : "Ringkasan layanan siswa gagal dimuat.");
      });
    }, 0);
    return () => window.clearTimeout(timerId);
  }, [canEditStudentProfile, tab]);

  async function runSave(action: () => Promise<void>, success: string) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
      setNotice(success);
      await reloadTab();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Perubahan gagal disimpan.");
    } finally {
      setBusy(false);
    }
  }

  async function generateRplDraft() {
    if (!rplTopic.trim()) {
      setError("Isi topik layanan sebelum meminta bantuan AI.");
      return;
    }
    setAiBusy(true);
    setError("");
    setNotice("");
    try {
      const draft = await generateBkRplDraft({
        topic: rplTopic.trim(),
        area: rplArea,
        targetClass: rplGrade,
        duration: rplDuration,
      });
      setRplContent(draft);
      setNotice("Draf RPL dibuat. Tinjau dan sesuaikan sebelum disimpan.");
    } catch (draftError) {
      setError(draftError instanceof Error ? draftError.message : "Draf RPL gagal dibuat.");
    } finally {
      setAiBusy(false);
    }
  }

  async function generateAkpdDraft() {
    setAiBusy(true);
    setError("");
    setNotice("");
    try {
      const questions = await generateBkAkpdQuestions(targetGrade);
      setQuestionDraft(questions.map(question => `${question.area} | ${question.text}`).join("\n"));
      setNotice("Draf pertanyaan AKPD dibuat. Tinjau dan edit sebelum menyimpan angket.");
    } catch (draftError) {
      setError(draftError instanceof Error ? draftError.message : "Draf pertanyaan AKPD gagal dibuat.");
    } finally {
      setAiBusy(false);
    }
  }

  function exportConsultations(format: "xlsx" | "csv") {
    const rows = safeExportRows(consultations.map(item => ({
      Pemohon: item.requester_name,
      Siswa: students.find(option => option.id === item.student_id)?.full_name ?? "",
      Kelas: students.find(option => option.id === item.student_id)?.class_name ?? "",
      Topik: item.topic,
      Tanggal: item.scheduled_date ?? "",
      Waktu: `${item.start_time ?? ""}–${item.end_time ?? ""}`,
      Status: item.status,
      "Ringkasan hasil": item.outcome_summary ?? "",
      "Tindak lanjut": item.follow_up ?? "",
    })));
    if (format === "xlsx") {
      downloadExcel("laporan-konsultasi-bk.xlsx", rows);
    } else {
      downloadCsv("laporan-konsultasi-bk.csv", rows);
    }
  }

  function printReport() {
    window.print();
  }

  function openRpl(row: RplRow) {
    setRplId(row.id);
    setRplTitle(row.title);
    setRplTopic(row.title);
    setRplGrade(row.target_class);
    setRplArea(row.service_area);
    setRplContent(row.content);
    setRplYearId(row.academic_year_id ?? activeYear);
  }

  function printRpl() {
    const html = escapeHtml;
    const doc = `<!doctype html><html lang="id"><head><meta charset="utf-8"><title>${html(rplTitle || rplTopic)}</title><style>body{font-family:Arial,sans-serif;color:#111;line-height:1.55;margin:32px}header{text-align:center;border-bottom:3px double #111;padding-bottom:12px}h1{font-size:20px;margin:4px}h2{text-align:center;font-size:18px}table{width:100%;border-collapse:collapse}td{padding:7px;vertical-align:top;border:1px solid #999}.sign{display:flex;justify-content:space-between;margin-top:55px}.sign div{width:40%;text-align:center}</style></head><body><header>${schoolHeader.letterhead ? `<p>${html(schoolHeader.letterhead)}</p>` : ""}<h1>${html(schoolHeader.school_name)}</h1><p>NPSN ${html(schoolHeader.npsn)} · Tahun Ajaran ${html(academicYears.find(year => year.id === rplYearId)?.name ?? schoolHeader.academic_year)}</p></header><h2>RENCANA PELAKSANAAN LAYANAN BIMBINGAN DAN KONSELING</h2><table><tr><td>Sasaran / kelas</td><td>${html(rplGrade)}</td><td>Waktu</td><td>${html(rplDuration)}</td></tr><tr><td>Topik</td><td colspan="3">${html(rplTopic)}</td></tr><tr><td>Bidang layanan</td><td>${html(rplArea)}</td><td>Komponen</td><td>Layanan dasar</td></tr>${RPL_FIELDS.map(field => `<tr><td colspan="4"><strong>${html(field)}</strong><br>${html(rplContent[field] ?? "").replaceAll("\n", "<br>")}</td></tr>`).join("")}</table><div class="sign"><div>Mengetahui,<br>Kepala Sekolah<br><br><br><br>(................................)</div><div>Guru BK<br><br><br><br><br>(................................)</div></div><script>window.print()</script></body></html>`;
    const popup = window.open("", "_blank");
    if (!popup) {
      setError("Jendela cetak diblokir browser. Izinkan pop-up lalu coba lagi.");
      return;
    }
    popup.opener = null;
    popup.document.write(doc);
    popup.document.close();
  }

  if (!canManage && !isStudent) {
    return <section className="kb-panel"><div className="kb-privacy">Bagian ini hanya tersedia untuk siswa atau petugas Bimbingan dan Konseling yang berwenang.</div></section>;
  }

  if (tab === "Konsultasi BK" || tab === "Pengajuan Konsultasi") {
    return (
      <section className="kb-panel kb-workflow-panel">
        <PrintHeader header={schoolHeader} title="Laporan Konsultasi Bimbingan dan Konseling" />
        <div className="kb-panel-heading"><div><span className="kb-eyebrow">JADWAL LAYANAN</span><h2>{isStudent ? "Pengajuan Konsultasi" : "Konsultasi BK"}</h2></div>
          <ReportActions onExportExcel={() => exportConsultations("xlsx")} onExportCsv={() => exportConsultations("csv")} onPrint={printReport} />
        </div>
        {error && <div className="kb-alert" role="alert">{error}</div>}{notice && <div className="kb-success" role="status">{notice}</div>}
        {(isStudent || canEditStudentProfile) && <form className="kb-form" onSubmit={event => {
          event.preventDefault();
          const picked = isStudent ? student : students.find(item => item.id === consultForm.student_id);
          if (!picked) { setError("Pilih siswa yang terdaftar."); return; }
          if (!picked.counselor_profile_id) { setError("Guru BK pengasuh belum ditetapkan. Hubungi Admin."); return; }
          void runSave(async () => {
            await saveConsultation({
              student_id: picked.id,
              class_id: picked.class_id,
              requester_profile_id: currentUser.id,
              requester_name: consultForm.requester_name,
              topic: consultForm.topic,
              scheduled_date: consultForm.scheduled_date || null,
              start_time: consultForm.start_time || null,
              end_time: consultForm.end_time || null,
              counselor_profile_id: picked.counselor_profile_id,
              status: "Menunggu",
              outcome_summary: null,
              follow_up: null,
              source_curhat_thread_id: null,
            });
          }, "Pengajuan konsultasi berhasil dikirim.");
        }}>
          {!isStudent && <label><LabelCaption required>Siswa</LabelCaption><select required value={consultForm.student_id} onChange={event => setConsultForm(current => ({ ...current, student_id: event.target.value }))}><option value="">Pilih siswa...</option>{students.map(item => <option key={item.id} value={item.id}>{item.full_name} · {item.class_name}</option>)}</select></label>}
          <label><LabelCaption required>Pemohon</LabelCaption><input required value={consultForm.requester_name} onChange={event => setConsultForm(current => ({ ...current, requester_name: event.target.value }))} /></label>
          <label><LabelCaption required>Topik konsultasi</LabelCaption><input required value={consultForm.topic} onChange={event => setConsultForm(current => ({ ...current, topic: event.target.value }))} /></label>
          <label>Tanggal yang diharapkan<input type="date" value={consultForm.scheduled_date} onChange={event => setConsultForm(current => ({ ...current, scheduled_date: event.target.value }))} />{weekday(consultForm.scheduled_date)}</label>
          <label>Waktu mulai<input type="time" value={consultForm.start_time} onChange={event => setConsultForm(current => ({ ...current, start_time: event.target.value }))} /></label>
          <label>Waktu selesai<input type="time" value={consultForm.end_time} onChange={event => setConsultForm(current => ({ ...current, end_time: event.target.value }))} /></label>
          <div className="kb-actions"><button className="kb-primary" disabled={busy}>{busy ? "Mengirim..." : isStudent ? "Ajukan konsultasi" : "Catat konsultasi"}</button></div>
        </form>}
        <div className="kb-table-wrap"><table className="kb-table"><thead><tr><th>Pemohon / Siswa</th><th>Topik</th><th>Jadwal</th><th>Status</th><th>Ringkasan & Tindak lanjut</th><th>Aksi</th></tr></thead><tbody>
          {consultations.map(item => {
            const draft = consultationDrafts[item.id] ?? {
              scheduled_date: item.scheduled_date ?? "",
              start_time: item.start_time ?? "",
              end_time: item.end_time ?? "",
              outcome_summary: item.outcome_summary ?? "",
              follow_up: item.follow_up ?? "",
            };
            const updateDraft = (key: keyof typeof draft, value: string) => setConsultationDrafts(current => ({
              ...current,
              [item.id]: { ...draft, [key]: value },
            }));
            return <tr key={item.id}>
              <td>{item.requester_name}<small className="kb-student-class">{students.find(option => option.id === item.student_id)?.full_name ?? "Siswa"}</small></td>
              <td>{item.topic}</td>
              <td>{isStudent ? item.scheduled_date ? `${weekday(item.scheduled_date)}, ${item.scheduled_date}` : "Belum dijadwalkan" : <>
                <input aria-label="Tanggal konsultasi" type="date" value={draft.scheduled_date} onChange={event => updateDraft("scheduled_date", event.target.value)} />
                <small className="kb-student-class">{weekday(draft.scheduled_date)}</small>
                <input aria-label="Waktu mulai konsultasi" type="time" value={draft.start_time} onChange={event => updateDraft("start_time", event.target.value)} />
                <input aria-label="Waktu selesai konsultasi" type="time" value={draft.end_time} onChange={event => updateDraft("end_time", event.target.value)} />
                <span className="kb-print-value">{draft.scheduled_date} · {draft.start_time} - {draft.end_time}</span>
              </>}</td>
              <td>{item.status}</td>
              <td>{isStudent ? item.outcome_summary || "—" : <>
                <input aria-label="Ringkasan hasil konsultasi" placeholder="Ringkasan hasil" value={draft.outcome_summary} onChange={event => updateDraft("outcome_summary", event.target.value)} />
                <input aria-label="Tindak lanjut konsultasi" placeholder="Tindak lanjut" value={draft.follow_up} onChange={event => updateDraft("follow_up", event.target.value)} />
                <span className="kb-print-value">{draft.outcome_summary} · {draft.follow_up}</span>
              </>}</td>
              <td>{!isStudent && item.status !== "Selesai" && <details className="kb-row-actions">
                <summary>Aksi</summary>
                <div><button className="kb-mini" type="button" onClick={() => void runSave(async () => {
                  if (!draft.scheduled_date) throw new Error("Pilih tanggal konsultasi sebelum menjadwalkan.");
                  await saveConsultation({ ...item, ...draft, status: "Terjadwal" });
                }, "Jadwal konsultasi berhasil disimpan.")}>Jadwalkan</button>
                <button className="kb-mini" type="button" onClick={() => void runSave(async () => {
                  await saveConsultation({ ...item, ...draft, status: "Selesai", outcome_summary: draft.outcome_summary || item.topic });
                }, "Konsultasi selesai dan dicatat ke Agenda Harian BK.")}>Selesaikan & catat ke Agenda</button></div>
              </details>}</td>
            </tr>;
          })}
          {!consultations.length && <tr><td colSpan={6} className="kb-empty">Belum ada pengajuan konsultasi.</td></tr>}
        </tbody></table></div><Signatures />
      </section>
    );
  }

  if (tab === "Kunjungan Rumah") {
    return (
      <section className="kb-panel kb-workflow-panel">
        <PrintHeader header={schoolHeader} title="Laporan Kunjungan Rumah Peserta Didik" />
        <div className="kb-panel-heading"><div><span className="kb-eyebrow">HOME VISIT</span><h2>Kunjungan Rumah</h2></div>
          <ReportActions onExportExcel={() => downloadExcel("laporan-kunjungan-rumah.xlsx", homeVisitExportRows(visits))} onExportCsv={() => downloadCsv("laporan-kunjungan-rumah.csv", homeVisitExportRows(visits))} onPrint={printReport} />
        </div>
        {error && <div className="kb-alert" role="alert">{error}</div>}{notice && <div className="kb-success" role="status">{notice}</div>}
        <form className="kb-form" onSubmit={event => {
          event.preventDefault();
          const picked = students.find(item => item.id === visitForm.student_id);
          if (!picked) { setError("Pilih siswa dari Data Induk."); return; }
          const counselorProfileId = picked.counselor_profile_id;
          if (!counselorProfileId) { setError("Siswa belum memiliki Guru BK pengasuh. Tetapkan penugasan sebelum menyimpan."); return; }
          void runSave(async () => {
            await saveHomeVisit({
              student_id: picked.id,
              class_id: picked.class_id,
              academic_year_id: picked.academic_year_id,
              semester: null,
              visit_date: visitForm.visit_date,
              visit_time: visitForm.visit_time || null,
              address: visitForm.address,
              people_met: visitForm.people_met,
              counselor_profile_id: counselorProfileId,
              purpose: visitForm.purpose,
              observations: visitForm.observations,
              agreement_follow_up: visitForm.agreement_follow_up,
              auto_agenda: visitForm.auto_agenda,
            });
          }, "Kunjungan rumah berhasil dicatat.");
        }}>
          <label><LabelCaption required>Pilih siswa</LabelCaption><select required value={visitForm.student_id} onChange={event => setVisitForm(current => ({ ...current, student_id: event.target.value }))}><option value="">Pilih siswa...</option>{students.filter(item => role !== "guru_bk" || item.counselor_profile_id === currentUser.id).map(item => <option key={item.id} value={item.id}>{item.full_name} · {item.nisn} · {item.class_name}</option>)}</select></label>
          <label>Guru BK pelaksana<input readOnly value={students.find(item => item.id === visitForm.student_id)?.counselor_name ?? ""} placeholder="Penugasan belum tersedia" /></label>
          <label>Nomor WA orang tua<input readOnly value={students.find(item => item.id === visitForm.student_id)?.parent_phone ?? ""} placeholder="Tidak tercatat di Data Induk" /></label>
          <label><LabelCaption required>Alamat kunjungan</LabelCaption><input required value={visitForm.address} onChange={event => setVisitForm(current => ({ ...current, address: event.target.value }))} /></label>
          <label><LabelCaption required>Hari / tanggal</LabelCaption><input required type="date" value={visitForm.visit_date} onChange={event => setVisitForm(current => ({ ...current, visit_date: event.target.value }))} />{weekday(visitForm.visit_date)}</label>
          <label>Waktu kunjungan<input type="time" value={visitForm.visit_time} onChange={event => setVisitForm(current => ({ ...current, visit_time: event.target.value }))} /></label>
          <label><LabelCaption required>Pihak yang ditemui</LabelCaption><select required value={visitForm.people_met} onChange={event => setVisitForm(current => ({ ...current, people_met: event.target.value }))}><option>Ayah</option><option>Ibu</option><option>Wali</option></select></label>
          <label><LabelCaption required>Tujuan / latar belakang</LabelCaption><textarea required value={visitForm.purpose} onChange={event => setVisitForm(current => ({ ...current, purpose: event.target.value }))} /></label>
          <label>Hasil observasi & wawancara<textarea value={visitForm.observations} onChange={event => setVisitForm(current => ({ ...current, observations: event.target.value }))} /></label>
          <label>Kesepakatan & tindak lanjut<textarea value={visitForm.agreement_follow_up} onChange={event => setVisitForm(current => ({ ...current, agreement_follow_up: event.target.value }))} /></label>
          <label className="kb-checkbox-label"><input type="checkbox" checked={visitForm.auto_agenda} onChange={event => setVisitForm(current => ({ ...current, auto_agenda: event.target.checked }))} />Otomatis catat ke Agenda Harian BK</label>
          <div className="kb-actions"><button className="kb-primary" disabled={busy}>{busy ? "Menyimpan..." : "Simpan kunjungan"}</button></div>
        </form>
        <div className="kb-table-wrap"><table className="kb-table"><thead><tr><th>Siswa</th><th>Tanggal / waktu</th><th>Pihak ditemui</th><th>Tujuan</th><th>Tindak lanjut</th></tr></thead><tbody>{visits.map(item => <tr key={item.id}><td>{students.find(option => option.id === item.student_id)?.full_name ?? "Siswa"}</td><td>{item.visit_date} · {item.visit_time ?? "—"}</td><td>{item.people_met}</td><td>{item.purpose}</td><td>{item.agreement_follow_up || "—"}</td></tr>)}{!visits.length && <tr><td colSpan={5} className="kb-empty">Belum ada kunjungan rumah.</td></tr>}</tbody></table></div><Signatures />
      </section>
    );
  }

  if (tab === "Generator RPL") {
    return (
      <section className="kb-panel kb-workflow-panel">
        <PrintHeader header={schoolHeader} title="Rencana Pelaksanaan Layanan Bimbingan dan Konseling" />
        <div className="kb-panel-heading"><div><span className="kb-eyebrow">PERENCANAAN LAYANAN</span><h2>Generator RPL</h2></div><div className="kb-export-actions"><button className="kb-secondary" type="button" onClick={printRpl}>Cetak / Simpan PDF</button></div></div>
        {error && <div className="kb-alert" role="alert">{error}</div>}{notice && <div className="kb-success" role="status">{notice}</div>}
        <form className="kb-form" onSubmit={event => {
          event.preventDefault();
          void runSave(async () => {
            const result = await saveRpl({
              id: rplId || undefined,
              title: rplTitle || rplTopic,
              academic_year_id: rplYearId || null,
              target_class: rplGrade,
              service_area: rplArea,
              content: { ...rplContent, durasi: rplDuration, topik: rplTopic },
            });
            setRplId(result.id);
          }, "RPL berhasil disimpan.");
        }}>
          <label>Preset topik<select value={RPL_PRESETS.includes(rplTopic as (typeof RPL_PRESETS)[number]) ? rplTopic : "Topik kustom"} onChange={event => {
            const topic = event.target.value === "Topik kustom" ? "" : event.target.value;
            setRplTopic(topic); setRplTitle(topic);
          }}><option value="">Pilih preset...</option>{RPL_PRESETS.map(topic => <option key={topic}>{topic}</option>)}</select></label>
          <label><LabelCaption required>Topik layanan</LabelCaption><input required value={rplTopic} onChange={event => { setRplTopic(event.target.value); setRplTitle(event.target.value); }} /></label>
          <label><LabelCaption required>Kelas / fase sasaran</LabelCaption><select required value={rplGrade} onChange={event => setRplGrade(event.target.value)}><option value="">Pilih kelas...</option>{classes.map(item => <option key={item.id} value={item.name}>{item.name}</option>)}<option value="Semua kelas">Semua kelas</option></select></label>
          <label><LabelCaption required>Bidang layanan</LabelCaption><select required value={rplArea} onChange={event => setRplArea(event.target.value)}>{AREA_OPTIONS.map(area => <option key={area}>{area}</option>)}</select></label>
          <label>Waktu / durasi<input value={rplDuration} onChange={event => setRplDuration(event.target.value)} /></label>
          <label>Tahun ajaran<select value={rplYearId} onChange={event => setRplYearId(event.target.value)}>{academicYears.map(year => <option key={year.id} value={year.id}>{year.name}{year.is_active ? " · Aktif" : ""}</option>)}</select></label>
          <div className="kb-ai-assistant">
            <p>Gemini hanya menerima topik, bidang, kelas, dan durasi. Jangan masukkan identitas atau kasus pribadi siswa.</p>
            <button className="kb-secondary" type="button" disabled={aiBusy} aria-busy={aiBusy} onClick={() => void generateRplDraft()}>
              {aiBusy ? "Menyusun draf..." : "Bantu susun draf dengan Gemini"}
            </button>
          </div>
          {RPL_FIELDS.map(field => <label key={field}>{field}<textarea rows={3} value={rplContent[field] ?? ""} onChange={event => setRplContent(current => ({ ...current, [field]: event.target.value }))} /></label>)}
          <div className="kb-actions"><button className="kb-primary" disabled={busy || aiBusy}>{busy ? "Menyimpan..." : "Simpan RPL"}</button><button className="kb-secondary" type="button" onClick={() => { setRplId(""); setRplTitle(""); setRplTopic(""); setRplContent({}); }}>RPL baru</button></div>
        </form>
        <div className="kb-workflow-list">{rpls.map(row => <article key={row.id}><div><strong>{row.title}</strong><small>{row.target_class} · {row.service_area} · {academicYears.find(year => year.id === row.academic_year_id)?.name ?? "Tahun ajaran"}</small></div><button className="kb-mini" type="button" onClick={() => openRpl(row)}>Buka / edit</button></article>)}{!rpls.length && <div className="kb-empty">Belum ada RPL tersimpan.</div>}</div><Signatures />
      </section>
    );
  }

  if (tab === "Angket Kebutuhan Siswa") {
    const questions = selectedAkpd?.questions ?? [];
    const formResponses = responses.filter(response => response.form_id === selectedAkpd?.id);
    const topNeed = questions.map(question => ({
      ...question,
      count: formResponses.filter(response => /butuh|sangat|ya/i.test(response.answers[question.id] ?? "")).length,
    })).sort((a, b) => b.count - a.count);
    const akpdExportRows = topNeed.map(item => ({
      Bidang: item.area,
      Pertanyaan: item.text,
      "Jumlah kebutuhan": item.count,
      "Jumlah responden": formResponses.length,
      Persentase: formResponses.length ? `${Math.round(item.count / formResponses.length * 100)}%` : "0%",
    }));
      const areaSummary = AREA_OPTIONS.map(area => {
        const areaQuestions = topNeed.filter(question => question.area === area);
        const needs = areaQuestions.reduce((sum, question) => sum + question.count, 0);
        const possible = areaQuestions.length * formResponses.length;
        return { area, needs, percent: possible ? Math.round(needs / possible * 100) : 0 };
      });
      const cohortCounts = new Map<string, { responses: number; needs: number }>();
      for (const response of formResponses) {
        const respondent = students.find(item => item.id === response.student_id);
        if (!respondent) continue;
        const needCount = Object.values(response.answers).filter(answer => /butuh|sangat|ya/i.test(answer)).length;
        const cohortNames = [
          respondent.class_name ? `Kelas ${respondent.class_name}` : "",
          respondent.grade_level ? `Angkatan ${respondent.grade_level}` : "",
        ].filter(Boolean);
        for (const cohortName of cohortNames) {
          const aggregate = cohortCounts.get(cohortName) ?? { responses: 0, needs: 0 };
          aggregate.responses += 1;
          aggregate.needs += needCount;
          cohortCounts.set(cohortName, aggregate);
        }
      }
    return (
      <section className="kb-panel kb-workflow-panel">
        <PrintHeader header={schoolHeader} title="Rekap Angket Kebutuhan Peserta Didik" />
        <div className="kb-panel-heading"><div><span className="kb-eyebrow">ASESMEN KEBUTUHAN</span><h2>Angket Kebutuhan Siswa</h2></div>
          {!isStudent && <ReportActions
            onExportExcel={() => downloadExcel("rekap-akpd.xlsx", akpdExportRows)}
            onExportCsv={() => downloadCsv("rekap-akpd.csv", akpdExportRows)}
            onPrint={printReport}
          />}
        </div>
        {error && <div className="kb-alert" role="alert">{error}</div>}{notice && <div className="kb-success" role="status">{notice}</div>}
        {isStudent ? (
          selectedAkpd ? <form className="kb-akpd-student" onSubmit={event => {
            event.preventDefault();
            if (!student) { setError("Identitas siswa belum terhubung. Hubungi administrator."); return; }
            void runSave(async () => {
              const answers = Object.fromEntries(questions.map(question => [
                question.id,
                answerDraft[question.id] ?? studentResponse?.answers[question.id] ?? "",
              ]));
              if (Object.values(answers).some(answer => !answer)) {
                throw new Error("Lengkapi semua jawaban angket sebelum mengirim.");
              }
              await saveAkpdResponse({ form_id: selectedAkpd.id, student_id: student.id, answers });
            }, "Jawaban angket tersimpan.");
          }}>
            <label>Angket aktif<select value={selectedAkpd.id} onChange={event => setSelectedForm(event.target.value)}>{forms.map(form => <option key={form.id} value={form.id}>{form.title}</option>)}</select></label>
            <p>{selectedAkpd.title} · Tahun ajaran {academicYears.find(year => year.id === selectedAkpd.academic_year_id)?.name ?? "aktif"}</p>
            {studentResponse && <div className="kb-privacy">Jawaban Anda sudah tersimpan. Anda dapat memperbaruinya selama periode angket masih dibuka.</div>}
            {questions.map(question => <label key={question.id}><LabelCaption required>{question.area} · {question.text}</LabelCaption><select value={answerDraft[question.id] ?? studentResponse?.answers[question.id] ?? ""} onChange={event => setAnswerDraft(current => ({ ...current, [question.id]: event.target.value }))} required><option value="">Pilih jawaban...</option><option>Sangat membutuhkan bantuan</option><option>Membutuhkan bantuan</option><option>Tidak membutuhkan bantuan</option></select></label>)}
            <button className="kb-primary" disabled={busy}>{busy ? "Menyimpan..." : "Kirim / perbarui jawaban"}</button>
          </form> : <div className="kb-empty">Belum ada angket aktif yang ditujukan untuk kelas Anda.</div>
        ) : <>
          <form className="kb-form" onSubmit={event => {
            event.preventDefault();
            const questionList = questionDraft.split("\n").map(line => line.split("|").map(value => value.trim()))
              .filter(parts => parts.length > 1 && parts[1])
              .map((parts, index) => ({ id: `q${index + 1}`, area: parts[0] || "Pribadi", text: parts[1] }));
            void runSave(async () => {
              await saveAkpdForm({ id: akpdId || undefined, title: formTitle, academic_year_id: akpdYearId || activeYear, target_grade: targetGrade, questions: questionList.length ? questionList : AKPD_DEFAULT_QUESTIONS.map((item, index) => ({ ...item, id: `q${index + 1}` })), is_active: formActive });
            }, akpdId ? "Angket berhasil diperbarui." : "Angket berhasil disimpan.");
          }}>
            <label><LabelCaption required>Nama angket</LabelCaption><input required value={formTitle} onChange={event => setFormTitle(event.target.value)} /></label>
            <label><LabelCaption required>Tahun ajaran</LabelCaption><select required value={akpdYearId || activeYear} onChange={event => setAkpdYearId(event.target.value)}><option value="">Pilih tahun ajaran...</option>{academicYears.map(year => <option key={year.id} value={year.id}>{year.name}{year.is_active ? " · Aktif" : ""}</option>)}</select></label>
            <label><LabelCaption required>Tingkat sasaran</LabelCaption><select required value={targetGrade} onChange={event => setTargetGrade(event.target.value)}><option>Semua</option><option>10</option><option>11</option><option>12</option></select></label>
            <label className="kb-checkbox-label"><input type="checkbox" checked={formActive} onChange={event => setFormActive(event.target.checked)} />Angket aktif</label>
            <label><LabelCaption required>Pertanyaan (satu per baris: Bidang | Pertanyaan)</LabelCaption><textarea required rows={8} value={questionDraft || AKPD_DEFAULT_QUESTIONS.map(item => `${item.area} | ${item.text}`).join("\n")} onChange={event => setQuestionDraft(event.target.value)} /></label>
            <div className="kb-ai-assistant">
              <p>Gemini hanya menerima tingkat kelas sasaran, bukan jawaban angket atau identitas siswa.</p>
              <button className="kb-secondary" type="button" disabled={aiBusy} aria-busy={aiBusy} onClick={() => void generateAkpdDraft()}>
                {aiBusy ? "Menyusun draf..." : "Bantu susun pertanyaan dengan Gemini"}
              </button>
            </div>
            <div className="kb-actions"><button className="kb-primary" disabled={busy || aiBusy}>{akpdId ? "Simpan perubahan angket" : "Buat angket"}</button><button type="button" className="kb-secondary" onClick={() => { setAkpdId(""); setFormTitle("Angket Kebutuhan Peserta Didik"); setAkpdYearId(activeYear); setTargetGrade("Semua"); setFormActive(true); setQuestionDraft(""); }}>Angket baru</button></div>
          </form>
          <div className="kb-form">
            <label>Pilih angket untuk rekap<select value={selectedAkpd?.id ?? ""} onChange={event => setSelectedForm(event.target.value)}>{forms.map(form => <option key={form.id} value={form.id}>{form.title} · {form.target_grade}</option>)}</select></label>
            <div className="kb-workflow-list">{areaSummary.map(item => <article key={item.area}><div><strong>{item.area}</strong><small>{item.needs} kebutuhan · {item.percent}% indeks kebutuhan</small></div></article>)}</div>
            <div className="kb-table-wrap"><table className="kb-table"><thead><tr><th>Kelompok</th><th>Jumlah responden</th><th>Jawaban kebutuhan</th></tr></thead><tbody>{[...cohortCounts.entries()].map(([name, value]) => <tr key={name}><td>{name}</td><td>{value.responses}</td><td>{value.needs}</td></tr>)}{cohortCounts.size === 0 && <tr><td colSpan={3} className="kb-empty">Rekap kelompok akan tampil setelah siswa mengisi angket.</td></tr>}</tbody></table></div>
            {topNeed[0] && <div className="kb-actions"><button className="kb-primary" type="button" onClick={() => onCreateRplFromTopic(topNeed[0].text)}>Buat RPL dari topik teratas</button></div>}
            <div className="kb-workflow-list">{topNeed.map((item, index) => <article key={item.id}><div><strong>{index + 1}. {item.text}</strong><small>{item.area} · {item.count} dari {formResponses.length} siswa</small></div></article>)}</div>
          </div>
          <div className="kb-table-wrap"><table className="kb-table"><thead><tr><th>Tingkat</th><th>Angket</th><th>Status</th><th>Responden</th><th>Aksi</th></tr></thead><tbody>{forms.map(form => <tr key={form.id}><td>{form.target_grade}</td><td>{form.title}</td><td>{form.is_active ? "Aktif" : "Ditutup"}</td><td>{responses.filter(response => response.form_id === form.id).length}</td><td><button className="kb-mini" type="button" onClick={() => {
            setAkpdId(form.id); setFormTitle(form.title); setAkpdYearId(form.academic_year_id); setTargetGrade(form.target_grade); setFormActive(form.is_active); setSelectedForm(form.id);
            setQuestionDraft(form.questions.map(question => `${question.area} | ${question.text}`).join("\n"));
          }}>Edit</button></td></tr>)}</tbody></table></div>
        </>}
        <Signatures />
      </section>
    );
  }

  if (tab === "Daftar Siswa Asuh") {
    return (
      <section className="kb-panel kb-workflow-panel">
        <PrintHeader header={schoolHeader} title="Biodata Bimbingan dan Konseling Peserta Didik" />
        <div className="kb-panel-heading"><div><span className="kb-eyebrow">DATA INDUK TERHUBUNG</span><h2>Daftar Siswa Asuh</h2></div>
          <div className="kb-student-filters">
            <input className="kb-search" aria-label="Cari nama, NISN atau kelas" placeholder="Cari nama, NISN, kelas..." value={search} onChange={event => setSearch(event.target.value)} />
            {role !== "guru_bk" && <select aria-label="Filter kelas" value={classFilter} onChange={event => setClassFilter(event.target.value)}><option value="">Semua kelas</option>{classes.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select>}
            {role !== "guru_bk" && <select aria-label="Filter Guru BK" value={counselorFilter} onChange={event => setCounselorFilter(event.target.value)}><option value="">Semua Guru BK</option>{counselorOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select>}
          </div>
        </div>
        {error && <div className="kb-alert" role="alert">{error}</div>}
        <div className="kb-workflow-student-layout"><div className="kb-workflow-list">{visibleStudents.map(item => <button key={item.id} type="button" className={`kb-workflow-student${selectedStudent?.id === item.id ? " active" : ""}`} onClick={() => setSelectedStudent(item)}><strong>{item.full_name}</strong><span>NISN {item.nisn} · {item.class_name || "Belum ada kelas"}</span><small>{item.status} · {serviceCounts.get(item.id) ?? 0} layanan BK · Guru BK: {item.counselor_name ?? "Belum ditugaskan"}</small></button>)}{!visibleStudents.length && <div className="kb-empty">Siswa tidak ditemukan.</div>}</div>
          {selectedStudent && (profileDraft || !canEditStudentProfile) ? <div className="kb-workflow-profile">
            <div className="kb-panel-heading"><div><span className="kb-eyebrow">KARTU BIODATA BK</span><h3>{selectedStudent.full_name}</h3></div><button className="kb-secondary" type="button" onClick={printReport}>Unduh / Cetak Biodata</button></div>
            <div className="kb-profile-identity"><p><strong>NISN</strong><span>{selectedStudent.nisn}</span></p><p><strong>Kelas / Tingkat</strong><span>{selectedStudent.class_name} / {selectedStudent.grade_level ?? "—"}</span></p><p><strong>Status</strong><span>{selectedStudent.status}</span></p><p><strong>Tanggal lahir</strong><span>{selectedStudent.birth_date ?? "—"}</span></p><p><strong>Jenis kelamin</strong><span>{selectedStudent.gender ?? "—"}</span></p><p><strong>WhatsApp orang tua</strong><span>{selectedStudent.parent_phone ?? "—"}</span></p><p><strong>Guru BK</strong><span>{selectedStudent.counselor_name ?? "Belum ditugaskan"}</span></p></div>
            <div className="kb-profile-summary"><span>{serviceCounts.get(selectedStudent.id) ?? 0} layanan BK</span></div>
            {profileDraft && <dl className="kb-profile-print-data">
              <div><dt>Alamat rumah</dt><dd>{profileDraft.home_address || "—"}</dd></div>
              <div><dt>Orang tua / wali</dt><dd>{profileDraft.guardian_name || "—"}</dd></div>
              <div><dt>Pekerjaan orang tua</dt><dd>{profileDraft.guardian_occupation || "—"}</dd></div>
              <div><dt>Hobi & bakat</dt><dd>{profileDraft.talents || "—"}</dd></div>
              <div><dt>Cita-cita / rencana karir</dt><dd>{profileDraft.career_plan || "—"}</dd></div>
              <div><dt>Kesehatan / catatan khusus</dt><dd>{profileDraft.health_notes || "—"}</dd></div>
            </dl>}
            {profileDraft && <form className="kb-form" onSubmit={event => {
              event.preventDefault();
              if (!selectedStudent) return;
              void runSave(() => saveStudentCounselingProfile(profileDraft), "Biodata tambahan BK berhasil disimpan.");
            }}>
              {([
                ["home_address", "Alamat rumah"],
                ["guardian_name", "Nama orang tua / wali"],
                ["guardian_occupation", "Pekerjaan orang tua"],
                ["talents", "Hobi & bakat"],
                ["career_plan", "Cita-cita / rencana karir"],
                ["health_notes", "Kesehatan / catatan khusus"],
              ] as const).map(([field, label]) => <label key={field}>{label}<textarea value={profileDraft[field]} onChange={event => setProfileDraft(current => current ? { ...current, [field]: event.target.value } : current)} /></label>)}
              <div className="kb-actions"><button className="kb-primary" disabled={busy}>Simpan biodata BK</button></div>
            </form>}
            {canEditStudentProfile && studentProfile && <p className="kb-profile-empty">Biodata khusus BK tersimpan. Ringkasan riwayat layanan tersedia pada Agenda Harian, konsultasi, kunjungan rumah, prestasi, dan peringatan absensi sesuai hak akses.</p>}
          </div> : <div className="kb-empty">Pilih siswa untuk membuka kartu biodata lengkap.</div>}
        </div>
      </section>
    );
  }

  if (tab === "Kotak Masuk Curhat" || tab === "Curhat ke Guru BK") {
    const assignedCounselor = student?.counselor_name;
    return (
      <section className="kb-panel kb-workflow-panel">
        <div className="kb-panel-heading"><div><span className="kb-eyebrow">RUANG AMAN DAN PRIVAT</span><h2>{isStudent ? "Curhat ke Guru BK" : "Kotak Masuk Curhat"}</h2></div><span className="kb-pill">{threads.filter(thread => isStudent ? thread.unread_by_student : thread.unread_by_counselor).length} belum dibaca</span></div>
        {error && <div className="kb-alert" role="alert">{error}</div>}{notice && <div className="kb-success" role="status">{notice}</div>}
        {isStudent && <form className="kb-form" onSubmit={event => {
          event.preventDefault();
          const counselorProfileId = student?.counselor_profile_id;
          if (!student || !counselorProfileId) { setError("Guru BK pengasuh belum ditetapkan. Silakan hubungi Admin atau Guru BK."); return; }
          const form = event.currentTarget;
          const data = new FormData(form);
          void runSave(async () => {
            await createCurhatThread({
              student_id: student.id,
              counselor_profile_id: counselorProfileId,
              subject: String(data.get("subject") ?? ""),
              category: String(data.get("category") ?? ""),
              urgency: String(data.get("urgency") ?? ""),
              body: String(data.get("body") ?? ""),
              request_consultation: data.get("consult") === "on",
            });
            form.reset();
          }, data.get("consult") === "on"
            ? "Curhat terkirim secara privat dan permintaan konsultasi diteruskan ke Guru BK."
            : "Curhat Anda sudah terkirim secara privat.");
        }}>
          <p>Guru BK tujuan: <strong>{assignedCounselor || "Belum ditetapkan"}</strong></p>
          <label><LabelCaption required>Subjek</LabelCaption><input name="subject" required maxLength={150} /></label>
          <label><LabelCaption required>Kategori</LabelCaption><select name="category" required><option>Pribadi</option><option>Pertemanan/Bullying</option><option>Belajar</option><option>Keluarga</option><option>Lainnya</option></select></label>
          <label><LabelCaption required>Tingkat urgensi</LabelCaption><select name="urgency" required><option>Normal</option><option>Perlu segera</option><option>Darurat</option></select></label>
          <label><LabelCaption required>Isi curhat</LabelCaption><textarea name="body" required rows={5} maxLength={10000} /></label>
          <label className="kb-checkbox-label"><input type="checkbox" name="consult" />Ajukan jadwal konsultasi tatap muka</label>
          <div className="kb-actions"><button className="kb-primary" disabled={busy || !student?.counselor_profile_id}>{busy ? "Mengirim..." : "Kirim curhat privat"}</button></div>
        </form>}
        <div className="kb-curhat-layout"><div className="kb-workflow-list">{threads.map(thread => <button key={thread.id} className={`kb-workflow-student${selectedThread?.id === thread.id ? " active" : ""}`} type="button" onClick={() => setSelectedThread(thread)}><strong>{thread.subject}</strong><span>{thread.category} · Urgensi {thread.urgency}</span><small>{thread.status}{thread.unread_by_counselor && !isStudent ? " · Belum dibaca" : ""}</small></button>)}{!threads.length && <div className="kb-empty">Belum ada percakapan.</div>}</div>
          {selectedThread && <div className="kb-chat-panel"><h3>{selectedThread.subject}</h3><div className="kb-chat-messages">{messages.map(message => <article className={message.author_profile_id === currentUser.id ? "mine" : ""} key={message.id}>{message.message}<small>{new Date(message.created_at).toLocaleString("id-ID")}</small></article>)}</div>
            {!isStudent && <label>Status percakapan<select value={selectedThread.status} onChange={event => void runSave(async () => {
              const status = event.target.value as CurhatThreadRow["status"];
              await updateCurhatStatus(selectedThread.id, status);
              setSelectedThread(current => current ? { ...current, status } : current);
            }, "Status curhat diperbarui.")}><option>Baru</option><option>Dibaca</option><option>Ditindaklanjuti</option><option>Selesai</option></select></label>}
            <form onSubmit={event => {
              event.preventDefault();
              if (!messageDraft.trim()) return;
              void runSave(async () => {
                await sendCurhatMessage(selectedThread.id, messageDraft.trim());
                setMessages(await listCurhatMessages(selectedThread.id));
                setMessageDraft("");
              }, "Balasan terkirim.");
            }}><label><LabelCaption required>Balas secara privat</LabelCaption><textarea value={messageDraft} onChange={event => setMessageDraft(event.target.value)} required rows={3} /></label><button className="kb-primary" disabled={busy}>Kirim balasan</button></form>
            {!isStudent && <button className="kb-secondary" type="button" onClick={() => {
              setConsultForm(current => ({ ...current, student_id: selectedThread.student_id, requester_name: students.find(item => item.id === selectedThread.student_id)?.full_name ?? "Siswa", topic: `Konsultasi: ${selectedThread.subject}` }));
              void runSave(async () => {
                await saveConsultation({
                  student_id: selectedThread.student_id,
                  class_id: students.find(item => item.id === selectedThread.student_id)?.class_id ?? null,
                  requester_profile_id: currentUser.id,
                  requester_name: students.find(item => item.id === selectedThread.student_id)?.full_name ?? "Siswa",
                  topic: `Konsultasi: ${selectedThread.subject}`,
                  scheduled_date: null,
                  start_time: null,
                  end_time: null,
                  counselor_profile_id: selectedThread.counselor_profile_id,
                  status: "Menunggu",
                  outcome_summary: null,
                  follow_up: null,
                  source_curhat_thread_id: selectedThread.id,
                });
              }, "Konsultasi dibuat dari curhat.");
            }}>Buat pengajuan konsultasi</button>}
          </div>}
        </div>
      </section>
    );
  }

  return <section className="kb-panel"><div className="kb-empty">Pilih bagian layanan BK.</div></section>;
}
