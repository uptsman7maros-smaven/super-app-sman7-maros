import { createClient, type Session } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !key) {
  throw new Error(
    "Konfigurasi Supabase belum lengkap. Set VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY pada environment aplikasi.",
  );
}

function getErrorStatus(error: unknown) {
  return typeof error === "object" && error !== null && "status" in error
    ? Number(error.status)
    : 0;
}

function authFailureResponse(error: unknown) {
  const status = getErrorStatus(error);
  const responseStatus = status === 429
    ? 429
    : status === 503 || isSupabaseRateLimitError(error)
      ? 503
      : 401;
  const message = error instanceof Error
    ? error.message
    : "Sesi Supabase tidak tersedia. Silakan masuk kembali.";

  return new Response(
    JSON.stringify({ code: "session_unavailable", message }),
    { status: responseStatus, headers: { "Content-Type": "application/json" } },
  );
}

function retryableSessionRateLimitResponse(retryAfterMs: number) {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (retryAfterMs > 0) {
    headers.set("Retry-After", String(Math.ceil(retryAfterMs / 1000)));
  }
  return new Response(
    JSON.stringify({
      code: "session_rate_limited",
      message: "Supabase membatasi pembaruan sesi sementara. Sesi dipertahankan dan akan dicoba lagi.",
    }),
    { status: 503, statusText: "Service Unavailable", headers },
  );
}

function getRetryAfterMs(value: string | null) {
  if (!value) return 0;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const retryAt = Date.parse(value);
  return Number.isNaN(retryAt) ? 0 : Math.max(0, retryAt - Date.now());
}

function isProtectedSupabaseRequest(url: URL) {
  if (url.pathname.includes("/rest/v1/") || url.pathname.includes("/storage/v1/")) {
    return true;
  }
  return (
    url.pathname.includes("/functions/v1/") &&
    !url.pathname.endsWith("/functions/v1/login-username")
  );
}

function isPublicMaintenanceStatusRead(
  url: URL,
  input: RequestInfo | URL,
  init?: RequestInit,
) {
  const method = init?.method ?? (input instanceof Request ? input.method : "GET");
  return method.toUpperCase() === "GET"
    && url.pathname.endsWith("/rest/v1/app_maintenance_status");
}

function isRefreshTokenRequest(input: RequestInfo | URL) {
  const requestUrl = typeof input === "string"
    ? input
    : input instanceof URL
      ? input.href
      : input.url;
  try {
    const url = new URL(requestUrl);
    return url.pathname.endsWith("/auth/v1/token") &&
      url.searchParams.get("grant_type") === "refresh_token";
  } catch {
    return false;
  }
}

async function fetchAuthRequest(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const isRefreshRequest = isRefreshTokenRequest(input);
  if (isRefreshRequest && Date.now() < sessionRetryAfter) {
    return retryableSessionRateLimitResponse(sessionRetryAfter - Date.now());
  }

  const requestSignal = init?.signal ??
    (typeof Request !== "undefined" && input instanceof Request ? input.signal : undefined);
  const controller = new AbortController();
  let timedOut = false;
  const timeoutId = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, 15_000);
  const abortRequest = () => controller.abort(requestSignal?.reason);

  if (requestSignal?.aborted) {
    abortRequest();
  } else {
    requestSignal?.addEventListener("abort", abortRequest, { once: true });
  }

  try {
    const response = await fetch(input, { ...init, signal: controller.signal });
    if (isRefreshRequest && response.status === 429) {
      rememberSessionRateLimit({
        status: 429,
        message: "Supabase membatasi pembaruan sesi sementara.",
      }, getRetryAfterMs(response.headers.get("Retry-After")));
      // Supabase Auth treats 429 as permanent; 503 keeps the session retryable.
      return retryableSessionRateLimitResponse(sessionRetryAfter - Date.now());
    }
    return response;
  } catch (error) {
    if (timedOut) {
      throw new Error(
        "Permintaan autentikasi Supabase melewati batas waktu.",
        { cause: error },
      );
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
    requestSignal?.removeEventListener("abort", abortRequest);
  }
}

async function authenticatedFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const requestUrl = typeof input === "string"
    ? input
    : input instanceof URL
      ? input.href
      : input.url;
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(requestUrl);
  } catch {
    return fetch(input, init);
  }

  if (parsedUrl.pathname.includes("/auth/v1/")) {
    return fetchAuthRequest(input, init);
  }

  if (
    !isProtectedSupabaseRequest(parsedUrl) ||
    isPublicMaintenanceStatusRead(parsedUrl, input, init)
  ) {
    return fetch(input, init);
  }

  const sendWithSession = (accessToken: string) => {
    const request = typeof Request !== "undefined" && input instanceof Request
      ? input.clone()
      : input;
    const headers = new Headers(
      init?.headers ??
        (typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined),
    );
    headers.set("Authorization", `Bearer ${accessToken}`);
    return fetch(request, { ...init, headers });
  };

  let session;
  try {
    session = await getValidSupabaseSession();
  } catch (error) {
    return authFailureResponse(error);
  }

  if (!session) {
    return authFailureResponse(new Error("Sesi login tidak aktif. Silakan masuk kembali."));
  }

  const response = await sendWithSession(session.access_token);
  if (response.status !== 401) return response;

  try {
    const latestSession = cachedSession;
    const retrySession = latestSession && latestSession.access_token !== session.access_token
      ? latestSession
      : await refreshSupabaseSession();

    if (!retrySession) return response;

    const retryResponse = await sendWithSession(retrySession.access_token);
    if (retryResponse.status === 401) {
      const { error: signOutError } = await supabase.auth.signOut({ scope: "local" });
      if (signOutError) throw signOutError;
      cachedSession = null;
    }
    return retryResponse;
  } catch (error) {
    return authFailureResponse(error);
  }
}

