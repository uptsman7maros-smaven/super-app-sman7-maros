
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

export type MasterAccountDeletionResult = {
  id: string;
  deleted: boolean;
  masterRecordDeleted: boolean;
  accountDeleted: boolean;
  accountFound?: boolean;
  error?: string;
};

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

async function invokeManageUsersAction(
  action: string,
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const { data, error } = await supabase.functions.invoke("manage-users", {
    body: { action, ...payload },
  });

  if (error) {
    const response = functionErrorResponse(error);
    let responseMessage = "";
    if (response) {
      try {
        const body: unknown = await response.clone().json();
        if (body && typeof body === "object" && "error" in body && typeof body.error === "string") {
          responseMessage = body.error;
        }
      } catch {
        responseMessage = "";
      }
    }
    throw new Error(responseMessage || error.message || "Permintaan pengelolaan akun gagal.");
  }

  if (!data || typeof data !== "object") {
    throw new Error("Respons pengelolaan akun tidak valid.");
  }
  if ("error" in data && typeof data.error === "string") {
    throw new Error(data.error);
  }
  return data as Record<string, unknown>;
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

export async function deleteMasterRecords(
  masterType: "students" | "teachers",
  ids: string[],
): Promise<MasterAccountDeletionResult[]> {
  if (ids.length < 1 || ids.length > 100) {
    throw new Error("Pilih antara 1 sampai 100 data untuk dihapus.");
  }

  const data = await invokeManageUsersAction("delete-master-records", {
    master_type: masterType,
    ids,
  });
  if (!Array.isArray(data.results)) {
    throw new Error("Respons penghapusan data induk tidak valid.");
  }

  return data.results.map((result: unknown) => {
    if (!result || typeof result !== "object") {
      throw new Error("Hasil penghapusan data induk tidak valid.");
    }
    const row = result as Record<string, unknown>;
    if (
      typeof row.id !== "string" ||
      typeof row.deleted !== "boolean" ||
      typeof row.masterRecordDeleted !== "boolean" ||
      typeof row.accountDeleted !== "boolean"
    ) {
      throw new Error("Hasil penghapusan data induk tidak lengkap.");
    }
    return {
      id: row.id,
      deleted: row.deleted,
      masterRecordDeleted: row.masterRecordDeleted,
      accountDeleted: row.accountDeleted,
      ...(typeof row.accountFound === "boolean" ? { accountFound: row.accountFound } : {}),
      ...(typeof row.error === "string" ? { error: row.error } : {}),
    };
  });
}

export async function syncStudentManagedAccount(studentId: string): Promise<void> {
  const data = await invokeManageUsersAction("sync-student-status", { student_id: studentId });
  if (!Array.isArray(data.results)) {
    throw new Error("Respons sinkronisasi akun siswa tidak valid.");
  }
  const result = data.results[0] as { error?: unknown } | undefined;
  if (typeof result?.error === "string") throw new Error(result.error);
}

export async function syncStudentManagedAccounts(studentIds: string[]): Promise<void> {
  if (studentIds.length < 1 || studentIds.length > 100) {
    throw new Error("Pilih antara 1 sampai 100 siswa untuk sinkronisasi akun.");
  }
  const data = await invokeManageUsersAction("sync-student-status", { student_ids: studentIds });
  if (!Array.isArray(data.results)) {
    throw new Error("Respons sinkronisasi akun siswa tidak valid.");
  }
  const failures = data.results
    .filter((result: unknown) =>
      result &&
      typeof result === "object" &&
      "error" in result &&
      typeof result.error === "string"
    )
    .map((result: { id?: unknown; error?: unknown }) =>
      `${typeof result.id === "string" ? `${result.id}: ` : ""}${String(result.error)}`
    );
  if (failures.length) {
    throw new Error(failures.slice(0, 3).join(" "));
  }
}

export async function syncTeacherManagedAccount(teacherId: string): Promise<void> {
  await invokeManageUsersAction("sync-teacher-account", { teacher_id: teacherId });
}
