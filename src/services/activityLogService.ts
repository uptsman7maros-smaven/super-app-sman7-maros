import { supabase } from "../lib/supabase";

export type AppActivityInput = {
  actorId?: string;
  actorLabel?: string;
  action: string;
  moduleKey: string;
  details: string;
};

export async function logAppActivity(input: AppActivityInput): Promise<void> {
  const { data: authData, error: authError } = input.actorId
    ? { data: { user: null }, error: null }
    : await supabase.auth.getUser();
  if (authError) {
    throw new Error(`Pengguna aktivitas tidak dapat diverifikasi: ${authError.message}`);
  }
  const actorId = input.actorId?.trim() || authData.user?.id;
  if (!actorId) {
    throw new Error("ID pengguna tidak tersedia untuk mencatat aktivitas.");
  }
  const metadataName = authData.user?.user_metadata?.full_name;
  const actorLabel = input.actorLabel?.trim() ||
    (typeof metadataName === "string" ? metadataName : "") ||
    authData.user?.email ||
    "Pengguna";

  const { error } = await supabase.from("app_activity_logs").insert({
    actor_id: actorId,
    actor_label: actorLabel,
    action: input.action,
    module_key: input.moduleKey,
    details: input.details,
  });

  if (error) {
    throw new Error(`Log aktivitas ${input.moduleKey} gagal disimpan: ${error.message}`);
  }
}
