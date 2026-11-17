import { supabase } from "./supabase";

export async function login(
  email: string,
  password: string
) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) throw error;
  if (!data.user) throw new Error("Pengguna tidak ditemukan.");

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, full_name, role, status")
    .eq("id", data.user.id)
    .maybeSingle();

  if (profileError || !profile) {
    await supabase.auth.signOut();
    throw new Error("Profil pengguna belum tersedia.");
  }

  if (profile.status !== "active" || profile.role === "pending") {
    await supabase.auth.signOut();
    throw new Error("Akun belum aktif. Hubungi administrator.");
  }

  return profile;
}