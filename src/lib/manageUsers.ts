
import { supabase } from "./supabase";

export type ManagedUser = {
  id: string;
  username: string;
  full_name: string;
  role: string;
  status: string;
  created_at: string;
};

export type CreateManagedUserInput = {
  username: string;
  full_name: string;
  role: string;
  password: string;
};

export type CreatedManagedUser = Pick<
  ManagedUser,
  "id" | "username" | "full_name" | "role" | "status"
>;

function functionErrorResponse(error: unknown): Response | null {
  if (
    !error ||
    typeof error !== "object" ||
    !("context" in error) ||
    !(error.context instanceof Response)
  ) {
    return null;
  }
  return error.context;
}

export async function createManagedUser(
  input: CreateManagedUserInput,
): Promise<CreatedManagedUser> {
  const { data, error } = await supabase.functions.invoke("manage-users", {
    body: { action: "create", ...input },
  });

  if (error) {
    const response = functionErrorResponse(error);
    let responseMessage = "";
    if (response) {
      try {
        const payload: unknown = await response.clone().json();
        if (
          payload &&
          typeof payload === "object" &&
          "error" in payload &&
          typeof payload.error === "string"
        ) {
          responseMessage = payload.error;
        }
      } catch {
        responseMessage = "";
      }
    }

    const normalizedError = new Error(
      responseMessage || error.message || "Akun gagal dibuat.",
    );
    if (response) {
      Object.defineProperty(normalizedError, "status", {
        value: response.status,
      });
    }
    throw normalizedError;
  }

  if (!data || typeof data !== "object") {
    throw new Error("Respons pembuatan akun tidak valid.");
  }
  const payload = data as { error?: unknown; user?: unknown };
  if (typeof payload.error === "string") {
    throw new Error(payload.error);
  }
  if (!payload.user || typeof payload.user !== "object") {
    throw new Error("Respons pembuatan akun tidak memuat data pengguna.");
  }

  const user = payload.user as Record<string, unknown>;
  if (
    typeof user.id !== "string" ||
    typeof user.username !== "string" ||
    typeof user.full_name !== "string" ||
    typeof user.role !== "string" ||
    typeof user.status !== "string"
  ) {
    throw new Error("Data pengguna pada respons pembuatan akun tidak valid.");
  }

  return {
    id: user.id,
    username: user.username,
    full_name: user.full_name,
    role: user.role,
    status: user.status,
  };
}

export async function getManagedUsers(): Promise<ManagedUser[]> {
  const {
    data,
    error,
  } = await supabase.functions.invoke("manage-users", {
    body: {
      action: "list",
    },
  });

  if (error) {
    console.error("Gagal memanggil manage-users:", error);
    throw new Error(
      "Gagal terhubung ke layanan pengguna. Periksa sesi login dan log Edge Function.",
    );
  }

  if (!data || !Array.isArray(data.users)) {
    console.error("Respons manage-users tidak sesuai:", data);
    throw new Error(
      data?.error || "Respons daftar pengguna tidak valid.",
    );
  }

  return data.users as ManagedUser[];
}
