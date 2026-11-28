import { createClient, type Session } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
const METADATA_CACHE_TTL_MS = 90_000;
const METADATA_CACHE_MAX_ENTRIES = 200;
const metadataResponseCache = new Map<string, {
  table: string;
  response: Response;
  cachedAt: number;
}>();

if (!url || !key) {
  throw new Error(
    "Konfigurasi Supabase belum lengkap. Set VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY pada environment aplikasi.",
  );
}
const authStorageKey = `sb-${new URL(url).hostname.split(".")[0]}-auth-token`;

function retryableApiRateLimitResponse() {
  const retryAfterMs = Math.max(0, apiRetryAfter - Date.now());
  const headers = new Headers({ "Content-Type": "application/json" });
  if (retryAfterMs > 0) headers.set("Retry-After", String(Math.ceil(retryAfterMs / 1000)));
  return new Response(
    JSON.stringify({
      code: "request_rate_limited",
      message: "Supabase membatasi permintaan sementara. Data terakhir tetap digunakan selama jeda.",
    }),
    { status: 429, statusText: "Too Many Requests", headers },
  );
}

function getMetadataTable(url: URL) {
  return url.pathname.match(/\/rest\/v1\/(school_settings|classes|academic_years)$/)?.[1] ?? null;
}

function metadataCacheKey(url: URL, accessToken: string) {
  return `${url.href}:${accessToken}`;
}

function getCachedMetadataResponse(url: URL, accessToken: string) {
  const cacheKey = metadataCacheKey(url, accessToken);
  const cached = metadataResponseCache.get(cacheKey);
  if (!cached) return null;
  if (Date.now() - cached.cachedAt >= METADATA_CACHE_TTL_MS) {
    metadataResponseCache.delete(cacheKey);
    return null;
  }
  return cached.response.clone();
}

function cacheMetadataResponse(table: string, url: URL, accessToken: string, response: Response) {
  const now = Date.now();
  for (const [cacheKey, entry] of metadataResponseCache) {
    if (now - entry.cachedAt >= METADATA_CACHE_TTL_MS) metadataResponseCache.delete(cacheKey);
  }
  metadataResponseCache.set(metadataCacheKey(url, accessToken), {
    table,
    response: response.clone(),
    cachedAt: now,
  });
  while (metadataResponseCache.size > METADATA_CACHE_MAX_ENTRIES) {
    const oldestKey = metadataResponseCache.keys().next().value;
    if (oldestKey === undefined) break;
    metadataResponseCache.delete(oldestKey);
  }
}

function invalidateMetadataCache(table: string) {
  for (const [cacheKey, entry] of metadataResponseCache) {
    if (entry.table === table) metadataResponseCache.delete(cacheKey);
  }
}

