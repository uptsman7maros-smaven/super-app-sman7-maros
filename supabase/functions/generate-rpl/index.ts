import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Response | Promise<Response>): void;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const areas = ["Pribadi", "Sosial", "Belajar", "Karir"];
const components = ["Layanan Dasar", "Layanan Responsif", "Perencanaan Individual", "Dukungan Sistem"];
const serviceTypes = ["Bimbingan Klasikal", "Bimbingan Kelompok", "Konseling Kelompok", "Layanan Informasi"];
const scalarFields = [
  "judul_topik",
  "tujuan_umum",
  "metode_teknik",
  "media_alat",
  "materi_pokok",
  "evaluasi_proses",
  "evaluasi_hasil",
] as const;

type StageStep = { kegiatan: string; estimasi_menit: number };
type RplDraft = {
  judul_topik: string;
  tujuan_umum: string;
  tujuan_khusus: string[];
  metode_teknik: string;
  media_alat: string;
  materi_pokok: string;
  tahap_awal: StageStep[];
  tahap_inti: StageStep[];
  tahap_penutup: StageStep[];
  evaluasi_proses: string;
  evaluasi_hasil: string;
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readText(value: unknown, maxLength: number) {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text && text.length <= maxLength ? text : null;
}

function validateStage(value: unknown, maxMinutes: number): StageStep[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > 8) return null;
  const steps: StageStep[] = [];
  for (const item of value) {
    if (!isRecord(item)) return null;
    const kegiatan = readText(item.kegiatan, 700);
    const estimasi = item.estimasi_menit;
    if (!kegiatan || !Number.isInteger(estimasi) || Number(estimasi) < 1 || Number(estimasi) > maxMinutes) return null;
    steps.push({ kegiatan, estimasi_menit: Number(estimasi) });
  }
  return steps;
}

function validateDraft(value: unknown, durationMinutes: number): RplDraft | null {
  if (!isRecord(value)) return null;
  const draft: Record<string, unknown> = {};
  for (const field of scalarFields) {
    const text = readText(value[field], field === "materi_pokok" ? 3000 : 1800);
    if (!text) return null;
    draft[field] = text;
  }
  if (!Array.isArray(value.tujuan_khusus) || value.tujuan_khusus.length < 3 || value.tujuan_khusus.length > 4) return null;
  const objectives = value.tujuan_khusus.map(item => readText(item, 500));
  if (objectives.some(item => !item)) return null;
  draft.tujuan_khusus = objectives;

  const awal = validateStage(value.tahap_awal, durationMinutes);
  const inti = validateStage(value.tahap_inti, durationMinutes);
  const penutup = validateStage(value.tahap_penutup, durationMinutes);
  if (!awal || !inti || !penutup) return null;
  if ([...awal, ...inti, ...penutup].reduce((sum, step) => sum + step.estimasi_menit, 0) > durationMinutes + 5) return null;
  draft.tahap_awal = awal;
  draft.tahap_inti = inti;
  draft.tahap_penutup = penutup;
  return draft as unknown as RplDraft;
}

