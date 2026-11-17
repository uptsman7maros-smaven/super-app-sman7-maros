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

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const authorization = request.headers.get("Authorization");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return jsonResponse({ error: "Konfigurasi Supabase tidak lengkap." }, 500);
  }
  if (!authorization) return jsonResponse({ error: "Sesi login diperlukan." }, 401);

  let body: { access_id?: unknown };
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Permintaan tidak valid." }, 400);
  }
  const accessId = typeof body.access_id === "string" ? body.access_id : "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(accessId)) {
    return jsonResponse({ error: "Identitas akses digital tidak valid." }, 400);
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
    if (!profile || profile.status !== "active") {
      return jsonResponse({ error: "Akun tidak aktif." }, 403);
    }

    const isSuperAdmin = profile.role === "super_admin";
    let isLibrarian = isSuperAdmin;
    if (!isLibrarian && profile.role === "guru") {
      const { data: assignment, error: assignmentError } = await serviceClient
        .from("library_librarian_assignments")
        .select("profile_id")
        .eq("profile_id", auth.user.id)
        .eq("active", true)
        .maybeSingle();
      if (assignmentError) throw assignmentError;
      isLibrarian = !!assignment;
    }

    const { data: access, error: accessError } = await serviceClient
      .from("library_digital_access")
      .select("id,student_id,digital_book_id,status,expires_at")
      .eq("id", accessId)
      .maybeSingle();
    if (accessError) throw accessError;
    if (!access) return jsonResponse({ error: "Akses buku digital tidak ditemukan." }, 404);

    let expiresInSeconds = 15 * 60;
    if (profile.role === "siswa") {
      if (
        access.student_id !== auth.user.id ||
        access.status !== "active" ||
        !access.expires_at
      ) {
        return jsonResponse({ error: "Akses ini bukan milik Anda atau belum disetujui." }, 403);
      }
      const remainingSeconds = Math.floor(
        (new Date(access.expires_at).getTime() - Date.now()) / 1000,
      );
      if (remainingSeconds <= 0) {
        return jsonResponse({ error: "Waktu akses buku digital telah berakhir." }, 403);
      }
      expiresInSeconds = Math.min(24 * 60 * 60, remainingSeconds);
    } else if (!isLibrarian) {
      return jsonResponse({ error: "Akses buku digital tidak diizinkan." }, 403);
    }

    const { data: book, error: bookError } = await serviceClient
      .from("library_digital_books")
      .select("file_path,active")
      .eq("id", access.digital_book_id)
      .maybeSingle();
    if (bookError) throw bookError;
    if (!book || !book.active) return jsonResponse({ error: "Buku digital tidak tersedia." }, 404);

    const { data: signedFile, error: signedFileError } = await serviceClient.storage
      .from("library-digital-books")
      .createSignedUrl(book.file_path, expiresInSeconds);
    if (signedFileError) throw signedFileError;

    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000).toISOString();
    return jsonResponse({ url: signedFile.signedUrl, expires_at: expiresAt });
  } catch (error) {
    console.error("Gagal membuat tautan buku digital:", error);
    return jsonResponse({ error: "Tidak dapat membuka buku digital saat ini." }, 500);
  }
});