function clearApiRateLimit() {
  if (Date.now() < apiRetryAfter) return;
  apiRetryAfter = 0;
  apiRateLimitAttempts = 0;
  lastApiRateLimitAt = 0;
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

  const method = (init?.method ??
    (typeof Request !== "undefined" && input instanceof Request ? input.method : "GET")
  ).toUpperCase();
  const metadataTable = getMetadataTable(parsedUrl);
  const requestHeaders = new Headers(
    typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined,
  );
  new Headers(init?.headers).forEach((value, name) => requestHeaders.set(name, value));
  const sendWithSession = (accessToken: string) => {
    const request = typeof Request !== "undefined" && input instanceof Request
      ? input.clone()
      : input;
    const headers = new Headers(requestHeaders);
    headers.set("Authorization", `Bearer ${accessToken}`);
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

    return fetch(request, { ...init, headers, signal: controller.signal })
      .catch((error: unknown) => {
        if (timedOut) {
          throw new Error("Permintaan Supabase melewati batas waktu.", { cause: error });
        }
        throw error;
      })
      .finally(() => {
        window.clearTimeout(timeoutId);
        requestSignal?.removeEventListener("abort", abortRequest);
      });
  };

  const authorization = requestHeaders.get("Authorization");
  const requestAccessToken = authorization?.match(/^Bearer\s+(.+)$/i)?.[1] ?? null;
  let accessToken = requestAccessToken && requestAccessToken !== key
    ? requestAccessToken
    : cachedSession?.access_token ?? requestAccessToken ?? key;
  let session: Session | null = cachedSession?.access_token === accessToken
    ? cachedSession
    : null;

  const cachedSessionExpiresAt = (session?.expires_at ?? 0) * 1000;
  if (
    session &&
    cachedSessionExpiresAt > 0 &&
    cachedSessionExpiresAt <= Date.now()
  ) {
    try {
      const refreshedSession = await refreshSupabaseSession(session);
      if (refreshedSession) {
        session = refreshedSession;
        accessToken = refreshedSession.access_token;
      } else if (cachedSessionExpiresAt <= Date.now()) {
        return authFailureResponse(new Error("Sesi Supabase telah kedaluwarsa. Silakan masuk kembali."));
      }
    } catch (error) {
      if (cachedSessionExpiresAt <= Date.now()) {
        return authFailureResponse(error);
      }
    }
  }

  if (metadataTable && method === "GET") {
    const cachedResponse = getCachedMetadataResponse(parsedUrl, accessToken);
    if (cachedResponse) return cachedResponse;
  } else if (metadataTable) {
    invalidateMetadataCache(metadataTable);
  }

  if (Date.now() < apiRetryAfter) {
    return retryableApiRateLimitResponse();
  }

  const response = await sendWithSession(accessToken);
  if (response.status === 429) {
    rememberApiRateLimit(response.headers.get("Retry-After"));
    return response;
  }
  if (metadataTable && method === "GET" && response.ok) {
    cacheMetadataResponse(metadataTable, parsedUrl, accessToken, response);
  }
  if (response.status !== 401) {
    if (response.ok) clearApiRateLimit();
    return response;
  }

  try {
    const latestSession = cachedSession;
    const latestSessionStillValid = Boolean(
      latestSession?.access_token &&
      (latestSession.expires_at ?? 0) * 1000 > Date.now(),
    );
    const retrySession = latestSession && latestSessionStillValid &&
      latestSession.access_token !== accessToken
      ? latestSession
      : await getValidSupabaseSession();

    if (!retrySession) return response;
    if (retrySession.access_token === accessToken) {
      if ((retrySession.expires_at ?? 0) * 1000 > Date.now()) return response;
      const refreshedSession = await refreshSupabaseSession(retrySession);
      if (!refreshedSession) return response;
      if (refreshedSession.access_token === accessToken) return response;
      session = refreshedSession;
      accessToken = refreshedSession.access_token;
    } else {
      session = retrySession;
      accessToken = retrySession.access_token;
    }

    const retryResponse = await sendWithSession(accessToken);
    if (retryResponse.status === 429) {
      rememberApiRateLimit(retryResponse.headers.get("Retry-After"));
      return retryResponse;
    }
    if (retryResponse.ok) clearApiRateLimit();
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
    storageKey: authStorageKey,
    persistSession: true,
    autoRefreshToken: false,
    detectSessionInUrl: true,
  },
  global: { fetch: authenticatedFetch },
});

let cachedSession: Session | null = null;
let sessionRetryAfter = 0;
let sessionRateLimitError: unknown = null;
let sessionRateLimitAttempts = 0;
let lastSessionRateLimitAt = 0;
let apiRetryAfter = 0;
let apiRateLimitAttempts = 0;
let lastApiRateLimitAt = 0;
const SESSION_RATE_LIMIT_BASE_MS = 30_000;
const SESSION_RATE_LIMIT_MAX_MS = 15 * 60_000;
const SESSION_RATE_LIMIT_DEDUP_MS = 30_000;

export function getCachedSupabaseSession() {
  return cachedSession;
}

function clearSessionRateLimit() {
  sessionRetryAfter = 0;
  sessionRateLimitError = null;
  sessionRateLimitAttempts = 0;
  lastSessionRateLimitAt = 0;
}

