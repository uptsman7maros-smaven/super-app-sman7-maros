import { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import type { ReactNode } from "react";
import { SchoolLetterheadPicker, SchoolLetterheadPreview } from "../../../components/shared/SchoolLetterheadPicker";
import { getSchoolLetterhead, type LetterheadSlot } from "../../../services/masterDataService";
import type { SchoolUser } from "../../../context/school-context";
import ReportActions from "./ReportActions";
import {
  createCurhatThread,
  generateRpl,
  generateBkAkpdQuestions,
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
  RplEditorContent,
  RplGeneratedDraft,
  SchoolHeader,
  StudentCounselingProfile,
  StudentOption,
  AcademicYearOption,
  UserRole,
} from "../types";
import type { RplPdfData } from "../utils/rplPdfGenerator";

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
  onStudentServiceChange?: () => void;
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
  { key: "tujuan_umum", label: "Tujuan umum" },
  { key: "tujuan_khusus", label: "Tujuan khusus (satu tujuan per baris)" },
  { key: "metode_teknik", label: "Metode dan teknik" },
  { key: "media_alat", label: "Media / alat" },
  { key: "materi_pokok", label: "Materi pokok" },
  { key: "tahap_awal", label: "Tahap awal / pendahuluan (satu langkah per baris)" },
  { key: "tahap_inti", label: "Tahap inti (satu langkah per baris)" },
  { key: "tahap_penutup", label: "Tahap penutup (satu langkah per baris)" },
  { key: "evaluasi_proses", label: "Evaluasi proses" },
  { key: "evaluasi_hasil", label: "Evaluasi hasil" },
] as const;
const RPL_COMPONENTS = ["Layanan Dasar", "Layanan Responsif", "Perencanaan Individual", "Dukungan Sistem"] as const;
const RPL_SERVICE_TYPES = ["Bimbingan Klasikal", "Bimbingan Kelompok", "Konseling Kelompok", "Layanan Informasi"] as const;
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

const EMPTY_RPL_CONTENT: RplEditorContent = {
  judul_topik: "",
  tujuan_umum: "",
  tujuan_khusus: "",
  metode_teknik: "",
  media_alat: "",
  materi_pokok: "",
  tahap_awal: "",
  tahap_inti: "",
  tahap_penutup: "",
  evaluasi_proses: "",
  evaluasi_hasil: "",
};

function stageToEditor(steps: RplGeneratedDraft["tahap_awal"]) {
  return steps.map(step => `${step.kegiatan} (${step.estimasi_menit} menit)`).join("\n");
}

function toRplEditorContent(draft: RplGeneratedDraft): RplEditorContent {
  return {
    judul_topik: draft.judul_topik,
    tujuan_umum: draft.tujuan_umum,
    tujuan_khusus: draft.tujuan_khusus.map((goal, index) => `${index + 1}. ${goal}`).join("\n"),
    metode_teknik: draft.metode_teknik,
    media_alat: draft.media_alat,
    materi_pokok: draft.materi_pokok,
    tahap_awal: stageToEditor(draft.tahap_awal),
    tahap_inti: stageToEditor(draft.tahap_inti),
    tahap_penutup: stageToEditor(draft.tahap_penutup),
    evaluasi_proses: draft.evaluasi_proses,
    evaluasi_hasil: draft.evaluasi_hasil,
  };
}

function storedRplContent(content: Record<string, string>, title: string): RplEditorContent {
  return {
    judul_topik: content.judul_topik || content.topik || title,
    tujuan_umum: content.tujuan_umum || content["Tujuan umum"] || "",
    tujuan_khusus: content.tujuan_khusus || content["Tujuan khusus"] || "",
    metode_teknik: content.metode_teknik || content["Metode dan teknik"] || "",
    media_alat: content.media_alat || content["Media / alat"] || "",
    materi_pokok: content.materi_pokok || "",
    tahap_awal: content.tahap_awal || content["Tahap awal / pendahuluan"] || "",
    tahap_inti: content.tahap_inti || content["Tahap inti"] || "",
    tahap_penutup: content.tahap_penutup || content["Tahap penutup"] || "",
    evaluasi_proses: content.evaluasi_proses || content["Evaluasi proses"] || "",
    evaluasi_hasil: content.evaluasi_hasil || content["Evaluasi hasil"] || "",
  };
}

