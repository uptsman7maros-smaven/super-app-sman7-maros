import { useEffect, useRef, useState } from "react";
import { supabase } from "./lib/supabase";
import "./PemilihanOSIS.css";

const eosisAdminRpcNames = new Set([
  "get_public_settings",
  "admin_login",
  "get_dashboard_stats",
  "get_voting_results",
  "get_class_stats",
  "get_classes_v3",
  "get_voter_registry_v3",
  "get_system_sync_status_v3",
  "set_voting_status",
  "reset_voting_results",
  "save_candidate",
  "delete_candidate",
  "save_school_settings_v3",
  "add_class",
  "delete_class_v3",
  "import_students",
  "eosis_sync_voters_from_datainduk",
  "add_admin_v4",
  "get_admins_v4",
  "delete_admin_v4",
  "eosis_current_student",
  "get_candidates",
  "eosis_cast_vote",
]);

type EosisAdminRpcRequest = {
  type: "eosis-admin-rpc";
  requestId: string;
  name: string;
  args: Record<string, unknown>;
};

function isEosisAdminRpcRequest(value: unknown): value is EosisAdminRpcRequest {
  if (typeof value !== "object" || value === null) return false;
  const request = value as Record<string, unknown>;
  return request.type === "eosis-admin-rpc"
    && typeof request.requestId === "string"
    && typeof request.name === "string"
    && typeof request.args === "object"
    && request.args !== null
    && !Array.isArray(request.args);
}

function getRpcErrorPayload(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (typeof error !== "object" || error === null) return { message, code: "" };

  return {
    message,
    code: "code" in error && typeof error.code === "string" ? error.code : "",
    details: "details" in error && typeof error.details === "string" ? error.details : undefined,
    hint: "hint" in error && typeof error.hint === "string" ? error.hint : undefined,
  };
}

export default function PemilihanOSISModule({ hasAuthenticatedUser }: { hasAuthenticatedUser: boolean }) {
  const [isLoaded, setIsLoaded] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    async function handleMessage(event: MessageEvent<unknown>) {
      const frame = iframeRef.current;
      if (
        event.origin !== window.location.origin
        || event.source !== frame?.contentWindow
        || !isEosisAdminRpcRequest(event.data)
        || !eosisAdminRpcNames.has(event.data.name)
      ) {
        return;
      }

      const request = event.data;
      if (request.name !== "get_public_settings" && !hasAuthenticatedUser) {
        frame.contentWindow?.postMessage({
          type: "eosis-admin-rpc-result",
          requestId: request.requestId,
          data: null,
          error: {
            message: "Sesi Super App tidak aktif. Masuk kembali melalui Super App.",
            code: "SESSION_REQUIRED",
          },
        }, event.origin);
        return;
      }

      try {
        const { data, error } = await supabase.rpc(request.name, request.args);
        frame.contentWindow?.postMessage({
          type: "eosis-admin-rpc-result",
          requestId: request.requestId,
          data,
          error: error ? {
            message: error.message,
            code: error.code,
            details: error.details,
            hint: error.hint,
          } : null,
        }, event.origin);
      } catch (error) {
        frame.contentWindow?.postMessage({
          type: "eosis-admin-rpc-result",
          requestId: request.requestId,
          data: null,
          error: getRpcErrorPayload(error),
        }, event.origin);
      }
    }

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [hasAuthenticatedUser]);

  return (
    <div className="osis-module">
      {!isLoaded && (
        <div className="osis-loading-overlay" role="status" aria-live="polite">
          <span className="osis-loading-spinner" />
          <strong>Memuat Pemilihan OSIS...</strong>
          <small>Menyiapkan aplikasi pemungutan suara digital</small>
        </div>
      )}
      <iframe
        ref={iframeRef}
        className={`osis-frame ${isLoaded ? "is-loaded" : ""}`}
        src="/eosis/index.html"
        title="Aplikasi Pemilihan eOSIS"
        allowFullScreen
        onLoad={() => setIsLoaded(true)}
      />
    </div>
  );
}
