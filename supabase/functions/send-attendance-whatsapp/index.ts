import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Response | Promise<Response>): void;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normalizePhone(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.startsWith("62")) return digits;
  if (digits.startsWith("0")) return `62${digits.slice(1)}`;
  if (digits.startsWith("8")) return `62${digits}`;
  return digits;
}

function className(value: unknown) {
  if (Array.isArray(value)) return value[0]?.name ?? "-";
  if (value && typeof value === "object" && "name" in value) {
    return String((value as { name?: unknown }).name ?? "-");
  }
  return "-";
}

function fonnteStatus(value: unknown): boolean | null {
  if (!value || typeof value !== "object") return null;
  const response = value as Record<string, unknown>;
  if (typeof response.status === "boolean") return response.status;
  if (typeof response.Status === "boolean") return response.Status;
  return null;
}

function fonnteFailureDetail(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const response = value as Record<string, unknown>;
  if (typeof response.reason === "string") return response.reason;
  if (typeof response.detail === "string") return response.detail;
  return null;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const authHeader = request.headers.get("Authorization");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return jsonResponse({ error: "Konfigurasi Supabase tidak lengkap" }, 500);
    }
    if (!authHeader) return jsonResponse({ error: "Unauthorized" }, 401);

    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: auth, error: authError } = await authClient.auth.getUser();
    if (authError || !auth.user) return jsonResponse({ error: "Unauthorized" }, 401);

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role,status,username")
      .eq("id", auth.user.id)
      .maybeSingle();
    if (profileError) throw profileError;

    const body = await request.json();
    const eventType = String(body.event_type ?? "");
    const qrRecordId = String(body.qr_record_id ?? "");
    if (!body.person_identifier || !body.attendance_date || !eventType || !qrRecordId) {
      return jsonResponse({ error: "person_identifier, attendance_date, event_type, dan qr_record_id wajib diisi" }, 400);
    }
    if (!["school_arrival", "school_departure"].includes(eventType)) {
      return jsonResponse({ error: "Notifikasi hanya tersedia untuk QR kedatangan atau kepulangan sekolah" }, 400);
    }
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(qrRecordId)) {
      return jsonResponse({ error: "qr_record_id tidak valid" }, 400);
    }

    const allowedAdminRoles = ["super_admin", "operator", "kepala_sekolah"];
    const isAdmin = !!profile && allowedAdminRoles.includes(String(profile.role));
    const isStudent = profile?.role === "siswa";
    if (!profile || profile.status !== "active" || (!isAdmin && !isStudent)) {
      return jsonResponse({ error: "Forbidden" }, 403);
    }

    const attendanceDate = String(body.attendance_date);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(attendanceDate)) {
      return jsonResponse({ error: "attendance_date harus menggunakan format YYYY-MM-DD" }, 400);
    }
    const parsedDate = new Date(`${attendanceDate}T00:00:00Z`);
    if (Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== attendanceDate) {
      return jsonResponse({ error: "attendance_date tidak valid" }, 400);
    }
    const personIdentifier = String(body.person_identifier).trim();
    if (!personIdentifier) return jsonResponse({ error: "person_identifier tidak valid" }, 400);
    if (isStudent && String(profile.username ?? "").trim() !== personIdentifier) {
      return jsonResponse({ error: "Siswa hanya dapat mengirim notifikasi untuk identitasnya sendiri" }, 403);
    }
    const { data: student, error: studentError } = await supabase
      .from("students")
      .select("id,parent_phone,full_name,class:classes(name)")
      .eq("nisn", personIdentifier)
      .maybeSingle();
    if (studentError) throw studentError;
    if (!student) return jsonResponse({ sent: false, reason: "student_not_found" }, 404);

    const { data: qrRecord, error: qrRecordError } = await supabase
      .from("attendance_qr_records")
      .select("id,attendance_date,session_type,status,person_type,person_identifier,created_by,created_at")
      .eq("id", qrRecordId)
      .eq("attendance_date", attendanceDate)
      .eq("session_type", eventType)
      .eq("person_type", "siswa")
      .eq("person_identifier", personIdentifier)
      .eq("is_voided", false)
      .maybeSingle();
    if (qrRecordError) throw qrRecordError;
    if (!qrRecord) return jsonResponse({ sent: false, reason: "qr_record_not_found" }, 404);
    if (isStudent && qrRecord.created_by !== auth.user.id) {
      return jsonResponse({ error: "QR tersebut bukan hasil pemindaian akun ini" }, 403);
    }
    const status = eventType === "school_arrival"
      ? qrRecord.status === "terlambat" ? "terlambat di sekolah" : "hadir di sekolah"
      : "pulang dari sekolah";

    const { data: settings, error: settingsError } = await supabase
      .from("attendance_notification_settings")
      .select("enabled,message_template")
      .eq("id", 1)
      .maybeSingle();
    if (settingsError) throw settingsError;
    if (!settings?.enabled) return jsonResponse({ sent: false, reason: "disabled" });

    const { data: existingLog, error: existingLogError } = await supabase
      .from("attendance_qr_whatsapp_logs")
      .select("id,status,provider_response")
      .eq("student_id", student.id)
      .eq("attendance_date", attendanceDate)
      .eq("event_type", eventType)
      .maybeSingle();
    if (existingLogError) throw existingLogError;
    if (
      existingLog?.status === "sent" &&
      fonnteStatus(existingLog.provider_response) !== false
    ) {
      return jsonResponse({ sent: false, reason: "already_sent" });
    }

    if (!student?.parent_phone) {
      return jsonResponse({ sent: false, reason: "parent_phone_missing" });
    }

    const phone = normalizePhone(String(student.parent_phone));
    if (!phone) return jsonResponse({ sent: false, reason: "parent_phone_invalid" });

    const eventTimestamp = new Date(qrRecord.created_at);
    if (Number.isNaN(eventTimestamp.getTime())) {
      return jsonResponse({ error: "Waktu pemindaian QR tidak valid" }, 500);
    }
    const eventDate = new Intl.DateTimeFormat("id-ID", {
      day: "2-digit",
      month: "long",
      year: "numeric",
      timeZone: "Asia/Makassar",
    }).format(eventTimestamp);
    const eventTime = new Intl.DateTimeFormat("id-ID", {
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
      timeZone: "Asia/Makassar",
    }).format(eventTimestamp);
    const message = String(settings.message_template ?? "")
      .replaceAll("{nama}", String(student.full_name ?? "-"))
      .replaceAll("{status}", status)
      .replaceAll("{tanggal}", eventDate)
      .replaceAll("{jam}", eventTime)
      .replaceAll("{kelas}", className(student.class));

    const fonnteToken = Deno.env.get("FONNTE_TOKEN");
    if (!fonnteToken) return jsonResponse({ error: "FONNTE_TOKEN belum dikonfigurasi" }, 500);

    const formData = new FormData();
    formData.set("target", phone);
    formData.set("message", message);
    formData.set("countryCode", "0");
    const providerResponse = await fetch("https://api.fonnte.com/send", {
      method: "POST",
      headers: { Authorization: fonnteToken },
      body: formData,
    });
    const providerText = await providerResponse.text();
    let providerData: unknown;
    try {
      providerData = providerText ? JSON.parse(providerText) : null;
    } catch {
      providerData = providerText;
    }
    const sent = providerResponse.ok && fonnteStatus(providerData) === true;
    const providerDetail = fonnteFailureDetail(providerData);
    const failureDetail = !providerResponse.ok
      ? providerDetail ?? `Fonnte menolak permintaan (HTTP ${providerResponse.status}).`
      : fonnteStatus(providerData) === false
        ? providerDetail ?? "Fonnte menolak pesan."
        : "Respons Fonnte tidak mengonfirmasi bahwa pesan masuk antrean.";

    const { error: logError } = await supabase.from("attendance_qr_whatsapp_logs").upsert({
      attendance_qr_record_id: qrRecord.id,
      student_id: student.id,
      attendance_date: attendanceDate,
      event_type: eventType,
      phone,
      message,
      status: sent ? "sent" : "failed",
      provider_response: providerData,
      sent_at: sent ? new Date().toISOString() : null,
    }, { onConflict: "student_id,attendance_date,event_type" });
    if (logError) throw logError;

    return sent
      ? jsonResponse({ sent: true, provider: providerData })
      : jsonResponse({
          sent: false,
          reason: "provider_rejected",
          detail: failureDetail,
          provider: providerData,
        });
  } catch (error) {
    console.error(error);
    return jsonResponse({
      error: error instanceof Error ? error.message : String(error),
    }, 500);
  }
});