function templateRpl(topic: string): RplEditorContent {
  return {
    judul_topik: topic,
    tujuan_umum: "Peserta didik memahami topik layanan dan mampu menerapkan strategi yang sehat dalam keseharian.",
    tujuan_khusus: "1. Mengidentifikasi pengetahuan awal dan kebutuhan terkait topik.\n2. Menjelaskan konsep dan strategi yang relevan.\n3. Mempraktikkan strategi melalui kegiatan reflektif atau kolaboratif.\n4. Menyusun satu langkah penerapan dan mengetahui sumber bantuan yang aman.",
    metode_teknik: "Bimbingan partisipatif, diskusi kelompok, studi situasi hipotetis, dan refleksi individu.",
    media_alat: "Slide atau kartu situasi, papan tulis, lembar refleksi, dan alat tulis.",
    materi_pokok: "Pengertian dan dampak topik; cara merespons secara aman; keterampilan mencari bantuan dari orang dewasa tepercaya dan layanan sekolah.",
    tahap_awal: "Menyapa, membangun suasana aman, menyampaikan tujuan dan kesepakatan diskusi (10 menit)\nMenggali pemahaman awal dengan pertanyaan pemantik (5 menit)",
    tahap_inti: "Menyampaikan materi inti secara ringkas dan kontekstual (10 menit)\nMenganalisis situasi hipotetis secara berkelompok (12 menit)\nBerbagi strategi dan menyusun langkah penerapan pribadi (5 menit)",
    tahap_penutup: "Menyimpulkan pembelajaran, refleksi singkat, dan menyampaikan jalur bantuan (3 menit)",
    evaluasi_proses: "Observasi keterlibatan, partisipasi, sikap saling menghargai, dan ketercapaian waktu setiap tahap.",
    evaluasi_hasil: "Exit ticket atau refleksi singkat tentang pemahaman, strategi yang dipilih, dan komitmen penerapan.",
  };
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
      <SchoolLetterheadPreview letterhead={header} />
      <h2>{title}</h2>
    </header>
  );
}

function LabelCaption({ children, required = false }: { children: ReactNode; required?: boolean }) {
  return <span className="kb-label-caption">{children}{required && <b className="kb-required-mark" aria-hidden="true">*</b>}</span>;
}

