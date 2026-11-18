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

const allowedAreas = ["Pribadi", "Sosial", "Belajar", "Karir"];
const rplFields = [
  "Tujuan umum",
  "Tujuan khusus",
  "Metode dan teknik",
  "Media / alat",
  "Tahap awal / pendahuluan",
  "Tahap inti",
  "Tahap penutup",
  "Evaluasi proses",
  "Evaluasi hasil",
];

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

function buildRplPrompt(input: {
  topic: string;
  area: string;
  targetClass: string;
  duration: string;
}) {
  return [
    "Susun draf Rencana Pelaksanaan Layanan Bimbingan dan Konseling SMA dalam bahasa Indonesia.",
    "Buat isi praktis, ramah usia, inklusif, dan dapat ditinjau Guru BK.",
    "Jangan mengarang kasus nyata atau meminta/mencantumkan identitas maupun data pribadi siswa.",
    `Topik: ${input.topic}`,
    `Bidang layanan: ${input.area}`,
    `Sasaran kelas/fase: ${input.targetClass || "SMA"}`,
    `Durasi: ${input.duration || "2 x 45 menit"}`,
    "Kembalikan hanya JSON yang mengikuti skema.",
  ].join("\n");
}

function buildAkpdPrompt(targetGrade: string) {
  return [
    "Buat 8 pertanyaan Angket Kebutuhan Peserta Didik yang relevan bagi siswa SMA.",
    "Gunakan bahasa yang netral, tidak menghakimi, dan tidak meminta nama, kontak, atau rincian kasus pribadi.",
    "Sebarkan pertanyaan ke empat bidang layanan: Pribadi, Sosial, Belajar, dan Karir.",
    `Sasaran tingkat: ${targetGrade === "Semua" ? "10, 11, dan 12" : `kelas ${targetGrade}`}.`,
    "Kembalikan hanya JSON yang mengikuti skema.",
  ].join("\n");
}

function validateDraft(action: "rpl" | "akpd", value: unknown) {
  if (!isRecord(value)) return null;

  if (action === "rpl") {
    const draft: Record<string, string> = {};
    for (const field of rplFields) {
      const text = readText(value[field], 3000);
      if (!text) return null;
      draft[field] = text;
    }
    return { fields: draft };
  }

  if (!Array.isArray(value.questions) || value.questions.length < 4 || value.questions.length > 16) {
    return null;
  }
  const questions = value.questions.map(question => {
    if (!isRecord(question)) return null;
    const area = readText(question.area, 20);
    const text = readText(question.text, 500);
    if (!area || !allowedAreas.includes(area) || !text) return null;
    return { area, text };
  });
  if (questions.some(question => question === null)) return null;
  return { questions };
}

Deno.serve(async request => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);

  const authorization = request.headers.get("Authorization");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const geminiApiKey = Deno.env.get("GEMINI_API_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return jsonResponse({ error: "Konfigurasi Supabase tidak lengkap." }, 500);
  }
  if (!authorization) return jsonResponse({ error: "Sesi login diperlukan." }, 401);
  if (!geminiApiKey) return jsonResponse({ error: "Asisten AI belum dikonfigurasi oleh administrator." }, 503);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Permintaan tidak valid." }, 400);
  }
  if (!isRecord(body) || (body.action !== "rpl" && body.action !== "akpd")) {
    return jsonResponse({ error: "Jenis draf tidak valid." }, 400);
  }

  const action = body.action;
  let prompt: string;
  let responseSchema: Record<string, unknown>;
  if (action === "rpl") {
    const topic = readText(body.topic, 300);
    const area = readText(body.area, 20);
    const targetClass = readText(body.targetClass, 80) ?? "";
    const duration = readText(body.duration, 80) ?? "";
    if (!topic || !area || !allowedAreas.includes(area)) {
      return jsonResponse({ error: "Topik dan bidang layanan yang valid wajib diisi." }, 400);
    }
    prompt = buildRplPrompt({ topic, area, targetClass, duration });
    responseSchema = {
      type: "OBJECT",
      properties: Object.fromEntries(rplFields.map(field => [field, { type: "STRING" }])),
      required: rplFields,
    };
  } else {
    const targetGrade = readText(body.targetGrade, 10);
    if (!targetGrade || !["10", "11", "12", "Semua"].includes(targetGrade)) {
      return jsonResponse({ error: "Tingkat sasaran angket tidak valid." }, 400);
    }
    prompt = buildAkpdPrompt(targetGrade);
    responseSchema = {
      type: "OBJECT",
      properties: {
        questions: {
          type: "ARRAY",
          items: {
            type: "OBJECT",
            properties: {
              area: { type: "STRING", enum: allowedAreas },
              text: { type: "STRING" },
            },
            required: ["area", "text"],
          },
        },
      },
      required: ["questions"],
    };
  }

  try {
    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
    });
    const { data: auth, error: authError } = await authClient.auth.getUser();
    if (authError || !auth.user) return jsonResponse({ error: "Sesi login tidak valid." }, 401);

    const serviceClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: profile, error: profileError } = await serviceClient
      .from("profiles")
      .select("role,status")
      .eq("id", auth.user.id)
      .maybeSingle();
    if (profileError) throw profileError;
    if (!profile || profile.status !== "active" || !["guru_bk", "super_admin", "operator"].includes(profile.role)) {
      return jsonResponse({ error: "Asisten draf hanya tersedia bagi Guru BK dan administrator." }, 403);
    }

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": geminiApiKey,
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{
              text: "Anda membantu Guru BK menulis materi pendidikan umum. Jangan meminta atau mengolah data pribadi siswa.",
            }],
          },
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            maxOutputTokens: 3000,
            responseMimeType: "application/json",
            responseSchema,
            temperature: 0.4,
          },
        }),
        signal: AbortSignal.timeout(45_000),
      },
    );
    if (!response.ok) {
      console.error("Permintaan Gemini gagal dengan status", response.status);
      return jsonResponse({
        error: response.status === 429
          ? "Kuota AI sedang penuh. Coba lagi beberapa saat."
          : "Gemini gagal membuat draf. Periksa konfigurasi API dan coba lagi.",
      }, response.status === 429 ? 429 : 502);
    }

    const result: unknown = await response.json();
    if (!isRecord(result) || !Array.isArray(result.candidates)) {
      return jsonResponse({ error: "Respons Gemini tidak sesuai format." }, 502);
    }
    const candidate = result.candidates[0];
    if (!isRecord(candidate) || !isRecord(candidate.content) || !Array.isArray(candidate.content.parts)) {
      return jsonResponse({ error: "Gemini tidak menghasilkan draf yang dapat digunakan." }, 502);
    }
    const text = candidate.content.parts
      .filter(isRecord)
      .map(part => part.text)
      .find((part): part is string => typeof part === "string");
    if (!text) return jsonResponse({ error: "Gemini tidak menghasilkan teks draf." }, 502);

    let draft: unknown;
    try {
      draft = JSON.parse(text);
    } catch {
      return jsonResponse({ error: "Draf Gemini tidak dapat dibaca sebagai JSON." }, 502);
    }
    const validatedDraft = validateDraft(action, draft);
    if (!validatedDraft) return jsonResponse({ error: "Draf Gemini tidak lengkap atau tidak valid." }, 502);
    return jsonResponse({ draft: validatedDraft });
  } catch (error) {
    console.error("Asisten penulisan BK gagal:", error);
    return jsonResponse({ error: "Asisten AI tidak dapat dihubungi saat ini." }, 502);
  }
});
