import { supabase } from "../../../lib/supabase";
import type {
  AkpdFormRow,
  AkpdResponseRow,
  ConsultationRow,
  CurhatMessageRow,
  CurhatThreadRow,
  HomeVisitRow,
  RplRow,
  RplGeneratedDraft,
  StudentCounselingProfile,
  StudentServiceSummary,
} from "../types";

type ConsultationInput = Omit<ConsultationRow, "id"> & { id?: string };
type HomeVisitInput = Omit<HomeVisitRow, "id"> & { id?: string };
type RplInput = Omit<RplRow, "id" | "created_at"> & { id?: string };

const RPL_DRAFT_FIELDS = [
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
const AKPD_AREAS = ["Pribadi", "Sosial", "Belajar", "Karir"] as const;

function throwOnError(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function invokeBkWritingAssistant(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("bk-writing-assistant", { body });
  throwOnError(error);
  if (!isRecord(data) || !isRecord(data.draft)) {
    throw new Error("Respons asisten AI tidak sesuai format.");
  }
  return data.draft;
}

export async function generateRpl(input: {
  topic: string;
  bidang_layanan: string;
  komponen_layanan: string;
  jenis_layanan: string;
  sasaran_kelas: string;
  durasi: string;
  catatan_kebutuhan: string;
}): Promise<RplGeneratedDraft> {
  const { data, error } = await supabase.functions.invoke("generate-rpl", { body: input });
  if (error) {
    if (error.context instanceof Response) {
      let payload: Record<string, unknown> = {};
      try {
        const parsed: unknown = await error.context.clone().json();
        if (isRecord(parsed)) payload = parsed;
      } catch {
        // The gateway can return a non-JSON response while the function is unavailable.
      }
      if (payload.code === "MISSING_GEMINI_KEY") {
        throw new Error("GEMINI_API_KEY belum dikonfigurasi di Supabase. Gunakan template RPL bawaan atau minta admin mengatur secret.");
      }
      if (error.context.status === 404 || error.context.status === 503 && /function/i.test(String(payload.error ?? ""))) {
        throw new Error("Edge Function generate-rpl belum tersedia. Deploy fungsi tersebut atau gunakan template RPL bawaan.");
      }
      if (typeof payload.error === "string") throw new Error(payload.error);
    }
    throw new Error(error.message || "Generator RPL AI tidak dapat dihubungi. Gunakan template RPL bawaan.");
  }
  if (!isRecord(data) || !isRecord(data.draft)) throw new Error("Respons Generator RPL tidak sesuai format.");
  const draft = data.draft;
  const scalarKeys = [
    "judul_topik", "tujuan_umum", "metode_teknik", "media_alat", "materi_pokok",
    "evaluasi_proses", "evaluasi_hasil",
  ] as const;
  for (const key of scalarKeys) if (typeof draft[key] !== "string" || !draft[key].trim()) {
    throw new Error("Hasil Gemini tidak memiliki semua bagian RPL.");
  }
  if (!Array.isArray(draft.tujuan_khusus) || draft.tujuan_khusus.length < 3 || draft.tujuan_khusus.length > 4
    || draft.tujuan_khusus.some(item => typeof item !== "string" || !item.trim())) {
    throw new Error("Tujuan khusus pada hasil Gemini tidak valid.");
  }
  for (const key of ["tahap_awal", "tahap_inti", "tahap_penutup"] as const) {
    const steps: unknown = draft[key];
    if (!Array.isArray(steps) || steps.length === 0 || steps.some(step =>
      !isRecord(step) || typeof step.kegiatan !== "string" || !step.kegiatan.trim()
      || !Number.isInteger(step.estimasi_menit) || Number(step.estimasi_menit) < 1,
    )) throw new Error("Langkah kegiatan pada hasil Gemini tidak valid.");
  }
  return draft as unknown as RplGeneratedDraft;
}

export async function generateBkRplDraft(input: {
  topic: string;
  area: string;
  targetClass: string;
  duration: string;
}) {
  const draft = await invokeBkWritingAssistant({ action: "rpl", ...input });
  if (!isRecord(draft.fields)) throw new Error("Draf RPL dari AI tidak lengkap.");
  const fields: Record<string, string> = {};
  for (const field of RPL_DRAFT_FIELDS) {
    if (typeof draft.fields[field] !== "string") throw new Error("Draf RPL dari AI tidak lengkap.");
    fields[field] = draft.fields[field];
  }
  return fields;
}

export async function generateBkAkpdQuestions(targetGrade: string) {
  const draft = await invokeBkWritingAssistant({ action: "akpd", targetGrade });
  if (!Array.isArray(draft.questions)) throw new Error("Draf pertanyaan AKPD dari AI tidak lengkap.");
  return draft.questions.map(question => {
    if (
      !isRecord(question)
      || typeof question.area !== "string"
      || !AKPD_AREAS.includes(question.area as (typeof AKPD_AREAS)[number])
      || typeof question.text !== "string"
    ) {
      throw new Error("Draf pertanyaan AKPD dari AI tidak valid.");
    }
    return { area: question.area, text: question.text };
  });
}

export async function listConsultations(studentId?: string) {
  let query = supabase.from("kb_consultations").select("*").order("created_at", { ascending: false }).limit(300);
  if (studentId) query = query.eq("student_id", studentId);
  const { data, error } = await query;
  throwOnError(error);
  return (data ?? []) as ConsultationRow[];
}

export async function saveConsultation(input: ConsultationInput) {
  const { data, error } = await supabase.from("kb_consultations")
    .upsert(input, { onConflict: input.id ? "id" : "source_curhat_thread_id" })
    .select("*")
    .single();
  throwOnError(error);
  return data as ConsultationRow;
}

export async function listHomeVisits() {
  const { data, error } = await supabase.from("kb_home_visits").select("*").order("visit_date", { ascending: false }).limit(300);
  throwOnError(error);
  return (data ?? []) as HomeVisitRow[];
}

export async function saveHomeVisit(input: HomeVisitInput) {
  const { data, error } = await supabase.from("kb_home_visits").upsert(input).select("*").single();
  throwOnError(error);
  return data as HomeVisitRow;
}

export async function listRpl() {
  const { data, error } = await supabase.from("kb_rpl").select("*").order("updated_at", { ascending: false }).limit(200);
  throwOnError(error);
  return (data ?? []) as RplRow[];
}

export async function saveRpl(input: RplInput) {
  const { data, error } = await supabase.from("kb_rpl").upsert(input).select("*").single();
  throwOnError(error);
  return data as RplRow;
}

export async function listAkpdForms(activeOnly = false) {
  let query = supabase.from("kb_akpd_forms").select("*").order("created_at", { ascending: false }).limit(100);
  if (activeOnly) query = query.eq("is_active", true);
  const { data, error } = await query;
  throwOnError(error);
  return (data ?? []) as AkpdFormRow[];
}

export async function saveAkpdForm(input: Omit<AkpdFormRow, "id"> & { id?: string }) {
  const { data, error } = await supabase.from("kb_akpd_forms").upsert(input).select("*").single();
  throwOnError(error);
  return data as AkpdFormRow;
}

export async function listAkpdResponses(formId?: string, studentId?: string) {
  let query = supabase.from("kb_akpd_responses").select("*").order("created_at", { ascending: false }).limit(1000);
  if (formId) query = query.eq("form_id", formId);
  if (studentId) query = query.eq("student_id", studentId);
  const { data, error } = await query;
  throwOnError(error);
  return (data ?? []) as AkpdResponseRow[];
}

export async function loadStudentServiceSummary(): Promise<StudentServiceSummary | null> {
  const { data, error } = await supabase.rpc("kb_student_service_summary");
  throwOnError(error);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  if (typeof row !== "object" || row === null) {
    throw new Error("Ringkasan layanan siswa tidak sesuai format.");
  }
  const values = row as Record<string, unknown>;
  const summary = {
    curhatCount: Number(values.curhat_count),
    unreadCurhatCount: Number(values.unread_curhat_count),
    akpdCompletedCount: Number(values.akpd_completed_count),
    consultationCount: Number(values.consultation_count),
    pendingConsultationCount: Number(values.pending_consultation_count),
  };
  if (Object.values(summary).some(value => !Number.isInteger(value) || value < 0)) {
    throw new Error("Ringkasan layanan siswa tidak lengkap.");
  }
  return summary;
}

export async function saveAkpdResponse(input: Omit<AkpdResponseRow, "id" | "created_at">) {
  const { data, error } = await supabase.from("kb_akpd_responses")
    .upsert(input, { onConflict: "form_id,student_id" })
    .select("*")
    .single();
  throwOnError(error);
  return data as AkpdResponseRow;
}

export async function listCurhatThreads(studentId?: string) {
  let query = supabase.from("kb_curhat_threads").select("*").order("created_at", { ascending: false }).limit(300);
  if (studentId) query = query.eq("student_id", studentId);
  const { data, error } = await query;
  throwOnError(error);
  return (data ?? []) as CurhatThreadRow[];
}

export async function createCurhatThread(input: {
  student_id: string;
  counselor_profile_id: string;
  subject: string;
  category: string;
  urgency: string;
  body: string;
  request_consultation: boolean;
}) {
  const { body, ...thread } = input;
  const { data: threadId, error } = await supabase.rpc("kb_create_curhat_thread", {
    p_student_id: thread.student_id,
    p_counselor_profile_id: thread.counselor_profile_id,
    p_subject: thread.subject,
    p_category: thread.category,
    p_urgency: thread.urgency,
    p_body: body,
    p_request_consultation: thread.request_consultation,
  });
  throwOnError(error);
  const { data, error: loadError } = await supabase.from("kb_curhat_threads").select("*").eq("id", threadId).single();
  throwOnError(loadError);
  return data as CurhatThreadRow;
}

export async function listCurhatMessages(threadId: string) {
  const { data, error } = await supabase.from("kb_curhat_messages")
    .select("*")
    .eq("thread_id", threadId)
    .order("created_at");
  throwOnError(error);
  return (data ?? []) as CurhatMessageRow[];
}

export async function sendCurhatMessage(threadId: string, message: string) {
  const { error } = await supabase.from("kb_curhat_messages").insert({ thread_id: threadId, message });
  throwOnError(error);
}

export async function markCurhatRead(threadId: string, role: "siswa" | "guru_bk") {
  const update = role === "siswa"
    ? { unread_by_student: false }
    : { unread_by_counselor: false, status: "Dibaca" };
  const { error } = await supabase.from("kb_curhat_threads").update(update).eq("id", threadId);
  throwOnError(error);
}

export async function updateCurhatStatus(threadId: string, status: CurhatThreadRow["status"]) {
  const { error } = await supabase.from("kb_curhat_threads").update({ status }).eq("id", threadId);
  throwOnError(error);
}

export async function saveStudentCounselingProfile(input: StudentCounselingProfile) {
  const { error } = await supabase.from("kb_student_profiles").upsert(input, { onConflict: "student_id" });
  throwOnError(error);
}

export async function loadStudentCounselingProfile(studentId: string) {
  const { data, error } = await supabase.from("kb_student_profiles").select("*").eq("student_id", studentId).maybeSingle();
  throwOnError(error);
  return (data ?? null) as StudentCounselingProfile | null;
}

export async function loadStudentServiceCounts() {
  const [agendaResult, consultationResult, visitResult] = await Promise.all([
    supabase.from("kb_catatan_bk").select("student_id"),
    supabase.from("kb_consultations").select("student_id"),
    supabase.from("kb_home_visits").select("student_id"),
  ]);
  throwOnError(agendaResult.error);
  throwOnError(consultationResult.error);
  throwOnError(visitResult.error);
  const counts = new Map<string, number>();
  for (const row of [...(agendaResult.data ?? []), ...(consultationResult.data ?? []), ...(visitResult.data ?? [])]) {
    if (row.student_id) counts.set(row.student_id, (counts.get(row.student_id) ?? 0) + 1);
  }
  return counts;
}