function Signatures() {
  return (
    <div className="kb-signatures document-signature-block">
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
  onStudentServiceChange,
  onCreateRplFromTopic,
}: Props) {
  const isStudent = role === "siswa";
  const canManage = ["guru_bk", "super_admin", "operator"].includes(role);
  const canEditStudentProfile = role === "guru_bk" || role === "super_admin";
  const [letterheadSlot, setLetterheadSlot] = useState<LetterheadSlot>("1");
  const outputHeader = useMemo(() => ({
    ...schoolHeader,
    ...getSchoolLetterhead(schoolHeader, letterheadSlot),
  }), [letterheadSlot, schoolHeader]);
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
  const [rplComponent, setRplComponent] = useState<(typeof RPL_COMPONENTS)[number]>("Layanan Dasar");
  const [rplServiceType, setRplServiceType] = useState<(typeof RPL_SERVICE_TYPES)[number]>("Bimbingan Klasikal");
  const [rplDuration, setRplDuration] = useState("2 x 45 menit");
  const [rplYearId, setRplYearId] = useState(activeYear);
  const [rplSemester, setRplSemester] = useState("1");
  const [rplPrincipalName, setRplPrincipalName] = useState("");
  const [rplNeedsNotes, setRplNeedsNotes] = useState("");
  const [rplContent, setRplContent] = useState<RplEditorContent>(EMPTY_RPL_CONTENT);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState("");
  const [pdfPreviewLoading, setPdfPreviewLoading] = useState(false);
  const [pdfPreviewError, setPdfPreviewError] = useState("");
  const pdfPreviewUrlRef = useRef("");
  const pdfRequestId = useRef(0);
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

  useEffect(() => () => {
    pdfRequestId.current += 1;
    if (pdfPreviewUrlRef.current) URL.revokeObjectURL(pdfPreviewUrlRef.current);
  }, []);

  async function reloadTab() {
    setError("");
    if (isStudent && !student) {
      setError("Profil siswa belum terhubung ke Data Induk. Hubungi administrator sekolah.");
      return;
    }
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
          listAkpdResponses(undefined, isStudent ? student?.id : undefined),
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
      if (isStudent) onStudentServiceChange?.();
      setNotice(success);
      await reloadTab();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Perubahan gagal disimpan.");
    } finally {
      setBusy(false);
    }
  }

  function getRplPdfData(content = rplContent, topic = rplTopic, overrides: Partial<RplPdfData> = {}): RplPdfData {
    return {
      ...content,
      judul_topik: topic,
      komponen_layanan: overrides.komponen_layanan ?? rplComponent,
      bidang_layanan: overrides.bidang_layanan ?? rplArea,
      jenis_layanan: overrides.jenis_layanan ?? rplServiceType,
      sasaran_kelas: overrides.sasaran_kelas ?? rplGrade,
      durasi: overrides.durasi ?? rplDuration,
      fungsi_layanan: overrides.fungsi_layanan ?? "Pemahaman, pencegahan, dan pengembangan",
      semester: overrides.semester ?? rplSemester,
    };
  }

  function getRplPdfSettings(yearId = rplYearId) {
    return {
      ...outputHeader,
      academicYear: academicYears.find(year => year.id === yearId)?.name ?? schoolHeader.academic_year,
      counselorName: currentUser.full_name || currentUser.username,
      principalName: rplPrincipalName,
    };
  }

  async function renderRplPdfPreview(
    content = rplContent,
    topic = rplTopic,
    overrides: Partial<RplPdfData> = {},
    yearId = rplYearId,
  ) {
    const requestId = ++pdfRequestId.current;
    setPdfPreviewLoading(true);
    setPdfPreviewError("");
    try {
      const { generateRplPdfBlobUrl } = await import("../utils/rplPdfGenerator");
      const result = await generateRplPdfBlobUrl(getRplPdfData(content, topic, overrides), getRplPdfSettings(yearId));
      if (requestId !== pdfRequestId.current) {
        URL.revokeObjectURL(result.url);
        return;
      }
      if (pdfPreviewUrlRef.current) URL.revokeObjectURL(pdfPreviewUrlRef.current);
      pdfPreviewUrlRef.current = result.url;
      setPdfPreviewUrl(result.url);
    } catch (previewError) {
      if (requestId === pdfRequestId.current) {
        setPdfPreviewError(previewError instanceof Error ? previewError.message : "PDF gagal dibuat.");
      }
    } finally {
      if (requestId === pdfRequestId.current) setPdfPreviewLoading(false);
    }
  }

  async function downloadCurrentRplPdf() {
    try {
      const { downloadRplPdf } = await import("../utils/rplPdfGenerator");
      await downloadRplPdf(getRplPdfData(), getRplPdfSettings());
    } catch (downloadError) {
      setPdfPreviewError(downloadError instanceof Error ? downloadError.message : "PDF gagal diunduh.");
    }
  }

  function applyRplDraft(draft: RplEditorContent, topic: string, noticeText: string) {
    setRplTitle(topic);
    setRplTopic(topic);
    setRplContent(draft);
    setNotice(noticeText);
    void renderRplPdfPreview(draft, topic);
  }

  async function generateRplDraft() {
    if (!rplTopic.trim() || !rplArea || !rplComponent || !rplServiceType || !rplGrade.trim() || !rplDuration.trim()) {
      setError("Lengkapi topik, bidang, komponen, jenis layanan, kelas sasaran, dan alokasi waktu. Catatan kebutuhan bersifat opsional.");
      return;
    }
    setAiBusy(true);
    setError("");
    setNotice("");
    try {
      const draft = await generateRpl({
        topic: rplTopic.trim(),
        bidang_layanan: rplArea,
        komponen_layanan: rplComponent,
        jenis_layanan: rplServiceType,
        sasaran_kelas: rplGrade,
        durasi: rplDuration,
        catatan_kebutuhan: rplNeedsNotes,
      });
      applyRplDraft(toRplEditorContent(draft), draft.judul_topik, "Draf RPL Gemini siap ditinjau. Pratinjau PDF juga sudah diperbarui.");
    } catch (draftError) {
      const message = draftError instanceof Error ? draftError.message : "Draf RPL gagal dibuat.";
      setError(message);
      if (/template RPL bawaan/i.test(message)) setNotice("Generator AI belum tersedia. Anda tetap dapat memakai template RPL bawaan.");
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
    setRplTopic(row.content.judul_topik || row.content.topik || row.title);
    setRplGrade(row.target_class);
    setRplArea(row.service_area);
    setRplComponent((RPL_COMPONENTS.includes(row.content.komponen_layanan as (typeof RPL_COMPONENTS)[number])
      ? row.content.komponen_layanan : "Layanan Dasar") as (typeof RPL_COMPONENTS)[number]);
    setRplServiceType((RPL_SERVICE_TYPES.includes(row.content.jenis_layanan as (typeof RPL_SERVICE_TYPES)[number])
      ? row.content.jenis_layanan : "Bimbingan Klasikal") as (typeof RPL_SERVICE_TYPES)[number]);
    setRplContent(storedRplContent(row.content, row.title));
    setRplDuration(row.content.durasi || "2 x 45 menit");
    setRplSemester(row.content.semester || "1");
    setRplPrincipalName(row.content.nama_kepala_sekolah || "");
    setRplNeedsNotes(row.content.catatan_kebutuhan || "");
    setRplYearId(row.academic_year_id ?? activeYear);
    void renderRplPdfPreview(
      storedRplContent(row.content, row.title),
      row.content.judul_topik || row.content.topik || row.title,
      {
        komponen_layanan: row.content.komponen_layanan || "Layanan Dasar",
        bidang_layanan: row.service_area,
        jenis_layanan: row.content.jenis_layanan || "Bimbingan Klasikal",
        sasaran_kelas: row.target_class,
        durasi: row.content.durasi || "2 x 45 menit",
        semester: row.content.semester || "1",
      },
      row.academic_year_id ?? activeYear,
    );
  }

  if (!canManage && !isStudent) {
    return <section className="kb-panel"><div className="kb-privacy">Bagian ini hanya tersedia untuk siswa atau petugas Bimbingan dan Konseling yang berwenang.</div></section>;
  }

  if (isStudent && !student) {
    return <section className="kb-panel"><div className="kb-privacy" role="status">Profil siswa belum terhubung ke Data Induk. Hubungi administrator sekolah agar akun dapat ditautkan.</div></section>;
  }

  if (tab === "Konsultasi BK" || tab === "Pengajuan Konsultasi") {
    return (
      <section className="kb-panel kb-workflow-panel">
        <PrintHeader header={outputHeader} title="Laporan Konsultasi Bimbingan dan Konseling" />
        {!isStudent && <div className="kb-document-output-options"><SchoolLetterheadPicker value={letterheadSlot} onChange={setLetterheadSlot} /></div>}
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
        <PrintHeader header={outputHeader} title="Laporan Kunjungan Rumah Peserta Didik" />
        {!isStudent && <div className="kb-document-output-options"><SchoolLetterheadPicker value={letterheadSlot} onChange={setLetterheadSlot} /></div>}
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
        <PrintHeader header={outputHeader} title="Rencana Pelaksanaan Layanan Bimbingan dan Konseling" />
        <div className="kb-panel-heading"><div><span className="kb-eyebrow">PERENCANAAN LAYANAN</span><h2>Generator RPL</h2></div></div>
        <div className="kb-document-output-options"><SchoolLetterheadPicker value={letterheadSlot} onChange={setLetterheadSlot} /></div>
        {error && <div className="kb-alert" role="alert">{error}</div>}{notice && <div className="kb-success" role="status">{notice}</div>}
        <form className="kb-form" onSubmit={event => {
          event.preventDefault();
          void runSave(async () => {
            const result = await saveRpl({
              id: rplId || undefined,
              title: rplTitle || rplTopic,
              academic_year_id: rplYearId || activeYear || null,
              target_class: rplGrade,
              service_area: rplArea,
              content: {
                ...rplContent,
                topik: rplTopic,
                komponen_layanan: rplComponent,
                jenis_layanan: rplServiceType,
                durasi: rplDuration,
                catatan_kebutuhan: rplNeedsNotes,
                semester: rplSemester,
                nama_kepala_sekolah: rplPrincipalName,
              },
            });
            setRplId(result.id);
          }, "RPL berhasil disimpan.");
        }}>
          <div className="kb-rpl-presets">
            <span>Pilih topik cepat</span>
            <div>{RPL_PRESETS.slice(0, 4).map(topic => <button key={topic} className="kb-secondary" type="button" onClick={() => {
              setRplTopic(topic);
              setRplTitle(topic);
              setRplContent(current => ({ ...current, judul_topik: topic }));
            }}>{topic.includes("Bullying") ? "Bullying / Perundungan" : topic.includes("Kepercayaan") ? "Kepercayaan Diri" : topic.includes("Kekerasan") ? "Kekerasan Seksual" : "Hubungan Pertemanan"}</button>)}</div>
          </div>
          <label><LabelCaption required>Topik layanan</LabelCaption><input required value={rplTopic} onChange={event => { setRplTopic(event.target.value); setRplTitle(event.target.value); }} /></label>
          <label><LabelCaption required>Bidang layanan</LabelCaption><select required value={rplArea} onChange={event => setRplArea(event.target.value)}>{AREA_OPTIONS.map(area => <option key={area}>{area}</option>)}</select></label>
          <label><LabelCaption required>Komponen layanan</LabelCaption><select required value={rplComponent} onChange={event => setRplComponent(event.target.value as (typeof RPL_COMPONENTS)[number])}>{RPL_COMPONENTS.map(item => <option key={item}>{item}</option>)}</select></label>
          <label><LabelCaption required>Jenis layanan</LabelCaption><select required value={rplServiceType} onChange={event => setRplServiceType(event.target.value as (typeof RPL_SERVICE_TYPES)[number])}>{RPL_SERVICE_TYPES.map(item => <option key={item}>{item}</option>)}</select></label>
          <label><LabelCaption required>Kelas sasaran</LabelCaption><select required value={rplGrade} onChange={event => setRplGrade(event.target.value)}><option value="">Pilih kelas...</option>{classes.map(item => <option key={item.id} value={item.name}>{item.name}</option>)}<option value="Semua kelas">Semua kelas</option></select></label>
          <label><LabelCaption required>Alokasi waktu</LabelCaption><input required value={rplDuration} onChange={event => setRplDuration(event.target.value)} placeholder="1 x 45 Menit" /></label>
          <label><LabelCaption required>Tahun ajaran</LabelCaption><select required value={rplYearId || activeYear} onChange={event => setRplYearId(event.target.value)}><option value="">Pilih tahun ajaran...</option>{academicYears.map(year => <option key={year.id} value={year.id}>{year.name}{year.is_active ? " · Aktif" : ""}</option>)}</select></label>
          <label><LabelCaption required>Semester</LabelCaption><select required value={rplSemester} onChange={event => setRplSemester(event.target.value)}><option value="1">Semester 1</option><option value="2">Semester 2</option></select></label>
          <label>Nama Kepala Sekolah (pengesahan)<input value={rplPrincipalName} onChange={event => setRplPrincipalName(event.target.value)} placeholder="Opsional" /></label>
          <label>Catatan kebutuhan (tanpa identitas siswa)<textarea rows={3} maxLength={1000} value={rplNeedsNotes} onChange={event => setRplNeedsNotes(event.target.value)} placeholder="Ringkasan kebutuhan umum, bukan data kasus pribadi." /></label>
          <div className="kb-ai-assistant">
            <p>Gemini hanya menerima konteks umum RPL. Jangan masukkan nama, NISN, atau catatan kasus pribadi siswa. Jika fungsi AI belum tersedia, gunakan template bawaan.</p>
            <div className="kb-rpl-generator-actions">
              <button className="kb-primary" type="button" disabled={aiBusy} aria-busy={aiBusy} onClick={() => void generateRplDraft()}>
                {aiBusy ? "Menyusun RPL..." : "Generate RPL dengan AI (Gemini)"}
              </button>
              <button className="kb-secondary" type="button" onClick={() => {
                const topic = rplTopic.trim() || "Layanan Bimbingan dan Konseling";
                applyRplDraft(templateRpl(topic), topic, "Template RPL bawaan dibuat dan pratinjau PDF sudah siap. Silakan sesuaikan.");
              }}>Gunakan Template RPL Bawaan</button>
            </div>
          </div>
          {RPL_FIELDS.map(field => <label key={field.key}><LabelCaption>{field.label}</LabelCaption><textarea rows={field.key === "materi_pokok" ? 5 : 3} value={rplContent[field.key]} onChange={event => {
            const value = event.target.value;
            setRplContent(current => ({ ...current, [field.key]: value }));
          }} /></label>)}
          <div className="kb-actions">
            <button className="kb-secondary" type="button" disabled={pdfPreviewLoading || !rplTopic.trim()} onClick={() => void renderRplPdfPreview()}>
              {pdfPreviewLoading ? "Membuat PDF..." : "Buat / Perbarui Pratinjau PDF"}
            </button>
            <button className="kb-primary" disabled={busy || aiBusy || !rplTopic.trim()}>{busy ? "Menyimpan..." : "Simpan ke Riwayat RPL"}</button>
            <button className="kb-secondary" type="button" onClick={() => {
              setRplId("");
              setRplTitle("");
              setRplTopic("");
              setRplContent(EMPTY_RPL_CONTENT);
              setRplPrincipalName("");
              setPdfPreviewError("");
            }}>RPL baru</button>
          </div>
        </form>
        {pdfPreviewError && <div className="kb-alert" role="alert">{pdfPreviewError}</div>}
        {(pdfPreviewUrl || pdfPreviewLoading) && <section className="kb-rpl-preview" aria-label="Pratinjau PDF RPL">
          <div className="kb-panel-heading"><div><span className="kb-eyebrow">DOKUMEN SIAP CETAK</span><h3>Pratinjau PDF</h3></div>
            <div className="kb-rpl-generator-actions">
              <button className="kb-primary" type="button" onClick={() => void downloadCurrentRplPdf()} disabled={!pdfPreviewUrl}>Unduh PDF</button>
              {pdfPreviewUrl && <a className="kb-secondary kb-rpl-open-link" href={pdfPreviewUrl} target="_blank" rel="noopener noreferrer">Buka PDF di Tab Baru</a>}
            </div>
          </div>
          {pdfPreviewLoading ? <p className="kb-loading" role="status">Menyusun pratinjau PDF…</p> : pdfPreviewUrl && <>
            <iframe className="kb-rpl-pdf-frame" src={pdfPreviewUrl} title="Pratinjau Dokumen RPL PDF" />
            <p className="kb-rpl-preview-fallback">Jika pratinjau tidak tampil di perangkat ini, gunakan tombol “Buka PDF di Tab Baru” atau “Unduh PDF”.</p>
          </>}
        </section>}
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
        <PrintHeader header={outputHeader} title="Rekap Angket Kebutuhan Peserta Didik" />
        {!isStudent && <div className="kb-document-output-options"><SchoolLetterheadPicker value={letterheadSlot} onChange={setLetterheadSlot} /></div>}
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
        <PrintHeader header={outputHeader} title="Biodata Bimbingan dan Konseling Peserta Didik" />
        {!isStudent && <div className="kb-document-output-options"><SchoolLetterheadPicker value={letterheadSlot} onChange={setLetterheadSlot} /></div>}
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
