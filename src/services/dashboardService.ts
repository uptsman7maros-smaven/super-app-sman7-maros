import { supabase } from "../lib/supabase";

export type DashboardAccount = {
  id: string;
  username: string;
  role: string;
  full_name?: string | null;
  student_id?: string | null;
  teacher_id?: string | null;
  class_id?: string | null;
};

export type DashboardNotification = {
  id: string;
  title: string;
  body: string;
  module: string;
  page: string;
  createdAt: string | null;
  unread: boolean;
};

export type DashboardActivity = {
  id: string;
  title: string;
  detail: string;
  module: string;
  createdAt: string | null;
};

export type DashboardFeed = {
  notifications: DashboardNotification[];
  activities: DashboardActivity[];
  summary: {
    unreadBkAlerts: number | null;
    openBkCases: number | null;
  };
  errors: string[];
};

type DashboardRow = Record<string, unknown>;
type QueryResult = {
  data: unknown;
  error: { message: string } | null;
};

const isRecord = (value: unknown): value is DashboardRow =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const fieldText = (row: DashboardRow, key: string, fallback = "") =>
  typeof row[key] === "string" ? row[key] as string : fallback;

const fieldDate = (row: DashboardRow, key: string) =>
  typeof row[key] === "string" ? row[key] as string : null;

function schoolDate(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Makassar",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  if (!year || !month || !day) {
    throw new Error("Tanggal sekolah tidak dapat ditentukan.");
  }
  return `${year}-${month}-${day}`;
}

function addDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function informationPageForRole(role: string) {
  if (role === "siswa" || role === "guru" || role === "tendik" || role === "staff_tata_usaha") {
    return role === "siswa" || role === "guru" ? "Akademik" : "Persuratan";
  }
  if (role === "guru_bk") return "Bimbingan dan Konseling";
  return "Laporan & Analitik";
}

