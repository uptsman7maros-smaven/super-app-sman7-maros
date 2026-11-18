import { supabase } from "../../../lib/supabase";
import type {
  AkpdFormRow,
  AkpdResponseRow,
  ConsultationRow,
  CurhatMessageRow,
  CurhatThreadRow,
  HomeVisitRow,
  RplRow,
  StudentCounselingProfile,
} from "../types";

type ConsultationInput = Omit<ConsultationRow, "id"> & { id?: string };
type HomeVisitInput = Omit<HomeVisitRow, "id"> & { id?: string };
type RplInput = Omit<RplRow, "id" | "created_at"> & { id?: string };

function throwOnError(error: { message: string } | null) {
  if (error) throw new Error(error.message);
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

export async function listAkpdResponses(formId?: string) {
  let query = supabase.from("kb_akpd_responses").select("*").order("created_at", { ascending: false }).limit(1000);
  if (formId) query = query.eq("form_id", formId);
  const { data, error } = await query;
  throwOnError(error);
  return (data ?? []) as AkpdResponseRow[];
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
