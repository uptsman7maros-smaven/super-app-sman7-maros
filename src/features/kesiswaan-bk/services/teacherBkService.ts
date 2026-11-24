import { supabase } from "../../../lib/supabase";

export type TeacherReferralStatus =
  | "Menunggu Tinjauan"
  | "Diproses BK"
  | "Jadwal Konsultasi Dibuat"
  | "Selesai";

export type TeacherReferralRow = {
  id: string;
  student_id: string;
  class_id: string;
  reporter_profile_id: string;
  counselor_profile_id: string | null;
  category: string;
  priority: string;
  description: string;
  status: TeacherReferralStatus;
  non_confidential_feedback: string;
  consultation_id: string | null;
  home_visit_id: string | null;
  source_followup_id: string | null;
  created_at: string;
  updated_at: string;
};

export type TeacherAppreciationRow = {
  id: string;
  student_id: string;
  class_id: string | null;
  created_by: string;
  category: string;
  note: string;
  created_at: string;
};

export type HomeroomAttendanceSummary = {
  student_id: string;
  class_id: string;
  full_name: string;
  nisn: string;
  class_name: string;
  sakit_count: number;
  izin_count: number;
  alpa_count: number;
  terlambat_count: number;
  has_bk_alert: boolean;
  latest_referral_status: TeacherReferralStatus | null;
  early_warning: string;
};

export type SafeSupportSchedule = {
  student_id?: string;
  student_name?: string;
  class_name?: string;
  event_type: string;
  event_date: string;
  event_time: string | null;
  status: string;
};

export type HomeroomFollowupRow = {
  id: string;
  student_id: string;
  class_id: string;
  teacher_profile_id: string;
  intervention: string;
  note: string;
  outcome: string;
  referral_id: string | null;
  created_at: string;
};

export type HomeVisitCollaborationRow = {
  id: string;
  student_id: string;
  class_id: string;
  requester_profile_id: string;
  counselor_profile_id: string | null;
  requested_date: string | null;
  context: string;
  status: "Menunggu BK" | "Disetujui" | "Ditolak";
  response_note: string;
  home_visit_id: string | null;
  created_at: string;
  updated_at: string;
};

export type HomeroomAkpdSummary = {
  area: string;
  respondent_count: number;
  need_count: number;
  answered_count: number;
  percentage: number | null;
};

export type AkpdAggregateSummary = HomeroomAkpdSummary & {
  form_id: string;
  question_id: string;
  question_text: string;
};

function throwOnError(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

export async function listTeacherReferrals() {
  const { data, error } = await supabase.from("kb_teacher_referrals")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(500);
  throwOnError(error);
  return (data ?? []) as TeacherReferralRow[];
}

export async function countPendingTeacherReferrals() {
  const { count, error } = await supabase.from("kb_teacher_referrals")
    .select("id", { count: "exact", head: true })
    .eq("status", "Menunggu Tinjauan");
  throwOnError(error);
  return count ?? 0;
}

export async function createTeacherReferral(input: {
  studentId: string;
  category: string;
  priority: string;
  description: string;
}) {
  const { data, error } = await supabase.from("kb_teacher_referrals").insert({
    student_id: input.studentId,
    category: input.category,
    priority: input.priority,
    description: input.description.trim(),
  }).select("*").single();
  throwOnError(error);
  return data as TeacherReferralRow;
}

export async function updateTeacherReferral(id: string, input: {
  status: TeacherReferralStatus;
  non_confidential_feedback: string;
  consultation_id: string | null;
  home_visit_id: string | null;
}) {
  const { data, error } = await supabase.from("kb_teacher_referrals")
    .update(input)
    .eq("id", id)
    .select("*")
    .single();
  throwOnError(error);
  return data as TeacherReferralRow;
}

export async function listTeacherAppreciations(studentId?: string) {
  let query = supabase.from("kb_teacher_appreciations")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(500);
  if (studentId) query = query.eq("student_id", studentId);
  const { data, error } = await query;
  throwOnError(error);
  return (data ?? []) as TeacherAppreciationRow[];
}

export async function createTeacherAppreciation(input: {
  studentId: string;
  category: string;
  note: string;
}) {
  const { data, error } = await supabase.from("kb_teacher_appreciations").insert({
    student_id: input.studentId,
    category: input.category,
    note: input.note.trim(),
  }).select("*").single();
  throwOnError(error);
  return data as TeacherAppreciationRow;
}

export async function listHomeroomAttendanceSummary() {
  const { data, error } = await supabase.rpc("kb_homeroom_attendance_summary");
  throwOnError(error);
  return (data ?? []) as HomeroomAttendanceSummary[];
}

export async function listHomeroomSchedules() {
  const { data, error } = await supabase.rpc("kb_homeroom_schedule_summary");
  throwOnError(error);
  return (data ?? []) as SafeSupportSchedule[];
}

export async function listStudentSupportSchedules() {
  const { data, error } = await supabase.rpc("kb_student_support_schedule");
  throwOnError(error);
  return (data ?? []) as SafeSupportSchedule[];
}

export async function listHomeroomAkpdSummary() {
  const { data, error } = await supabase.rpc("kb_homeroom_akpd_summary");
  throwOnError(error);
  return (data ?? []) as HomeroomAkpdSummary[];
}

export async function listAkpdAggregateSummary(formId?: string) {
  const { data, error } = await supabase.rpc("kb_akpd_aggregate_summary", {
    p_form_id: formId ?? null,
  });
  throwOnError(error);
  return (data ?? []) as AkpdAggregateSummary[];
}

export async function listHomeroomFollowups() {
  const { data, error } = await supabase.from("kb_homeroom_followups")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(300);
  throwOnError(error);
  return (data ?? []) as HomeroomFollowupRow[];
}

export async function createHomeroomFollowup(input: {
  studentId: string;
  intervention: string;
  note: string;
  category: string;
  priority: string;
  escalate: boolean;
}) {
  const { data, error } = await supabase.rpc("kb_create_homeroom_followup", {
    p_student_id: input.studentId,
    p_intervention: input.intervention,
    p_note: input.note.trim(),
    p_category: input.category,
    p_priority: input.priority,
    p_escalate: input.escalate,
  });
  throwOnError(error);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row.followup_id !== "string") {
    throw new Error("Respons pencatatan pembinaan tidak valid.");
  }
  return row as { followup_id: string; referral_id: string | null };
}

export async function listHomeVisitCollaborations() {
  const { data, error } = await supabase.from("kb_home_visit_collaborations")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(300);
  throwOnError(error);
  return (data ?? []) as HomeVisitCollaborationRow[];
}

export async function createHomeVisitCollaboration(input: {
  studentId: string;
  requestedDate: string | null;
  context: string;
}) {
  const { data, error } = await supabase.from("kb_home_visit_collaborations").insert({
    student_id: input.studentId,
    requested_date: input.requestedDate || null,
    context: input.context.trim(),
  }).select("*").single();
  throwOnError(error);
  return data as HomeVisitCollaborationRow;
}

export async function updateHomeVisitCollaboration(id: string, input: {
  status: HomeVisitCollaborationRow["status"];
  response_note: string;
  home_visit_id: string | null;
}) {
  const { data, error } = await supabase.from("kb_home_visit_collaborations")
    .update(input)
    .eq("id", id)
    .select("*")
    .single();
  throwOnError(error);
  return data as HomeVisitCollaborationRow;
}