Deno.serve(async request => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ code: "METHOD_NOT_ALLOWED", error: "Method not allowed." }, 405);

  const authorization = request.headers.get("Authorization");
  if (!authorization) return jsonResponse({ code: "UNAUTHORIZED", error: "Sesi login diperlukan." }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return jsonResponse({ code: "SUPABASE_CONFIG_ERROR", error: "Konfigurasi Supabase tidak lengkap." }, 500);
  }

  let userId: string;
  try {
    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
    });
    const { data, error } = await authClient.auth.getUser();
    if (error || !data.user) return jsonResponse({ code: "UNAUTHORIZED", error: "Sesi login tidak valid." }, 401);
    userId = data.user.id;
  } catch (error) {
    console.error("Validasi sesi generate-rpl gagal:", error);
    return jsonResponse({ code: "AUTH_ERROR", error: "Sesi login tidak dapat diverifikasi." }, 401);
  }

  try {
    const serviceClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: profile, error } = await serviceClient
      .from("profiles")
      .select("role,status")
      .eq("id", userId)
      .maybeSingle();
    if (error) throw error;
    if (!profile || profile.status !== "active" || !["guru_bk", "super_admin", "operator"].includes(profile.role)) {
      return jsonResponse({ code: "FORBIDDEN", error: "Generator RPL hanya tersedia bagi Guru BK dan petugas berwenang." }, 403);
    }
  } catch (error) {
    console.error("Pemeriksaan role generate-rpl gagal:", error);
    return jsonResponse({ code: "ROLE_CHECK_FAILED", error: "Hak akses pengguna tidak dapat diverifikasi." }, 500);
  }

  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) {
    return jsonResponse({
      code: "MISSING_GEMINI_KEY",
      error: "GEMINI_API_KEY belum dikonfigurasi. Anda tetap dapat menggunakan template RPL bawaan.",
    }, 503);
  }

  let body: unknown;
  try {
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength > 16_000) return jsonResponse({ code: "PAYLOAD_TOO_LARGE", error: "Catatan kebutuhan terlalu panjang." }, 413);
    body = await request.json();
  } catch {
    return jsonResponse({ code: "INVALID_JSON", error: "Permintaan tidak valid." }, 400);
  }
  if (!isRecord(body)) return jsonResponse({ code: "INVALID_PAYLOAD", error: "Format permintaan tidak valid." }, 400);

  const topic = readText(body.topic, 300);
  const area = readText(body.bidang_layanan, 20);
  const component = readText(body.komponen_layanan, 40);
  const serviceType = readText(body.jenis_layanan, 40);
  const targetClass = readText(body.sasaran_kelas, 80);
  const duration = readText(body.durasi, 80);
  const rawNotes = body.catatan_kebutuhan;
  let notes: string | null = "";
  if (rawNotes !== undefined && rawNotes !== null) {
    notes = typeof rawNotes === "string" && rawNotes.trim().length <= 1000
      ? rawNotes.trim()
      : null;
  }
  if (
    !topic || !area || !areas.includes(area) || !component || !components.includes(component)
    || !serviceType || !serviceTypes.includes(serviceType) || !targetClass || !duration || notes === null
  ) {
    return jsonResponse({
      code: "INVALID_PAYLOAD",
      error: "Periksa topik, bidang, komponen, jenis layanan, sasaran, durasi, dan catatan (maksimal 1000 karakter). Catatan boleh dikosongkan.",
    }, 400);
  }
  const durationParts = duration.match(/(\d+)\s*x\s*(\d+)/i);
  const durationMinutes = Math.max(1, Math.min(360, durationParts
    ? Number(durationParts[1]) * Number(durationParts[2])
    : Number(duration.match(/\d+/)?.[0] ?? 45)));

  const prompt = [
    "Susun Rencana Pelaksanaan Layanan Bimbingan dan Konseling SMA berdasarkan Kurikulum Merdeka dan POP BK.",
    "Gunakan bahasa Indonesia yang inklusif, praktis, ramah usia, non-stigmatis, dan dapat langsung ditinjau Guru BK.",
    "Jangan mencantumkan identitas, mengarang kasus nyata, meminta data pribadi, atau memberi nasihat klinis.",
    "Setiap tahap kegiatan harus berupa langkah nyata, aktif/reflektif, dengan estimasi menit. Jumlah waktu seluruh langkah tidak boleh melebihi durasi.",
    "Tujuan khusus harus 3 sampai 4 poin operasional dan terukur.",
    `Topik: ${topic}`,
    `Bidang layanan: ${area}`,
    `Komponen layanan: ${component}`,
    `Jenis layanan: ${serviceType}`,
    `Sasaran kelas: ${targetClass}`,
    `Durasi: ${duration} (sekitar ${durationMinutes} menit)`,
    `Catatan kebutuhan non-identitas: ${notes || "Tidak ada"}`,
    "Kembalikan hanya JSON yang sesuai skema.",
  ].join("\n");
  const responseSchema = {
    type: "OBJECT",
    properties: {
      judul_topik: { type: "STRING" },
      tujuan_umum: { type: "STRING" },
      tujuan_khusus: { type: "ARRAY", items: { type: "STRING" } },
      metode_teknik: { type: "STRING" },
      media_alat: { type: "STRING" },
      materi_pokok: { type: "STRING" },
      tahap_awal: { type: "ARRAY", items: { type: "OBJECT", properties: { kegiatan: { type: "STRING" }, estimasi_menit: { type: "INTEGER" } }, required: ["kegiatan", "estimasi_menit"] } },
      tahap_inti: { type: "ARRAY", items: { type: "OBJECT", properties: { kegiatan: { type: "STRING" }, estimasi_menit: { type: "INTEGER" } }, required: ["kegiatan", "estimasi_menit"] } },
      tahap_penutup: { type: "ARRAY", items: { type: "OBJECT", properties: { kegiatan: { type: "STRING" }, estimasi_menit: { type: "INTEGER" } }, required: ["kegiatan", "estimasi_menit"] } },
      evaluasi_proses: { type: "STRING" },
      evaluasi_hasil: { type: "STRING" },
    },
    required: ["judul_topik", "tujuan_umum", "tujuan_khusus", "metode_teknik", "media_alat", "materi_pokok", "tahap_awal", "tahap_inti", "tahap_penutup", "evaluasi_proses", "evaluasi_hasil"],
  };
  const generationRequest = JSON.stringify({
    systemInstruction: { parts: [{ text: "Anda membantu Guru BK menyusun RPL pendidikan umum. Jangan mengolah data pribadi atau kasus nyata siswa." }] },
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { maxOutputTokens: 5500, responseMimeType: "application/json", responseSchema, temperature: 0.35 },
  });

  try {
    const requestModel = (model: string) => fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: generationRequest,
        signal: AbortSignal.timeout(45_000),
      },
    );
    let response = await requestModel("gemini-2.5-flash");
    if (response.status === 404) {
      console.warn("Gemini 2.5 Flash tidak tersedia; mencoba alias Gemini Flash terbaru.");
      response = await requestModel("gemini-flash-latest");
    }
    const result: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const providerError = isRecord(result) && isRecord(result.error) ? result.error : {};
      const providerMessage = typeof providerError.message === "string"
        ? providerError.message.replace(/AIza[0-9A-Za-z_-]{20,}/g, "[redacted]").replace(/\s+/g, " ").slice(0, 320)
        : "";
      const providerStatus = typeof providerError.status === "string" ? providerError.status : "";
      const providerCode = typeof providerError.code === "number" ? providerError.code : null;
      console.error("Generate-rpl Gemini HTTP error", { httpStatus: response.status, providerStatus, providerCode });

      if (response.status === 429) {
        return jsonResponse({ code: "GEMINI_RATE_LIMIT", error: "Kuota AI sedang penuh. Coba lagi beberapa saat." }, 429);
      }
      if (/API key not valid|API_KEY_INVALID/i.test(providerMessage)) {
        return jsonResponse({
          code: "GEMINI_KEY_INVALID",
          error: "Kunci Gemini tidak valid. Periksa GEMINI_API_KEY di Supabase dan pastikan Generative Language API diaktifkan.",
        }, 502);
      }
      if (response.status === 403 || response.status === 401) {
        return jsonResponse({
          code: "GEMINI_PERMISSION_DENIED",
          error: providerMessage
            ? `Akses Gemini ditolak: ${providerMessage}`
            : "Akses Gemini ditolak. Periksa izin API key dan akses ke model Gemini.",
        }, 502);
      }
      if (response.status === 400) {
        return jsonResponse({
          code: "GEMINI_REQUEST_INVALID",
          error: providerMessage
            ? `Gemini menolak permintaan: ${providerMessage}`
            : "Gemini menolak format permintaan. Periksa konfigurasi model dan skema RPL.",
        }, 502);
      }
      if (response.status === 404) {
        return jsonResponse({ code: "GEMINI_MODEL_UNAVAILABLE", error: "Model Gemini tidak ditemukan atau tidak tersedia untuk API key ini." }, 502);
      }
      return jsonResponse({
        code: "GEMINI_ERROR",
        error: `Gemini gagal menyusun RPL (HTTP ${response.status}). Gunakan template bawaan atau coba kembali.`,
      }, 502);
    }
    if (!isRecord(result) || !Array.isArray(result.candidates)) {
      return jsonResponse({ code: "INVALID_GEMINI_RESPONSE", error: "Respons Gemini tidak sesuai format." }, 502);
    }
    const candidate = result.candidates[0];
    if (!isRecord(candidate) || !isRecord(candidate.content) || !Array.isArray(candidate.content.parts)) {
      return jsonResponse({ code: "EMPTY_GEMINI_RESPONSE", error: "Gemini tidak menghasilkan draf RPL." }, 502);
    }
    const text = candidate.content.parts.filter(isRecord)
      .map(part => part.text)
      .find((part): part is string => typeof part === "string");
    if (!text) return jsonResponse({ code: "EMPTY_GEMINI_RESPONSE", error: "Gemini tidak menghasilkan teks RPL." }, 502);
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return jsonResponse({ code: "INVALID_GEMINI_JSON", error: "Hasil Gemini tidak dapat dibaca." }, 502);
    }
    const draft = validateDraft(parsed, durationMinutes);
    if (!draft) return jsonResponse({ code: "INCOMPLETE_GEMINI_DRAFT", error: "Draf Gemini tidak lengkap atau alokasi waktunya tidak valid." }, 502);
    return jsonResponse({ draft });
  } catch (error) {
    console.error("Generate-rpl gagal:", error);
    return jsonResponse({ code: "GEMINI_UNAVAILABLE", error: "Layanan AI tidak dapat dihubungi saat ini." }, 502);
  }
});
