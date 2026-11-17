import { supabase } from "../lib/supabase";

export type MaintenanceStatus = {
  id: number;
  is_active: boolean;
  message: string;
  updated_at: string;
  updated_by: string | null;
};

let maintenanceChannelId = 0;

function isMaintenanceStatus(value: unknown): value is MaintenanceStatus {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return row.id === 1
    && typeof row.is_active === "boolean"
    && typeof row.message === "string"
    && typeof row.updated_at === "string"
    && (row.updated_by === null || typeof row.updated_by === "string");
}

export async function getMaintenanceStatus(): Promise<MaintenanceStatus> {
  const { data, error } = await supabase
    .from("app_maintenance_status")
    .select("id,is_active,message,updated_at,updated_by")
    .eq("id", 1)
    .maybeSingle();

  if (error) throw error;
  if (!isMaintenanceStatus(data)) {
    throw new Error("Status pemeliharaan belum tersedia. Pastikan migrasi sudah diterapkan.");
  }

  return data;
}

export function subscribeToMaintenanceStatus(
  onStatus: (status: MaintenanceStatus) => void,
  onError: (error: Error) => void,
) {
  const channel = supabase
    .channel(`app-maintenance-status-${++maintenanceChannelId}`)
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "app_maintenance_status",
        filter: "id=eq.1",
      },
      (payload) => {
        if (!isMaintenanceStatus(payload.new)) {
          onError(new Error("Pembaruan status pemeliharaan tidak valid."));
          return;
        }
        onStatus(payload.new);
      },
    )
    .subscribe((status, error) => {
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        onError(error ?? new Error("Sinkronisasi status pemeliharaan terputus."));
      }
    });

  return () => {
    void supabase.removeChannel(channel);
  };
}