export const supabase = createClient(url, key, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
  global: { fetch: authenticatedFetch },
});

let cachedSession: Session | null = null;
let sessionRetryAfter = 0;
let sessionRateLimitError: unknown = null;
let sessionRateLimitAttempts = 0;
let lastSessionRateLimitAt = 0;
const SESSION_RATE_LIMIT_BASE_MS = 60_000;
const SESSION_RATE_LIMIT_MAX_MS = 15 * 60_000;
const SESSION_RATE_LIMIT_DEDUP_MS = 30_000;

function clearSessionRateLimit() {
  sessionRetryAfter = 0;
  sessionRateLimitError = null;
  sessionRateLimitAttempts = 0;
  lastSessionRateLimitAt = 0;
}

supabase.auth.onAuthStateChange((event, session) => {
  cachedSession = session;
  if (event === "SIGNED_IN" || event === "SIGNED_OUT" || (event === "TOKEN_REFRESHED" && session)) {
    clearSessionRateLimit();
  }
});

let refreshPromise: Promise<Session | null> | null = null;
let sessionPromise: Promise<Session | null> | null = null;

export function isSupabaseRateLimitError(error: unknown) {
  if (getErrorStatus(error) === 429) return true;
  const message = error instanceof Error ? error.message : "";
  return /rate limit|membatasi pembaruan sesi/i.test(message);
}

export function getSupabaseSessionRetryDelayMs() {
  return Math.max(0, sessionRetryAfter - Date.now());
}

function rememberSessionRateLimit(error: unknown, serverRetryAfterMs = 0) {
  if (!isSupabaseRateLimitError(error)) return;
  const now = Date.now();
  if (now - lastSessionRateLimitAt > SESSION_RATE_LIMIT_DEDUP_MS) {
    sessionRateLimitAttempts += 1;
  }
  lastSessionRateLimitAt = now;
  const backoffMs = Math.min(
    SESSION_RATE_LIMIT_BASE_MS * 2 ** Math.max(0, sessionRateLimitAttempts - 1),
    SESSION_RATE_LIMIT_MAX_MS,
  );
  const retryAfterMs = Math.min(
    SESSION_RATE_LIMIT_MAX_MS,
    Math.max(backoffMs, serverRetryAfterMs),
  );
  sessionRateLimitError = error instanceof Error
    ? error
    : new Error("Supabase membatasi pembaruan sesi sementara.");
  sessionRetryAfter = Math.max(sessionRetryAfter, now + retryAfterMs);
}

function refreshSupabaseSession() {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        const { data, error } = await supabase.auth.refreshSession();
        if (error) throw error;

        clearSessionRateLimit();
        return data.session;
      } catch (error) {
        rememberSessionRateLimit(error);
        const status = getErrorStatus(error);
        if (status === 400 || status === 401) {
          const { error: signOutError } = await supabase.auth.signOut({ scope: "local" });
          if (signOutError) throw signOutError;
          cachedSession = null;
          return null;
        }
        throw error;
      }
    })().finally(() => {
      refreshPromise = null;
    });
  }

  return refreshPromise;
}

export async function getValidSupabaseSession() {
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (
    cachedSession &&
    typeof cachedSession.expires_at === "number" &&
    cachedSession.expires_at > nowSeconds
  ) {
    return cachedSession;
  }

  if (Date.now() < sessionRetryAfter) {
    throw sessionRateLimitError instanceof Error
      ? sessionRateLimitError
      : new Error("Supabase membatasi pembaruan sesi sementara. Coba lagi sebentar lagi.");
  }

  if (!sessionPromise) {
    sessionPromise = (async () => {
      let timeoutId = 0;
      const sessionTimeout = new Promise<never>((_, reject) => {
        timeoutId = window.setTimeout(
          () => reject(new Error("Verifikasi sesi Supabase melewati batas waktu.")),
          20_000,
        );
      });

      try {
        const { data, error } = await Promise.race([
          supabase.auth.getSession(),
          sessionTimeout,
        ]);
        if (error) throw error;

        cachedSession = data.session;
        clearSessionRateLimit();
        return data.session;
      } catch (error) {
        rememberSessionRateLimit(error);
        throw error;
      } finally {
        window.clearTimeout(timeoutId);
      }
    })().finally(() => {
      sessionPromise = null;
    });
  }

  return sessionPromise;
}