export function clearSupabaseLocalSessionCache() {
  cachedSession = null;
  clearSessionRateLimit();
  for (const storageName of ["localStorage", "sessionStorage"] as const) {
    try {
      window[storageName].removeItem(authStorageKey);
    } catch (error) {
      console.error(`Cache autentikasi Supabase di ${storageName} tidak dapat dihapus:`, error);
    }
  }
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
  const jitterMs = Math.floor(Math.random() * SESSION_RATE_LIMIT_BASE_MS);
  const retryAfterMs = Math.max(backoffMs + jitterMs, serverRetryAfterMs);
  sessionRateLimitError = error instanceof Error
    ? error
    : new Error("Supabase membatasi pembaruan sesi sementara.");
  sessionRetryAfter = Math.max(sessionRetryAfter, now + retryAfterMs);
}

function rememberApiRateLimit(serverRetryAfter: string | null) {
  const now = Date.now();
  if (now - lastApiRateLimitAt > SESSION_RATE_LIMIT_DEDUP_MS) {
    apiRateLimitAttempts += 1;
  }
  lastApiRateLimitAt = now;
  const backoffMs = Math.min(
    SESSION_RATE_LIMIT_BASE_MS * 2 ** Math.max(0, apiRateLimitAttempts - 1),
    SESSION_RATE_LIMIT_MAX_MS,
  );
  const jitterMs = Math.floor(Math.random() * SESSION_RATE_LIMIT_BASE_MS);
  const retryAfterMs = Math.max(backoffMs + jitterMs, getRetryAfterMs(serverRetryAfter));
  apiRetryAfter = Math.max(apiRetryAfter, now + retryAfterMs);
}

function refreshSupabaseSession(fallbackSession: Session | null = null) {
  if (refreshPromise) return refreshPromise;

  if (Date.now() < sessionRetryAfter) {
    return Promise.reject(
      sessionRateLimitError instanceof Error
        ? sessionRateLimitError
        : new Error("Supabase membatasi pembaruan sesi sementara. Coba lagi setelah jeda."),
    );
  }

  refreshPromise = (async () => {
    try {
      const { data, error } = await supabase.auth.refreshSession();
      if (error) throw error;

      cachedSession = data.session;
      clearSessionRateLimit();
      return data.session;
    } catch (error) {
      rememberSessionRateLimit(error);
      const status = getErrorStatus(error);
      if (status === 400 || status === 401) {
        if (
          fallbackSession?.access_token &&
          (fallbackSession.expires_at ?? 0) * 1000 > Date.now()
        ) {
          cachedSession = fallbackSession;
          return fallbackSession;
        }
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

  return refreshPromise;
}

export async function getValidSupabaseSession() {
  if (!sessionPromise) {
    sessionPromise = (async () => {
      let sessionCandidate: Session | null = null;
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
        sessionCandidate = data.session;
        if (!error) cachedSession = data.session;
        const expiresAt = (data.session?.expires_at ?? 0) * 1000;
        const tokenStillValid = Boolean(data.session?.access_token && expiresAt > Date.now());
        if (data.session?.access_token && expiresAt > Date.now()) {
          return data.session;
        }
        if (error) {
          if (tokenStillValid && data.session) return data.session;
          const fallbackSession: Session | null = getCachedSupabaseSession();
          const cachedSessionStillValid = Boolean(
            fallbackSession?.access_token &&
            (fallbackSession.expires_at ?? 0) * 1000 > Date.now(),
          );
          if (cachedSessionStillValid && fallbackSession) return fallbackSession;
          throw error;
        }
        if (!data.session) return null;

        if (Date.now() < sessionRetryAfter) {
          if (data.session.access_token && expiresAt > Date.now()) return data.session;
          throw sessionRateLimitError instanceof Error
            ? sessionRateLimitError
            : new Error("Supabase membatasi pembaruan sesi sementara. Coba lagi setelah jeda.");
        }

        try {
          const refreshedSession = await refreshSupabaseSession(data.session);
          if (refreshedSession) return refreshedSession;
          if (data.session.access_token && expiresAt > Date.now()) return data.session;
          return null;
        } catch (error) {
          if (data.session.access_token && expiresAt > Date.now()) return data.session;
          throw error;
        }
      } catch (error) {
        rememberSessionRateLimit(error);
        const fallbackSession = [sessionCandidate, cachedSession].find(
          (session) => session?.access_token &&
            (session.expires_at ?? 0) * 1000 > Date.now(),
        );
        if (fallbackSession) return fallbackSession;
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