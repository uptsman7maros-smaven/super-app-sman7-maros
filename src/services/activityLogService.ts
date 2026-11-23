import { getCachedSupabaseSession, getValidSupabaseSession, supabase } from "../lib/supabase";

export type AppActivityInput = {
  actorId?: string;
  actorLabel?: string;
  actorRole?: string;
  action: string;
  moduleKey: string;
  details: string;
};

export function normalizeActivityActorLabel(label: string | null | undefined, role?: string | null) {
  const normalizedLabel = label?.trim() ?? "";
  const normalizedRole = role?.trim().toLocaleLowerCase("id-ID").replace(/[\s-]+/g, "_");
  if (
    normalizedRole === "super_admin" ||
    normalizedLabel.toLocaleLowerCase("id-ID").includes("fdhlbilaal13@gmail.com") ||
    ["super_admin", "super admin"].includes(normalizedLabel.toLocaleLowerCase("id-ID"))
  ) {
    return "Administrator";
  }
  return normalizedLabel || "Pengguna";
}

export async function logAppActivity(input: AppActivityInput): Promise<void> {
  const session = input.actorId ? getCachedSupabaseSession() : await getValidSupabaseSession();
  const authUser = session?.user ?? null;
  const actorId = input.actorId?.trim() || authUser?.id;
  if (!actorId) {
    throw new Error("ID pengguna tidak tersedia untuk mencatat aktivitas.");
  }
  const metadataName = authUser?.user_metadata?.full_name;
  const metadataRole = authUser?.app_metadata?.role;
  const actorRole = input.actorRole || (typeof metadataRole === "string" ? metadataRole : undefined);
  const actorLabel = normalizeActivityActorLabel(input.actorLabel?.trim() ||
    (typeof metadataName === "string" ? metadataName : "") ||
    authUser?.email ||
    "Pengguna", actorRole);

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