export async function loadDashboardFeed(account: DashboardAccount): Promise<DashboardFeed> {
  const notifications: DashboardNotification[] = [];
  const activities: DashboardActivity[] = [];
  const summary: DashboardFeed["summary"] = {
    unreadBkAlerts: null,
    openBkCases: null,
  };
  const errors: string[] = [];

  async function collectRows(
    label: string,
    query: PromiseLike<QueryResult>,
    consume: (rows: DashboardRow[]) => void,
  ) {
    try {
      const result = await query;
      if (result.error) {
        errors.push(`${label}: ${result.error.message}`);
        return;
      }
      const rows = Array.isArray(result.data) ? result.data.filter(isRecord) : [];
      consume(rows);
    } catch (error) {
      errors.push(`${label}: ${error instanceof Error ? error.message : String(error)}`);
      return;
    }
  }

  function addNotification(
    id: string,
    title: string,
    body: string,
    module: string,
    page: string,
    createdAt: string | null,
    unread = true,
  ) {
    notifications.push({ id, title, body, module, page, createdAt, unread });
  }

  await collectRows(
    "Notifikasi sekolah",
    supabase.from("school_notifications")
      .select("id,title,body,category,is_read,created_at")
      .order("created_at", { ascending: false })
      .limit(10),
    (rows) => {
      rows.forEach((row, index) => {
        addNotification(
          `school-${fieldText(row, "id", String(index))}`,
          fieldText(row, "title", "Notifikasi sekolah"),
          fieldText(row, "body"),
          fieldText(row, "category", "Sekolah"),
          informationPageForRole(account.role),
          fieldDate(row, "created_at"),
          row.is_read === false,
        );
      });
    },
  );

  await collectRows(
    "Pengumuman sekolah",
    supabase.from("school_announcements")
      .select("id,title,audience,published_at,is_published")
      .eq("is_published", true)
      .order("published_at", { ascending: false })
      .limit(5),
    (rows) => rows.forEach((row, index) => addNotification(
      `announcement-${fieldText(row, "id", String(index))}`,
      fieldText(row, "title", "Pengumuman sekolah"),
      `Ditujukan kepada ${fieldText(row, "audience", "pengguna sekolah")}`,
      "Pengumuman",
      informationPageForRole(account.role),
      fieldDate(row, "published_at"),
      false,
    )),
  );

  const today = schoolDate(new Date());
  const soon = addDays(today, 3);
  const actionableLetterStatuses = ["submitted", "resubmitted", "in_review"];

  if (account.role === "siswa") {
    if (account.class_id) {
      await collectRows(
        "Tugas akademik",
        supabase.from("academic_records")
          .select("id,title,due_date,status")
          .eq("class_id", account.class_id)
          .eq("category", "Tugas Kelas")
          .neq("status", "Selesai")
          .gte("due_date", today)
          .lte("due_date", soon)
          .order("due_date", { ascending: true })
          .limit(5),
        (rows) => rows.forEach((row, index) => addNotification(
          `student-task-${fieldText(row, "id", String(index))}`,
          fieldText(row, "title", "Tugas kelas"),
          `Tenggat ${fieldText(row, "due_date", "segera")}`,
          "Akademik",
          "Akademik",
          fieldDate(row, "due_date"),
        )),
      );
    }

  } else if (account.role === "guru" && account.teacher_id) {
    await collectRows(
      "Tugas akademik",
      supabase.from("academic_records")
        .select("id,title,due_date,status")
        .eq("teacher_id", account.teacher_id)
        .in("category", ["Tugas Kelas", "Administrasi Guru", "Perangkat Ajar"])
        .neq("status", "Selesai")
        .gte("due_date", today)
        .lte("due_date", soon)
        .order("due_date", { ascending: true })
        .limit(5),
      (rows) => rows.forEach((row, index) => addNotification(
        `teacher-task-${fieldText(row, "id", String(index))}`,
        fieldText(row, "title", "Tugas akademik"),
        `Tenggat ${fieldText(row, "due_date", "segera")}`,
        "Akademik",
        "Akademik",
        fieldDate(row, "due_date"),
      )),
    );
  }

  if (["guru", "guru_bk", "staff_tata_usaha", "tendik"].includes(account.role)) {
    await collectRows(
      "Status pengajuan surat",
      supabase.from("letter_requests")
        .select("id,subject,status,created_at")
        .eq("requester_id", account.id)
        .in("status", actionableLetterStatuses)
        .order("created_at", { ascending: false })
        .limit(5),
      (rows) => rows.forEach((row, index) => addNotification(
        `requester-letter-${fieldText(row, "id", String(index))}`,
        fieldText(row, "subject", "Pengajuan surat"),
        `Status: ${fieldText(row, "status", "diproses")}`,
        "Persuratan",
        "Persuratan",
        fieldDate(row, "created_at"),
      )),
    );
  }

  if (account.role === "guru_bk") {
    const [alertCount, caseCount] = await Promise.all([
      supabase.from("attendance_bk_alerts")
        .select("id", { count: "exact", head: true })
        .eq("is_read", false),
      supabase.from("kb_catatan_bk")
        .select("id", { count: "exact", head: true })
        .neq("status_kasus", "Selesai"),
    ]);
    if (alertCount.error) errors.push(`Jumlah peringatan BK: ${alertCount.error.message}`);
    else summary.unreadBkAlerts = alertCount.count;
    if (caseCount.error) errors.push(`Jumlah kasus BK aktif: ${caseCount.error.message}`);
    else summary.openBkCases = caseCount.count;

    await collectRows(
      "Peringatan absensi BK",
      supabase.from("attendance_bk_alerts")
        .select("id,student_name,attendance_date,title")
        .eq("is_read", false)
        .order("attendance_date", { ascending: false })
        .limit(5),
      (rows) => rows.forEach((row, index) => addNotification(
        `bk-alert-${fieldText(row, "id", String(index))}`,
        fieldText(row, "title", "Peringatan absensi"),
        `${fieldText(row, "student_name", "Siswa")} · ${fieldText(row, "attendance_date")}`,
        "BK",
        "Bimbingan dan Konseling",
        fieldDate(row, "attendance_date"),
      )),
    );
    await collectRows(
      "Kasus BK",
      supabase.from("kb_catatan_bk")
        .select("id,nama_siswa,status_kasus,tanggal_kontrol")
        .neq("status_kasus", "Selesai")
        .order("tanggal_kontrol", { ascending: true })
        .limit(5),
      (rows) => rows.forEach((row, index) => addNotification(
        `bk-case-${fieldText(row, "id", String(index))}`,
        "Kasus BK perlu tindak lanjut",
        `${fieldText(row, "nama_siswa", "Siswa")} · ${fieldText(row, "status_kasus", "Terbuka")}`,
        "BK",
        "Bimbingan dan Konseling",
        fieldDate(row, "tanggal_kontrol"),
      )),
    );
  }

  const isSchoolManager = [
    "super_admin",
    "kepala_sekolah",
    "operator",
    "kepala_tata_usaha",
  ].includes(account.role);

  if (isSchoolManager) {
    await collectRows(
      "Antrean persuratan",
      supabase.from("letter_requests")
        .select("id,subject,status,created_at")
        .in("status", actionableLetterStatuses)
        .order("created_at", { ascending: false })
        .limit(5),
      (rows) => rows.forEach((row, index) => addNotification(
        `letter-queue-${fieldText(row, "id", String(index))}`,
        "Pengajuan surat menunggu pemeriksaan",
        `${fieldText(row, "subject", "Pengajuan surat")} · ${fieldText(row, "status")}`,
        "Persuratan",
        "Persuratan",
        fieldDate(row, "created_at"),
      )),
    );
  }

  if (["super_admin", "kepala_sekolah", "kepala_tata_usaha"].includes(account.role)) {
    await collectRows(
      "Antrean keuangan",
      supabase.from("finance_transactions")
        .select("id,description,amount,transaction_date")
        .eq("status", "menunggu")
        .order("transaction_date", { ascending: false })
        .limit(5),
      (rows) => rows.forEach((row, index) => addNotification(
        `finance-${fieldText(row, "id", String(index))}`,
        "Transaksi menunggu persetujuan",
        `${fieldText(row, "description", "Transaksi")} · Rp ${String(row.amount ?? "—")}`,
        "Keuangan",
        "Keuangan",
        fieldDate(row, "transaction_date"),
      )),
    );
  }

  if (isSchoolManager) {
    await collectRows(
      "Laporan inventaris",
      supabase.from("inv_issues")
        .select("id,asset_name,issue_type,status,reported_at")
        .neq("status", "Selesai")
        .order("reported_at", { ascending: false })
        .limit(5),
      (rows) => rows.forEach((row, index) => addNotification(
        `inventory-${fieldText(row, "id", String(index))}`,
        "Laporan inventaris perlu tindak lanjut",
        `${fieldText(row, "asset_name", "Aset")} · ${fieldText(row, "issue_type", fieldText(row, "status"))}`,
        "Inventaris",
        "Inventaris",
        fieldDate(row, "reported_at"),
      )),
    );
  }

  if (isSchoolManager || account.role === "staff_tata_usaha") {
    await collectRows(
      "Log aktivitas",
      supabase.from("app_activity_logs")
        .select("id,actor_label,action,module_key,details,created_at")
        .order("created_at", { ascending: false })
        .limit(6),
      (rows) => rows.forEach((row, index) => activities.push({
        id: fieldText(row, "id", `activity-${index}`),
        title: `${fieldText(row, "action", "Aktivitas")} · ${fieldText(row, "module_key", "Modul")}`,
        detail: `${fieldText(row, "actor_label", "Pengguna")}${fieldText(row, "details") ? ` — ${fieldText(row, "details")}` : ""}`,
        module: fieldText(row, "module_key", "Sistem"),
        createdAt: fieldDate(row, "created_at"),
      })),
    );
  }

  notifications.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
  return {
    notifications: notifications.slice(0, 12),
    activities: activities.slice(0, 6),
    summary,
    errors,
  };
}
