import { getValidSupabaseSession, supabase } from "../lib/supabase";

export type AppActivityInput = {
  actorId?: string;
  actorLabel?: string;
  action: string;
  moduleKey: string;
  details: string;
};

export async function logAppActivity(input: AppActivityInput): Promise<void> {
  const session = input.actorId ? null : await getValidSupabaseSession();
  const authUser = session?.user ?? null;
  const actorId = input.actorId?.trim() || authUser?.id;
  if (!actorId) {
    throw new Error("ID pengguna tidak tersedia untuk mencatat aktivitas.");
  }
  const metadataName = authUser?.user_metadata?.full_name;
  const actorLabel = input.actorLabel?.trim() ||
    (typeof metadataName === "string" ? metadataName : "") ||
    authUser?.email ||
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
