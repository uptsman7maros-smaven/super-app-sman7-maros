import { createElement, Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ComponentType, ReactNode } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Bell,
  BookOpen,
  BrainCircuit,
  CalendarCheck,
  CalendarDays,
  ChartNoAxesCombined,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  ClipboardList,
  Clock3,
  Command,
  FileText,
  GraduationCap,
  HeartHandshake,
  LayoutDashboard,
  Library,
  LogOut,
  Mail,
  Menu,
  Package,
  PanelLeftClose,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Users,
  UserRoundCheck,
  UserRoundPlus,
  UserRoundX,
  Vote,
  Wallet,
  X,
} from "lucide-react";
import {
  clearSupabaseLocalSessionCache,
  getCachedSupabaseSession,
  getSupabaseSessionRetryDelayMs,
  getValidSupabaseSession,
  isSupabaseRateLimitError,
  supabase,
} from "./lib/supabase";
import Login from "./LoginTemp";
import { getInitialLoginTheme, type LoginTheme } from "./loginThemes";
import "./index.css";
import {
  createManagedUser as createManagedUserAccount,
  getManagedUsers,
  syncTeacherManagedAccount,
} from "./lib/manageUsers";
import type { ManagedUser } from "./lib/manageUsers";
import { LETTER_IN_PROGRESS_STATUSES } from "./lib/letterMetrics";
import DataInduk from "./DataInduk";
import AbsensiDigital from "./AbsensiDigital";
import Perpustakaan from "./Perpustakaan";
import Akademik from "./Akademik";
import KesiswaanBK from "./KesiswaanBK";
import LaporanAnalitik from "./LaporanAnalitik";
import OfficialAnnouncementModal from "./OfficialAnnouncementModal";
import PengaturanIntegrasi from "./PengaturanIntegrasi";
import AccountSettings from "./AccountSettings";
import PemilihanOSISModule from "./PemilihanOSISModule";
import SmavenLearn from "./SmavenLearn";
import Inventaris from "./InventarisDigital";
import KeuanganDigital from "./KeuanganDigital";
import PersuratanModule from "./PersuratanModule";
import { SchoolProvider } from "./context/SchoolContext";
import { useSchoolContext } from "./context/useSchoolContext";
import { logAppActivity } from "./services/activityLogService";
import MaintenanceBanner from "./MaintenanceBanner";
import {
  getMaintenanceStatus,
  subscribeToMaintenanceStatus,
  type MaintenanceStatus,
} from "./services/maintenanceService";
import {
  loadDashboardFeed,
  type DashboardActivity,
  type DashboardFeed,
  type DashboardNotification,
} from "./services/dashboardService";
import { createModuleRegistry } from "./services/moduleRegistry";

// Keep the existing animation-oriented JSX usable without requiring framer-motion.
const motionComponents: Record<string, ComponentType<Record<string, unknown>>> = {};
const motion = new Proxy<Record<string, ComponentType<Record<string, unknown>>>>({}, {
  get: (_target, tag: string) => {
    if (!motionComponents[tag]) {
      motionComponents[tag] = (props) => {
        const elementProps = { ...props };
        delete elementProps.initial;
        delete elementProps.animate;
        delete elementProps.exit;
        delete elementProps.transition;
        delete elementProps.whileHover;
        delete elementProps.whileTap;
        return createElement(tag, elementProps);
      };
    }
    return motionComponents[tag];
  },
});

function AnimatePresence({ children }: { children: ReactNode }) {
  return createElement(Fragment, null, children);
}

function DashboardDateTime() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const intervalId = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(intervalId);
  }, []);

  const date = new Intl.DateTimeFormat("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(now);
  const time = new Intl.DateTimeFormat("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).format(now);

  return (
    <div className="dashboard-datetime" aria-label={`Tanggal ${date}, pukul ${time} WITA`}>
      <span className="dashboard-date">
        <CalendarDays size={15} aria-hidden="true" />
        <span>{date}</span>
      </span>
      <span className="dashboard-time">
        <Clock3 size={15} aria-hidden="true" />
        <time dateTime={now.toISOString()}>{time}</time>
        <small>WITA</small>
      </span>
    </div>
  );
}

type AppStatus = "active" | "development" | "coming-soon";

type AppItem = {
  name: string;
  description: string;
  icon: typeof LayoutDashboard;
  color: string;
  bg: string;
  category: string;
};

const apps: AppItem[] = [
  { name: "Data Induk", description: "Data siswa, guru, dan kelas", icon: Users, color: "#3976F6", bg: "#E9F0FF", category: "Akademik" },
  { name: "Absensi Digital", description: "Absensi siswa dan guru", icon: CalendarCheck, color: "#089B79", bg: "#DDF8EF", category: "Akademik" },
  { name: "Persuratan", description: "Surat masuk, keluar, dan disposisi", icon: Mail, color: "#8754E8", bg: "#F0E8FF", category: "Administrasi" },
  { name: "Perpustakaan", description: "Katalog dan peminjaman buku", icon: BookOpen, color: "#D97706", bg: "#FFF0D9", category: "Layanan" },
  { name: "Inventaris", description: "Aset, barang, dan ruangan", icon: Package, color: "#E35475", bg: "#FFE7ED", category: "Administrasi" },
  { name: "Keuangan", description: "Anggaran dan laporan keuangan", icon: Wallet, color: "#0D91B5", bg: "#DDF6FC", category: "Administrasi" },
  { name: "Akademik", description: "Jadwal, nilai, dan pembelajaran", icon: GraduationCap, color: "#5C66DC", bg: "#E9EAFF", category: "Akademik" },
  { name: "SMAVEN Learn", description: "Interactive Learning Experience", icon: BrainCircuit, color: "#246BFD", bg: "#E7F0FF", category: "Akademik" },
  { name: "Kesiswaan", description: "Prestasi, perizinan, dan kegiatan siswa", icon: Users, color: "#D34B99", bg: "#FFE6F4", category: "Layanan" },
  { name: "Bimbingan dan Konseling", description: "Layanan konseling dan tindak lanjut siswa", icon: HeartHandshake, color: "#7357A5", bg: "#EEE8FA", category: "Layanan" },
  { name: "Pemilihan OSIS", description: "Pemilihan dan hasil suara", icon: Vote, color: "#35966A", bg: "#DFF6E8", category: "Layanan" },
  { name: "Laporan & Analitik", description: "Statistik dan laporan sekolah", icon: ChartNoAxesCombined, color: "#C05B24", bg: "#FFEBDD", category: "Administrasi" },
  { name: "Pengguna", description: "Akun, peran, dan hak akses", icon: ShieldCheck, color: "#566477", bg: "#E9EDF3", category: "Sistem" },
  { name: "Pengaturan", description: "Identitas dan konfigurasi sekolah", icon: Settings, color: "#7A58B8", bg: "#F0E8FF", category: "Sistem" },
];

const moduleStatuses: Record<string, AppStatus> = {
  "Data Induk": "active",
  "Absensi Digital": "active",
  "Persuratan": "active",
  "Perpustakaan": "active",
  "Inventaris": "active",
  "Keuangan": "active",
  "Akademik": "active",
  "SMAVEN Learn": "active",
  "Kesiswaan": "active",
  "Bimbingan dan Konseling": "active",
  "Pemilihan OSIS": "active",
  "Laporan & Analitik": "active",
  "Pengguna": "active",
  "Pengaturan": "active",
};

const navGroups = [
  { label: "MENU UTAMA", items: [{ label: "Dashboard", icon: LayoutDashboard }] },
  { label: "MANAJEMEN SEKOLAH", items: [
    { label: "Data Induk", icon: Users },
    { label: "Absensi Digital", icon: CalendarCheck },
    { label: "Persuratan", icon: Mail },
    { label: "Perpustakaan", icon: BookOpen },
    { label: "Inventaris", icon: Package },
    { label: "Keuangan", icon: Wallet },
  ]},
  { label: "AKADEMIK & LAYANAN", items: [
    { label: "Akademik", icon: GraduationCap },
    { label: "SMAVEN Learn", icon: BrainCircuit },
    { label: "Kesiswaan", icon: Users },
    { label: "Bimbingan dan Konseling", icon: HeartHandshake },
    { label: "Pemilihan OSIS", icon: Vote },
    { label: "Laporan & Analitik", icon: ChartNoAxesCombined },
  ]},
  { label: "SISTEM", items: [
    { label: "Pengguna", icon: ShieldCheck },
    { label: "Pengaturan", icon: Settings },
  ]},
];

type DashboardMetric = {
  value: string;
  note: string;
  trend: string;
};

type DashboardStats = {
  students: DashboardMetric;
  staff: DashboardMetric;
  attendance: DashboardMetric;
  letters: DashboardMetric;
};

const initialDashboardStats: DashboardStats = {
  students: { value: "—", note: "Memuat data Supabase", trend: "Sinkronisasi data" },
  staff: { value: "—", note: "Memuat data Supabase", trend: "Sinkronisasi data" },
  attendance: { value: "—", note: "Memuat data Supabase", trend: "Sinkronisasi data" },
  letters: { value: "—", note: "Memuat pengajuan aktif", trend: "Sinkronisasi Persuratan" },
};

function isDashboardMetric(value: unknown): value is DashboardMetric {
  return typeof value === "object" &&
    value !== null &&
    "value" in value &&
    typeof value.value === "string" &&
    "note" in value &&
    typeof value.note === "string" &&
    "trend" in value &&
    typeof value.trend === "string";
}

function isDashboardStats(value: unknown): value is DashboardStats {
  return typeof value === "object" &&
    value !== null &&
    "students" in value &&
    isDashboardMetric(value.students) &&
    "staff" in value &&
    isDashboardMetric(value.staff) &&
    "attendance" in value &&
    isDashboardMetric(value.attendance) &&
    "letters" in value &&
    isDashboardMetric(value.letters);
}

function dashboardStatsCacheKey(userId: string) {
  return `super-app:dashboard-stats:${userId}`;
}

function readCachedDashboardStats(userId: string): DashboardStats | null {
  try {
    const raw = window.localStorage.getItem(dashboardStatsCacheKey(userId));
    if (!raw) return null;
    const cached: unknown = JSON.parse(raw);
    if (
      typeof cached !== "object" ||
      cached === null ||
      !("savedAt" in cached) ||
      typeof cached.savedAt !== "number" ||
      Date.now() - cached.savedAt > 24 * 60 * 60_000 ||
      !("stats" in cached) ||
      !isDashboardStats(cached.stats)
    ) {
      return null;
    }

    const refreshedAt = new Intl.DateTimeFormat("id-ID", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(cached.savedAt);
    const withCacheNote = (metric: DashboardMetric): DashboardMetric => ({
      ...metric,
      note: "Data terakhir tersimpan",
      trend: `Diperbarui ${refreshedAt}`,
    });

    return {
      students: withCacheNote(cached.stats.students),
      staff: withCacheNote(cached.stats.staff),
      attendance: withCacheNote(cached.stats.attendance),
      letters: withCacheNote(cached.stats.letters),
    };
  } catch (error) {
    console.warn("Cache ringkasan dashboard tidak dapat dibaca:", error);
    return null;
  }
}

function writeCachedDashboardStats(userId: string, stats: DashboardStats) {
  try {
    window.localStorage.setItem(
      dashboardStatsCacheKey(userId),
      JSON.stringify({ savedAt: Date.now(), stats }),
    );
  } catch (error) {
    console.warn("Cache ringkasan dashboard tidak dapat disimpan:", error);
  }
}

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs = 8000,
  message = "Permintaan autentikasi melewati batas waktu.",
): Promise<T> {
  let timeoutId = 0;
  const timeout = new Promise<T>((_, reject) => {
    timeoutId = window.setTimeout(() => reject(new Error(message)), timeoutMs);
  });

  return Promise.race([promise, timeout]).finally(() => window.clearTimeout(timeoutId));
}

type CachedSessionUser = {
  id: string;
  username: string;
  role: string;
};

function sessionProfileCacheKey(userId: string) {
  return `super-app:verified-profile:${userId}`;
}

const automaticLogoutDelayMs = 120_000;
const visibleTabLeaseMs = 30_000;
const visibleTabHeartbeatMs = 10_000;
const loginSessionMarkers = new Map<string, string>();
let fallbackTabId = "";

function createSessionToken() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function loginSessionMarkerKey(userId: string) {
  return `super-app:login-session:${userId}`;
}

function awayTimestampKey(userId: string, marker: string) {
  return `super-app:away-since:${userId}:${marker}`;
}

function visibleTabsKey(userId: string, marker: string) {
  return `super-app:visible-tabs:${userId}:${marker}`;
}

function announcementShownKey(userId: string, marker: string) {
  return `super-app:announcement-shown:${userId}:${marker}`;
}

function clearLoginSessionTracking(userId: string) {
  const markerKey = loginSessionMarkerKey(userId);
  let marker = loginSessionMarkers.get(userId) ?? "";
  try {
    marker = window.localStorage.getItem(markerKey) ?? marker;
    if (marker) {
      window.localStorage.removeItem(awayTimestampKey(userId, marker));
      window.localStorage.removeItem(visibleTabsKey(userId, marker));
      window.sessionStorage.removeItem(announcementShownKey(userId, marker));
    }
    window.localStorage.removeItem(markerKey);
  } catch (error) {
    console.error("Cache status sesi tidak dapat dibersihkan:", error);
  } finally {
    loginSessionMarkers.delete(userId);
  }
}

function getLoginSessionMarker(userId: string, startNew = false) {
  const markerKey = loginSessionMarkerKey(userId);
  try {
    const previousMarker = window.localStorage.getItem(markerKey);
    if (!startNew && previousMarker) {
      loginSessionMarkers.set(userId, previousMarker);
      return previousMarker;
    }
    if (previousMarker) {
      window.localStorage.removeItem(awayTimestampKey(userId, previousMarker));
      window.localStorage.removeItem(visibleTabsKey(userId, previousMarker));
      window.sessionStorage.removeItem(announcementShownKey(userId, previousMarker));
    }
    const marker = createSessionToken();
    window.localStorage.setItem(markerKey, marker);
    loginSessionMarkers.set(userId, marker);
    return marker;
  } catch (error) {
    console.error("Penanda sesi login tidak dapat disimpan:", error);
    const previousMarker = loginSessionMarkers.get(userId);
    if (!startNew && previousMarker) return previousMarker;
    const marker = createSessionToken();
    loginSessionMarkers.set(userId, marker);
    return marker;
  }
}

function getTabId() {
  try {
    const stored = window.sessionStorage.getItem("super-app:tab-id");
    if (stored) return stored;
    const tabId = createSessionToken();
    window.sessionStorage.setItem("super-app:tab-id", tabId);
    return tabId;
  } catch (error) {
    console.error("Penanda tab tidak dapat disimpan:", error);
    if (!fallbackTabId) fallbackTabId = createSessionToken();
    return fallbackTabId;
  }
}

function readAwayTimestamp(key: string) {
  try {
    const stored = window.localStorage.getItem(key);
    if (stored === null) return null;
    const timestamp = Number(stored);
    if (!Number.isFinite(timestamp)) {
      window.localStorage.removeItem(key);
      return null;
    }
    return timestamp;
  } catch (error) {
    console.error("Waktu aplikasi ditinggalkan tidak dapat dibaca:", error);
    return null;
  }
}

function writeAwayTimestamp(key: string, timestamp: number) {
  try {
    window.localStorage.setItem(key, String(timestamp));
  } catch (error) {
    console.error("Waktu aplikasi ditinggalkan tidak dapat disimpan:", error);
  }
}

function clearAwayTimestamp(key: string) {
  try {
    window.localStorage.removeItem(key);
  } catch (error) {
    console.error("Waktu aplikasi ditinggalkan tidak dapat dibersihkan:", error);
  }
}

function readVisibleTabLeases(key: string) {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(key) ?? "{}");
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(
      Object.entries(value).filter((entry): entry is [string, number] =>
        typeof entry[1] === "number" && Number.isFinite(entry[1]),
      ),
    ) as Record<string, number>;
  } catch (error) {
    console.error("Status tab aktif tidak dapat dibaca:", error);
    return {};
  }
}

function writeVisibleTabLeases(key: string, leases: Record<string, number>) {
  try {
    if (Object.keys(leases).length) {
      window.localStorage.setItem(key, JSON.stringify(leases));
    } else {
      window.localStorage.removeItem(key);
    }
  } catch (error) {
    console.error("Status tab aktif tidak dapat disimpan:", error);
  }
}

function hasVisibleTabLease(key: string, now = Date.now()) {
  return Object.values(readVisibleTabLeases(key)).some((timestamp) =>
    timestamp <= now + 5_000 && now - timestamp < visibleTabLeaseMs,
  );
}

function isAwaySessionExpired(userId: string, marker: string, now = Date.now()) {
  const awaySince = readAwayTimestamp(awayTimestampKey(userId, marker));
  return awaySince !== null
    && awaySince <= now
    && now - awaySince >= automaticLogoutDelayMs
    && !hasVisibleTabLease(visibleTabsKey(userId, marker), now);
}

function readCachedSessionUser(userId: string): CachedSessionUser | null {
  for (const storageName of ["localStorage", "sessionStorage"] as const) {
    try {
      const raw = window[storageName].getItem(sessionProfileCacheKey(userId));
      if (!raw) continue;
      const value: unknown = JSON.parse(raw);
      if (
        typeof value === "object" &&
        value !== null &&
        "id" in value &&
        "username" in value &&
        "role" in value &&
        value.id === userId &&
        typeof value.username === "string" &&
        typeof value.role === "string"
      ) {
        return { id: value.id, username: value.username, role: value.role };
      }
    } catch (error) {
      console.warn("Cache profil sesi tidak dapat dibaca:", error);
    }
  }
  return null;
}

function writeCachedSessionUser(user: CachedSessionUser) {
  const serializedUser = JSON.stringify(user);
  for (const storageName of ["localStorage", "sessionStorage"] as const) {
    try {
      window[storageName].setItem(sessionProfileCacheKey(user.id), serializedUser);
    } catch (error) {
      console.warn("Cache profil sesi tidak dapat disimpan:", error);
    }
  }
}

function clearCachedSessionUser(userId: string | null | undefined) {
  if (!userId) return;
  for (const storageName of ["localStorage", "sessionStorage"] as const) {
    try {
      window[storageName].removeItem(sessionProfileCacheKey(userId));
    } catch (error) {
      console.warn("Cache profil sesi tidak dapat dihapus:", error);
    }
  }
}

function isTemporarySessionFailure(error: unknown) {
  const status = typeof error === "object" && error !== null && "status" in error
    ? Number(error.status)
    : 0;
  const message = error instanceof Error
    ? error.message
    : typeof error === "object" && error !== null && "message" in error
      ? String(error.message)
      : String(error);
  return status === 429 ||
    status === 503 ||
    isSupabaseRateLimitError(error) ||
    getSupabaseSessionRetryDelayMs() > 0 ||
    /timeout|melewati batas waktu|failed to fetch|network error/i.test(message);
}

function dashboardMetric(
  label: string,
  count: number | null,
  error: unknown,
  previous: DashboardMetric,
): DashboardMetric {
  if (error) {
    const isRateLimited = isSupabaseRateLimitError(error);
    const errorMessage = error instanceof Error
      ? error.message
      : typeof error === "object" && error !== null && "message" in error
        ? String(error.message)
        : String(error);
    if (!isRateLimited) console.error(`Ringkasan ${label} gagal dimuat:`, error);
    return {
      ...previous,
      note: isRateLimited
        ? "Supabase menolak permintaan sementara (HTTP 429). Data terakhir ditampilkan."
        : previous.value === "—"
          ? `Gagal dimuat: ${errorMessage}`
          : `Gagal diperbarui: ${errorMessage}`,
      trend: isRateLimited
        ? "Mencoba kembali otomatis"
        : "Menampilkan data terakhir",
    };
  }
  if (count === null) {
    return { value: "—", note: "Jumlah data belum tersedia", trend: "Respons Supabase kosong" };
  }
  return { value: count.toLocaleString("id-ID"), note: "Data Supabase", trend: "Diperbarui otomatis" };
}

type StudentAccountGeneratorStatus =
  | "ready"
  | "existing"
  | "duplicate"
  | "invalid"
  | "creating"
  | "created"
  | "failed";

type StudentAccountGeneratorRow = {
  id: string;
  nisn: string;
  fullName: string;
  classId: string | null;
  className: string;
  studentStatus: string;
  hasAccount: boolean;
  status: StudentAccountGeneratorStatus;
  message: string;
};

type StudentAccountSourceRow = {
  id: string;
  nisn: string | null;
  full_name: string | null;
  status: string | null;
  class_id: string | null;
  class: { name: string | null } | { name: string | null }[] | null;
};

type TeacherAccountGeneratorStatus =
  | "ready"
  | "link"
  | "existing"
  | "duplicate"
  | "invalid"
  | "creating"
  | "created"
  | "failed";

type TeacherAccountGeneratorRow = {
  id: string;
  profileId: string | null;
  nip: string;
  fullName: string;
  employmentStatus: string;
  staffCategory: string;
  primaryRole: string;
  additionalRoles: string[];
  role: string;
  hasAccount: boolean;
  status: TeacherAccountGeneratorStatus;
  message: string;
};

type TeacherAccountSourceRow = Pick<
  TeacherAccountGeneratorRow,
  "id" | "profileId" | "nip" | "fullName" | "employmentStatus" | "staffCategory" | "primaryRole" | "additionalRoles"
>;

type ManagedUserDirectoryEntry = ManagedUser & {
  employmentStatus: string | null;
  className: string | null;
};

const managedUserRoleOptions = [
  { value: "kepala_sekolah", label: "Kepala Sekolah" },
  { value: "operator", label: "Operator Sekolah" },
  { value: "kepala_tata_usaha", label: "Kepala Tata Usaha" },
  { value: "staff_tata_usaha", label: "Staff Tata Usaha" },
  { value: "guru", label: "Guru" },
  { value: "guru_bk", label: "Guru BK" },
  { value: "siswa", label: "Siswa" },
  { value: "tendik", label: "Tendik" },
];

const roleLabels: Record<string, string> = {
  super_admin: "Super Admin",
  kepala_sekolah: "Kepala Sekolah",
  operator: "Operator Sekolah",
  kepala_tata_usaha: "Kepala Tata Usaha",
  staff_tata_usaha: "Staff Tata Usaha",
  guru: "Guru",
  guru_bk: "Guru BK",
  siswa: "Siswa",
  tendik: "Tendik",
  pending: "Menunggu Aktivasi",
  bendahara: "Bendahara",
};

type ManagedUserGroup = "teachers" | "staff" | "students";

function getManagedUserGroup(user: ManagedUserDirectoryEntry): ManagedUserGroup {
  if (user.role === "siswa") return "students";

  const isTeacherRole = user.role === "guru" || user.role === "guru_bk";
  const hasNonTeacherPosition = /\b(kepala sekolah|kepala tata usaha|kepala tu|operator|staff? tata usaha|bendahara|tendik|pengelola)\b/i
    .test(user.employmentStatus ?? "");
  return isTeacherRole && !hasNonTeacherPosition ? "teachers" : "staff";
}

const normalizeAccountUsername = (username: string) =>
  username.trim().toLocaleLowerCase("id-ID");

const teacherRoleForGenerator = (primaryRole: string, staffCategory: string) => {
  switch (primaryRole) {
    case "Guru BK":
    case "Guru BK / Konselor":
      return "guru_bk";
    case "Kepala Sekolah":
      return "kepala_sekolah";
    case "Kepala Tata Usaha":
      return "kepala_tata_usaha";
    case "Staff Tata Usaha":
      return "staff_tata_usaha";
    case "Bendahara Pengeluaran":
    case "Bendahara":
      return "bendahara";
    case "Operator Sekolah":
      return "operator";
    case "Tendik Lainnya":
    case "Tenaga Kependidikan (Tendik)":
      return "tendik";
    default:
      return staffCategory === "Tenaga Kependidikan" ? "tendik" : "guru";
  }
};

const academicTitles: Record<string, string> = {
  "s.pd.": "S.Pd.",
  "m.pd.": "M.Pd.",
  "s.pdi.": "S.PdI.",
  "m.pdi.": "M.PdI.",
  "s.pd.i.": "S.Pd.I.",
  "m.pd.i.": "M.Pd.I.",
  "s.psi.": "S.Psi.",
  "s.ag.": "S.Ag.",
  "s.kom.": "S.Kom.",
  "s.si.": "S.Si.",
  "s.sos.": "S.Sos.",
  "s.e.": "S.E.",
  "s.h.": "S.H.",
  "s.t.": "S.T.",
  "s.or.": "S.Or.",
  "s.sn.": "S.Sn.",
  "m.si.": "M.Si.",
  "m.kom.": "M.Kom.",
  "m.m.": "M.M.",
  "dr.": "Dr.",
  "drs.": "Drs.",
  "dra.": "Dra.",
  "h.": "H.",
  "hj.": "Hj.",
};

function formatDashboardName(value: string | null | undefined, role: string | undefined) {
  const rawName = value?.trim() ?? "";
  if (role === "super_admin" && (!rawName || rawName.includes("@"))) return "Administrator";
  if (!rawName || rawName.includes("@")) return role === "super_admin" ? "Administrator" : "Pengguna";

  const titleCaseName = (name: string) => name
    .toLocaleLowerCase("id-ID")
    .split(/(\s+|-|')/)
    .map((part) => {
      if (!part || /^\s+$/.test(part) || part === "-" || part === "'") return part;
      const [first, ...rest] = Array.from(part);
      return first ? `${first.toLocaleUpperCase("id-ID")}${rest.join("")}` : "";
    })
    .join("");

  const parts = rawName.split(",");
  const name = titleCaseName(parts.shift() ?? "");
  const titles = parts.map((part) => {
    const title = part.trim();
    return academicTitles[title.toLocaleLowerCase("id-ID")] ?? titleCaseName(title);
  });
  return [name, ...titles].filter(Boolean).join(", ");
}

const roleAccess: Record<string, string[]> = {
  super_admin: [
    "Dashboard",
    "Data Induk",
    "Absensi Digital",
    "Persuratan",
    "Perpustakaan",
    "Inventaris",
    "Keuangan",
    "Akademik",
    "SMAVEN Learn",
    "Kesiswaan",
    "Bimbingan dan Konseling",
    "Pemilihan OSIS",
    "Laporan & Analitik",
    "Pengguna",
    "Pengaturan",
  ],
  kepala_sekolah: [
    "Dashboard",
    "Absensi Digital",
    "Persuratan",
    "Perpustakaan",
    "Inventaris",
    "Keuangan",
    "Akademik",
    "SMAVEN Learn",
    "Kesiswaan",
    "Bimbingan dan Konseling",
    "Pemilihan OSIS",
    "Laporan & Analitik",
  ],
  operator: [
    "Dashboard",
    "Data Induk",
    "Absensi Digital",
    "Persuratan",
    "Perpustakaan",
    "Inventaris",
    "Keuangan",
    "Akademik",
    "SMAVEN Learn",
    "Kesiswaan",
    "Bimbingan dan Konseling",
    "Pemilihan OSIS",
    "Laporan & Analitik",
  ],
  kepala_tata_usaha: [
    "Dashboard",
    "Absensi Digital",
    "Persuratan",
    "Inventaris",
    "Keuangan",
    "Laporan & Analitik",
  ],
  guru: [
    "Dashboard",
    "Persuratan",
    "Absensi Digital",
    "Akademik",
    "SMAVEN Learn",
    "Bimbingan dan Konseling",
    "Perpustakaan",
  ],
  guru_bk: [
    "Dashboard",
    "Absensi Digital",
    "Persuratan",
    "Bimbingan dan Konseling",
  ],
  siswa: [
    "Dashboard",
    "Absensi Digital",
    "Akademik",
    "SMAVEN Learn",
    "Pemilihan OSIS",
    "Perpustakaan",
    "Bimbingan dan Konseling",
  ],
  staff_tata_usaha: [
    "Dashboard",
    "Persuratan",
    "Absensi Digital",
  ],
  tendik: [
    "Dashboard",
    "Persuratan",
    "Absensi Digital",
  ],
  bendahara: [
    "Dashboard",
    "Keuangan",
    "Persuratan",
    "Laporan & Analitik",
  ],
};

const appModuleCatalog = createModuleRegistry([
  ...apps.map(app => app.name),
  ...navGroups.flatMap(group => group.items.map(item => item.label)),
  ...Object.keys(moduleStatuses),
]);

type DashboardQuickAction = {
  module: string;
  title: string;
  description: string;
  icon: typeof Mail;
  color: "purple" | "green" | "blue";
};

const dashboardQuickActions: Record<string, DashboardQuickAction[]> = {
  super_admin: [
    { module: "Data Induk", title: "Data Induk", description: "Kelola data master sekolah", icon: ClipboardList, color: "blue" },
    { module: "Persuratan", title: "Antrean Persuratan", description: "Periksa pengajuan dokumen", icon: Mail, color: "purple" },
    { module: "Keuangan", title: "Keuangan", description: "Pantau transaksi dan anggaran", icon: Wallet, color: "green" },
    { module: "Inventaris", title: "Inventaris", description: "Pantau aset dan laporan", icon: Package, color: "blue" },
  ],
  operator: [
    { module: "Data Induk", title: "Data Induk", description: "Data siswa, guru, dan kelas", icon: ClipboardList, color: "blue" },
    { module: "Absensi Digital", title: "Absensi Digital", description: "Kehadiran sekolah", icon: CalendarCheck, color: "green" },
    { module: "Persuratan", title: "Persuratan Digital", description: "Kelola dokumen sekolah", icon: Mail, color: "purple" },
    { module: "Kesiswaan", title: "Kesiswaan", description: "Prestasi dan kegiatan siswa", icon: Users, color: "blue" },
  ],
  kepala_sekolah: [
    { module: "Absensi Digital", title: "Absensi Digital", description: "Ringkasan kehadiran", icon: CalendarCheck, color: "green" },
    { module: "Persuratan", title: "Persetujuan Surat", description: "Tinjau surat yang diajukan", icon: Mail, color: "purple" },
    { module: "Keuangan", title: "Keuangan", description: "Pantau anggaran sekolah", icon: Wallet, color: "blue" },
    { module: "Laporan & Analitik", title: "Laporan & Analitik", description: "Ringkasan kinerja sekolah", icon: ChartNoAxesCombined, color: "green" },
  ],
  kepala_tata_usaha: [
    { module: "Absensi Digital", title: "Absensi Digital", description: "Pantau kehadiran sekolah", icon: CalendarCheck, color: "green" },
    { module: "Persuratan", title: "Antrean Persuratan", description: "Periksa pengajuan dokumen", icon: Mail, color: "purple" },
    { module: "Inventaris", title: "Inventaris", description: "Pantau aset dan laporan", icon: Package, color: "blue" },
    { module: "Keuangan", title: "Persetujuan Keuangan", description: "Tinjau transaksi menunggu", icon: Wallet, color: "green" },
    { module: "Laporan & Analitik", title: "Laporan & Analitik", description: "Lihat ringkasan operasional", icon: ChartNoAxesCombined, color: "blue" },
  ],
  guru: [
    { module: "Akademik", title: "Akademik", description: "Tugas dan agenda mengajar", icon: GraduationCap, color: "blue" },
    { module: "Absensi Digital", title: "Absensi Digital", description: "Catat kehadiran", icon: CalendarCheck, color: "green" },
    { module: "Persuratan", title: "Persuratan Digital", description: "Ajukan surat sekolah", icon: Mail, color: "purple" },
    { module: "Bimbingan dan Konseling", title: "Rujukan & BK", description: "Tindak lanjut kebutuhan siswa", icon: HeartHandshake, color: "blue" },
  ],
  guru_bk: [
    { module: "Bimbingan dan Konseling", title: "Peringatan & Kasus BK", description: "Tindak lanjuti antrean BK", icon: HeartHandshake, color: "purple" },
    { module: "Absensi Digital", title: "Absensi Saya", description: "Catat dan pantau kehadiran pribadi", icon: CalendarCheck, color: "green" },
    { module: "Persuratan", title: "Ajukan Surat", description: "Buat dan lacak pengajuan surat", icon: Mail, color: "blue" },
  ],
  siswa: [
    { module: "Akademik", title: "Tugas dan Agenda", description: "Lihat pembelajaran kelas", icon: GraduationCap, color: "blue" },
    { module: "Absensi Digital", title: "Absensi Saya", description: "Pantau kehadiran pribadi", icon: CalendarCheck, color: "green" },
    { module: "Bimbingan dan Konseling", title: "Bimbingan & Konseling", description: "Curhat, angket kebutuhan, dan pengajuan konsultasi", icon: HeartHandshake, color: "purple" },
    { module: "Perpustakaan", title: "Perpustakaan", description: "Katalog dan peminjaman buku", icon: BookOpen, color: "purple" },
    { module: "SMAVEN Learn", title: "SMAVEN Learn", description: "Buka materi pembelajaran", icon: BrainCircuit, color: "blue" },
  ],
  staff_tata_usaha: [
    { module: "Persuratan", title: "Persuratan Digital", description: "Kelola pengajuan surat", icon: Mail, color: "purple" },
    { module: "Absensi Digital", title: "Absensi Digital", description: "Kehadiran sekolah", icon: CalendarCheck, color: "green" },
  ],
  tendik: [
    { module: "Absensi Digital", title: "Absensi Digital", description: "Kehadiran pribadi", icon: CalendarCheck, color: "green" },
    { module: "Persuratan", title: "Persuratan Digital", description: "Ajukan surat sekolah", icon: Mail, color: "purple" },
  ],
};

function dashboardTime(value: string | null) {
  if (!value) return "Baru";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Baru";
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export default function App() {
  return (
    <SchoolProvider>
      <AppContent />
    </SchoolProvider>
  );
}

function AppContent() {
  const {
    currentUser,
    setCurrentUser,
    moduleSettings,
    refreshSchoolContext,
    contextError,
  } = useSchoolContext();
  const dashboardUserName = formatDashboardName(
    currentUser?.full_name || currentUser?.username,
    currentUser?.role,
  );
  const currentUserRef = useRef<CachedSessionUser | null>(currentUser);
  useEffect(() => {
    currentUserRef.current = currentUser;
  }, [currentUser]);
  const [loginSessionId, setLoginSessionId] = useState("");
  const [automaticLogoutNotice, setAutomaticLogoutNotice] = useState("");
  const [sessionRecoveryMessage, setSessionRecoveryMessage] = useState("");
  const automaticLogoutInProgressRef = useRef(false);
  const loggedInUserId = currentUser?.id;
  useEffect(() => {
    if (!loggedInUserId) {
      setLoginSessionId("");
      return;
    }
    setLoginSessionId(getLoginSessionMarker(loggedInUserId));
  }, [loggedInUserId]);

  useEffect(() => {
    if (!loggedInUserId || !loginSessionId) return;

    automaticLogoutInProgressRef.current = false;
    const userId = loggedInUserId;
    const tabId = getTabId();
    const awayKey = awayTimestampKey(userId, loginSessionId);
    const leasesKey = visibleTabsKey(userId, loginSessionId);
    let awayTimer = 0;

    const expireSession = async () => {
      if (automaticLogoutInProgressRef.current) return;
      automaticLogoutInProgressRef.current = true;
      let signOutError: unknown = null;
      try {
        const { error } = await supabase.auth.signOut({ scope: "local" });
        if (error) throw error;
      } catch (error) {
        console.error("Logout otomatis karena aplikasi tidak dibuka gagal:", error);
        signOutError = error;
        clearSupabaseLocalSessionCache();
      }
      clearCachedSessionUser(userId);
      clearLoginSessionTracking(userId);
      setAutomaticLogoutNotice("Sesi otomatis keluar karena aplikasi tidak dibuka selama lebih dari 2 menit.");
      setSessionRecoveryMessage(
        signOutError
          ? "Sesi lokal sudah dihapus, tetapi status sesi Supabase mungkin belum diperbarui karena koneksi dibatasi."
          : "",
      );
      currentUserRef.current = null;
      setCurrentUser(null);
      setActivePage("Dashboard");
    };

    const clearAwayTimer = () => {
      if (awayTimer) window.clearTimeout(awayTimer);
      awayTimer = 0;
    };

    const activeLeases = (now: number) => {
      const leases = readVisibleTabLeases(leasesKey);
      return Object.entries(leases).filter(([, timestamp]) =>
        timestamp <= now + 5_000 && now - timestamp < visibleTabLeaseMs,
      );
    };

    const markTabHidden = () => {
      const now = Date.now();
      const leases = readVisibleTabLeases(leasesKey);
      delete leases[tabId];
      for (const [leaseId, timestamp] of Object.entries(leases)) {
        if (timestamp > now + 5_000 || now - timestamp >= visibleTabLeaseMs) {
          delete leases[leaseId];
        }
      }
      writeVisibleTabLeases(leasesKey, leases);

      if (!activeLeases(now).length) {
        const awaySince = readAwayTimestamp(awayKey);
        if (awaySince === null || awaySince > now) writeAwayTimestamp(awayKey, now);
        const startedAt = readAwayTimestamp(awayKey) ?? now;
        clearAwayTimer();
        awayTimer = window.setTimeout(
          () => void (isAwaySessionExpired(userId, loginSessionId) && expireSession()),
          Math.max(0, automaticLogoutDelayMs - (now - startedAt)),
        );
      } else {
        clearAwayTimestamp(awayKey);
        clearAwayTimer();
      }
    };

    const markTabVisible = () => {
      const now = Date.now();
      const otherVisibleTabs = activeLeases(now).filter(([leaseId]) => leaseId !== tabId);
      if (isAwaySessionExpired(userId, loginSessionId, now) && !otherVisibleTabs.length) {
        clearAwayTimer();
        void expireSession();
        return;
      }

      clearAwayTimestamp(awayKey);
      const leases = readVisibleTabLeases(leasesKey);
      for (const [leaseId, timestamp] of Object.entries(leases)) {
        if (timestamp > now + 5_000 || now - timestamp >= visibleTabLeaseMs) {
          delete leases[leaseId];
        }
      }
      leases[tabId] = now;
      writeVisibleTabLeases(leasesKey, leases);
      clearAwayTimer();
    };

    const updateVisibility = () => {
      if (document.visibilityState === "visible") markTabVisible();
      else markTabHidden();
    };

    updateVisibility();
    const heartbeat = window.setInterval(() => {
      if (document.visibilityState === "visible") markTabVisible();
      else if (!awayTimer) markTabHidden();
    }, visibleTabHeartbeatMs);
    document.addEventListener("visibilitychange", updateVisibility);
    window.addEventListener("pagehide", markTabHidden);

    return () => {
      window.clearInterval(heartbeat);
      clearAwayTimer();
      document.removeEventListener("visibilitychange", updateVisibility);
      window.removeEventListener("pagehide", markTabHidden);
      const leases = readVisibleTabLeases(leasesKey);
      delete leases[tabId];
      writeVisibleTabLeases(leasesKey, leases);
      if (!activeLeases(Date.now()).length && document.visibilityState !== "visible") {
        const now = Date.now();
        if (readAwayTimestamp(awayKey) === null) writeAwayTimestamp(awayKey, now);
      }
    };
  }, [loggedInUserId, loginSessionId, setCurrentUser]);

  const dashboardFeedRefreshState = useRef(new Map<string, { lastRequestedAt: number; promise: Promise<DashboardFeed> | null }>());
  const dashboardStatsRefreshState = useRef(new Map<string, { lastRequestedAt: number; inFlight: boolean; requestId: number }>());
  const [activePage, setActivePage] = useState("Dashboard");
  const [parentLetterPrefill, setParentLetterPrefill] = useState<{
    id: string;
    full_name: string;
    nisn: string;
    class_id: string | null;
    class_name: string;
    context: string;
  } | null>(null);
  const [letterReturnPage, setLetterReturnPage] = useState("Dashboard");
  const handleStudentPrefillHandled = useCallback(() => setParentLetterPrefill(null), []);
  const openParentLetter = useCallback((student: {
    id: string;
    full_name: string;
    nisn: string;
    class_id: string | null;
    class_name: string;
  }, context: string) => {
    setParentLetterPrefill({
      id: student.id,
      full_name: student.full_name,
      nisn: student.nisn,
      class_id: student.class_id,
      class_name: student.class_name,
      context,
    });
    setLetterReturnPage(activePage);
    setActivePage("Persuratan");
  }, [activePage]);
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState("");
  const [sessionRetry, setSessionRetry] = useState(0);
  const [maintenanceStatus, setMaintenanceStatus] = useState<MaintenanceStatus | null>(null);
  const [maintenanceStatusLoaded, setMaintenanceStatusLoaded] = useState(false);
  const [dashboardStats, setDashboardStats] = useState(initialDashboardStats);
  const [dashboardRefreshing, setDashboardRefreshing] = useState(false);
  const [dashboardReload, setDashboardReload] = useState(0);
  const [dashboardFeedReload, setDashboardFeedReload] = useState(0);
  const [dashboardNotifications, setDashboardNotifications] = useState<DashboardNotification[]>([]);
  const [dashboardActivities, setDashboardActivities] = useState<DashboardActivity[]>([]);
  const [dashboardSummary, setDashboardSummary] = useState<DashboardFeed["summary"]>({
    unreadBkAlerts: null,
    openBkCases: null,
  });
  const [dashboardFeedError, setDashboardFeedError] = useState("");
  const [dashboardFeedLoading, setDashboardFeedLoading] = useState(false);
  const [managedUsers, setManagedUsers] = useState<ManagedUserDirectoryEntry[]>([]);
  const [showAddUserForm, setShowAddUserForm] = useState(false);
  const [newUserNip, setNewUserNip] = useState("");
  const [newUserName, setNewUserName] = useState("");
  const [newUserRole, setNewUserRole] = useState("guru");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [savingUser, setSavingUser] = useState(false);
  const [showStudentAccountGenerator, setShowStudentAccountGenerator] = useState(false);
  const [studentGeneratorRows, setStudentGeneratorRows] = useState<StudentAccountGeneratorRow[]>([]);
  const [studentGeneratorSelectedIds, setStudentGeneratorSelectedIds] = useState<string[]>([]);
  const [studentGeneratorSearch, setStudentGeneratorSearch] = useState("");
  const [studentGeneratorClass, setStudentGeneratorClass] = useState("all");
  const [studentGeneratorUncreatedOnly, setStudentGeneratorUncreatedOnly] = useState(false);
  const [studentGeneratorLoading, setStudentGeneratorLoading] = useState(false);
  const [studentGeneratorCreating, setStudentGeneratorCreating] = useState(false);
  const [studentGeneratorError, setStudentGeneratorError] = useState("");
  const [studentGeneratorMessage, setStudentGeneratorMessage] = useState("");
  const [showTeacherAccountGenerator, setShowTeacherAccountGenerator] = useState(false);
  const [teacherGeneratorRows, setTeacherGeneratorRows] = useState<TeacherAccountGeneratorRow[]>([]);
  const [teacherGeneratorSelectedIds, setTeacherGeneratorSelectedIds] = useState<string[]>([]);
  const [teacherGeneratorSearch, setTeacherGeneratorSearch] = useState("");
  const [teacherGeneratorCategory, setTeacherGeneratorCategory] = useState("all");
  const [teacherGeneratorUncreatedOnly, setTeacherGeneratorUncreatedOnly] = useState(false);
  const [teacherGeneratorLoading, setTeacherGeneratorLoading] = useState(false);
  const [teacherGeneratorCreating, setTeacherGeneratorCreating] = useState(false);
  const [teacherGeneratorError, setTeacherGeneratorError] = useState("");
  const [teacherGeneratorMessage, setTeacherGeneratorMessage] = useState("");
  const [userDirectoryMetadataWarning, setUserDirectoryMetadataWarning] = useState("");
  const [createUserError, setCreateUserError] = useState("");
  const [createUserMessage, setCreateUserMessage] = useState("");
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState("");
  const [usersLoaded, setUsersLoaded] = useState(false);
  const [userSearch, setUserSearch] = useState("");
  const [userRoleFilter, setUserRoleFilter] = useState("all");
  const [userStatusFilter, setUserStatusFilter] = useState("all");
  const [studentUserClassFilter, setStudentUserClassFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [loginPortal, setLoginPortal] = useState<"super_app" | "siswa" | "guru" | "tendik">("super_app");
  const [loginTheme, setLoginTheme] = useState<LoginTheme>(getInitialLoginTheme);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [loggingOut, setLoggingOut] = useState(false);

useEffect(() => {
  let active = true;
  let receivedRealtimeUpdate = false;

  void withTimeout(
    getMaintenanceStatus(),
    8_000,
    "Pemeriksaan status pemeliharaan melewati batas waktu.",
  )
    .then((status) => {
      if (active && !receivedRealtimeUpdate) setMaintenanceStatus(status);
    })
    .catch((error: unknown) => {
      console.error("Status pemeliharaan untuk akses gagal dimuat:", error);
    })
    .finally(() => {
      if (active) setMaintenanceStatusLoaded(true);
    });

  const unsubscribe = subscribeToMaintenanceStatus(
    (status) => {
      receivedRealtimeUpdate = true;
      if (active) {
        setMaintenanceStatus(status);
        setMaintenanceStatusLoaded(true);
      }
    },
    (error) => {
      console.error("Sinkronisasi mode pemeliharaan untuk akses gagal:", error);
    },
  );

  return () => {
    active = false;
    unsubscribe();
  };
}, []);

useEffect(() => {
  if (!toast) return;

  const timeoutId = window.setTimeout(() => {
    setToast("");
  }, 7000);

  return () => {
    window.clearTimeout(timeoutId);
  };
}, [toast]);

useEffect(() => {
  if (!currentUser) {
    setDashboardNotifications([]);
    setDashboardActivities([]);
    setDashboardSummary({ unreadBkAlerts: null, openBkCases: null });
    setDashboardFeedError("");
    setDashboardFeedLoading(false);
    return;
  }

  const account = currentUser;
  let active = true;
  let realtimeRefreshTimer = 0;
  const requestState = dashboardFeedRefreshState.current.get(account.id) ?? {
    lastRequestedAt: 0,
    promise: null,
  };
  dashboardFeedRefreshState.current.set(account.id, requestState);
  const refreshFeed = async (force = false) => {
    if (!active) return;
    if (force && requestState.promise) {
      const activeRequest = requestState.promise;
      try {
        await activeRequest;
      } catch (error) {
        console.error("Pemuatan dashboard sebelumnya gagal sebelum penyegaran real-time:", error);
      }
      if (!active) return;
      if (requestState.promise === activeRequest) requestState.promise = null;
    }
    let feedPromise = requestState.promise;
    if (!feedPromise) {
      if (!force && Date.now() - requestState.lastRequestedAt < 90_000) return;
      requestState.lastRequestedAt = Date.now();
      feedPromise = loadDashboardFeed(account);
      requestState.promise = feedPromise;
    }
    setDashboardFeedLoading(true);
    try {
      const feed = await feedPromise;
      if (!active) return;
      setDashboardNotifications(feed.notifications);
      setDashboardActivities(feed.activities);
      setDashboardSummary(feed.summary);
      setDashboardFeedError(feed.errors.length ? feed.errors.join(" · ") : "");
      if (feed.errors.length) {
        console.error("Sebagian notifikasi dashboard gagal dimuat:", feed.errors);
      }
    } catch (error) {
      if (!active) return;
      const message = error instanceof Error ? error.message : String(error);
      setDashboardFeedError(message);
      console.error("Notifikasi dashboard gagal dimuat:", error);
    } finally {
      if (requestState.promise === feedPromise) requestState.promise = null;
      if (active) setDashboardFeedLoading(false);
    }
  };

  void refreshFeed();

  const realtimeTables = new Set<string>([
    "school_notifications",
    "school_announcements",
    "app_activity_logs",
  ]);
  if (account.role === "guru" && account.teacher_id) {
    ["academic_records", "attendance_qr_records", "letter_requests"]
      .forEach((table) => realtimeTables.add(table));
  } else if (account.role === "guru_bk") {
    ["attendance_bk_alerts", "kb_catatan_bk", "letter_requests"]
      .forEach((table) => realtimeTables.add(table));
  }
  if (["super_admin", "kepala_sekolah", "operator", "kepala_tata_usaha"].includes(account.role)) {
    ["letter_requests", "finance_transactions", "inv_issues"]
      .forEach((table) => realtimeTables.add(table));
  }
  let channel = supabase.channel(`dashboard-notifications-${account.id}`);
  realtimeTables.forEach((table) => {
    channel = channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table },
      () => {
        if (realtimeRefreshTimer) window.clearTimeout(realtimeRefreshTimer);
        realtimeRefreshTimer = window.setTimeout(() => void refreshFeed(true), 1000);
      },
    );
  });
  channel.subscribe((status, error) => {
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        const message = error?.message ?? "Kanal notifikasi real-time tidak tersedia.";
        if (active) setDashboardFeedError((current) => current || message);
        console.error("Kanal notifikasi dashboard gagal:", message);
      }
    });
  const intervalId = window.setInterval(() => {
    if (document.visibilityState === "visible") void refreshFeed();
  }, 10 * 60_000);
  let lastVisibilityRefreshAt = 0;
  const onVisibilityChange = () => {
    if (
      document.visibilityState === "visible" &&
      Date.now() - lastVisibilityRefreshAt >= 60_000
    ) {
      lastVisibilityRefreshAt = Date.now();
      void refreshFeed();
    }
  };
  document.addEventListener("visibilitychange", onVisibilityChange);

  return () => {
    active = false;
    window.clearInterval(intervalId);
    if (realtimeRefreshTimer) window.clearTimeout(realtimeRefreshTimer);
    document.removeEventListener("visibilitychange", onVisibilityChange);
    setDashboardFeedLoading(false);
    void supabase.removeChannel(channel);
  };
}, [
  currentUser,
  currentUser?.id,
  currentUser?.username,
  currentUser?.role,
  currentUser?.student_id,
  currentUser?.teacher_id,
  currentUser?.class_id,
  currentUser?.full_name,
  dashboardFeedReload,
]);

  const [showAllApps, setShowAllApps] = useState(false);
  const [editingUser, setEditingUser] = useState<ManagedUser | null>(null);
  const [editUserNip, setEditUserNip] = useState("");
  const [editUserName, setEditUserName] = useState("");
  const [savingEditUser, setSavingEditUser] = useState(false);
  const [editUserError, setEditUserError] = useState("");



  const attachManagedUserDirectoryMetadata = useCallback(async (users: ManagedUser[]) => {
    const [teachersResult, studentsResult] = await Promise.allSettled([
      supabase.from("teachers").select("profile_id,nip,employment_status"),
      supabase
        .from("students")
        .select("profile_id,nisn,class:classes!students_class_id_fkey(name)"),
    ]);
    const warnings: string[] = [];

    if (teachersResult.status === "rejected") {
      console.error("Jabatan Data Induk untuk direktori pengguna gagal dimuat:", teachersResult.reason);
      warnings.push("jabatan guru/tendik");
    } else if (teachersResult.value.error) {
      console.error("Jabatan Data Induk untuk direktori pengguna gagal dimuat:", teachersResult.value.error);
      warnings.push("jabatan guru/tendik");
    }
    if (studentsResult.status === "rejected") {
      console.error("Kelas Data Induk untuk direktori pengguna gagal dimuat:", studentsResult.reason);
      warnings.push("kelas siswa");
    } else if (studentsResult.value.error) {
      console.error("Kelas Data Induk untuk direktori pengguna gagal dimuat:", studentsResult.value.error);
      warnings.push("kelas siswa");
    }

    const teacherByProfileId = new Map<string, string>();
    const teacherByNip = new Map<string, string>();
    (teachersResult.status === "fulfilled" ? teachersResult.value.data ?? [] : []).forEach((teacher) => {
      const position = teacher.employment_status?.trim();
      if (!position) return;
      if (teacher.profile_id) teacherByProfileId.set(teacher.profile_id, position);
      if (teacher.nip) teacherByNip.set(teacher.nip.trim().toLocaleLowerCase("id-ID"), position);
    });

    const studentByProfileId = new Map<string, string>();
    const studentByNisn = new Map<string, string>();
    (studentsResult.status === "fulfilled" ? studentsResult.value.data ?? [] : []).forEach((student) => {
      const classRelation = Array.isArray(student.class) ? student.class[0] : student.class;
      const className = classRelation?.name?.trim();
      if (!className) return;
      if (student.profile_id) studentByProfileId.set(student.profile_id, className);
      if (student.nisn) studentByNisn.set(student.nisn.trim().toLocaleLowerCase("id-ID"), className);
    });

    setUserDirectoryMetadataWarning(
      warnings.length ? `Keterangan ${warnings.join(" dan ")} belum dapat ditampilkan.` : "",
    );
    return users.map((user): ManagedUserDirectoryEntry => {
      const normalizedUsername = user.username.trim().toLocaleLowerCase("id-ID");
      return {
        ...user,
        employmentStatus: teacherByProfileId.get(user.id) ?? teacherByNip.get(normalizedUsername) ?? null,
        className: studentByProfileId.get(user.id) ?? studentByNisn.get(normalizedUsername) ?? null,
      };
    });
  }, []);

const loadManagedUsers = useCallback(async () => {
  setUsersLoading(true);
  setUsersError("");

  try {
    const users = await getManagedUsers();
    setManagedUsers(await attachManagedUserDirectoryMetadata(users));
    setUsersLoaded(true);
  } catch (error) {
    setUsersError(
      error instanceof Error
        ? error.message
        : "Daftar pengguna gagal dimuat."
    );
} finally {
    setUsersLoading(false);
  }
}, [attachManagedUserDirectoryMetadata]);

const loadStudentAccountGenerator = async () => {
  if (currentUser?.role !== "super_admin") return;
  setStudentGeneratorLoading(true);
  setStudentGeneratorError("");
  setStudentGeneratorMessage("");
  try {
    const [users, studentsResult] = await Promise.all([
      getManagedUsers(),
      supabase
        .from("students")
        .select("id,nisn,full_name,status,class_id,class:classes!students_class_id_fkey(name)")
        .order("full_name", { ascending: true }),
    ]);
    if (studentsResult.error) throw studentsResult.error;

    const existingUsernames = new Set(
      users.map((user) => user.username.trim().toLowerCase()),
    );
    const students = (studentsResult.data ?? []) as unknown as StudentAccountSourceRow[];
    const normalizedNisns = students.map((student) => (student.nisn ?? "").trim());
    const nisnCounts = new Map<string, number>();
    normalizedNisns.forEach((nisn) => {
      if (nisn) nisnCounts.set(nisn.toLowerCase(), (nisnCounts.get(nisn.toLowerCase()) ?? 0) + 1);
    });

    const rows = students.map((student, index): StudentAccountGeneratorRow => {
      const nisn = normalizedNisns[index];
      const fullName = (student.full_name ?? "").trim();
      const classRelation = Array.isArray(student.class) ? student.class[0] : student.class;
      const className = classRelation?.name?.trim() ?? "";
      const hasAccount = existingUsernames.has(nisn.toLowerCase());
      let status: StudentAccountGeneratorStatus = "ready";
      let message = "Siap dibuat";

      if (!/^\d{10}$/.test(nisn)) {
        status = "invalid";
        message = "NISN harus terdiri dari 10 angka";
      } else if (fullName.length < 2 || fullName.length > 150) {
        status = "invalid";
        message = "Nama harus terdiri dari 2–150 karakter";
      } else if (student.status !== "Active") {
        status = "invalid";
        message = `Status siswa ${student.status ?? "tidak diketahui"}; hanya siswa Active diproses`;
      } else if ((nisnCounts.get(nisn.toLowerCase()) ?? 0) > 1) {
        status = "duplicate";
        message = "NISN muncul lebih dari sekali di Data Induk";
      } else if (hasAccount) {
        status = "existing";
        message = "Sudah punya akun";
      }

      return {
        id: student.id,
        nisn,
        fullName,
        classId: student.class_id,
        className,
        studentStatus: student.status ?? "",
        hasAccount,
        status,
        message,
      };
    });

    setManagedUsers(await attachManagedUserDirectoryMetadata(users));
    setUsersLoaded(true);
    setUsersError("");
    setStudentGeneratorRows(rows);
    setStudentGeneratorSelectedIds(rows.filter((row) => row.status === "ready").map((row) => row.id));
  } catch (error) {
    setStudentGeneratorError(
      error instanceof Error ? error.message : "Data siswa atau akun gagal dimuat.",
    );
  } finally {
    setStudentGeneratorLoading(false);
  }
};

const loadTeacherAccountGenerator = async () => {
  if (currentUser?.role !== "super_admin") return;
  setTeacherGeneratorLoading(true);
  setTeacherGeneratorError("");
  setTeacherGeneratorMessage("");
  try {
    const [users, teachers] = await Promise.all([
      getManagedUsers(),
      (async () => {
        const rows: TeacherAccountSourceRow[] = [];
        const pageSize = 1000;
        for (let offset = 0; ; offset += pageSize) {
          const { data, error } = await supabase.from("teachers")
            .select("id,profile_id,nip,full_name,employment_status,staff_category,primary_role,additional_roles")
            .order("full_name")
            .order("id")
            .range(offset, offset + pageSize - 1);
          if (error) throw error;
          const page = (data ?? []).map((teacher) => ({
            id: teacher.id,
            profileId: teacher.profile_id,
            nip: teacher.nip?.trim() ?? "",
            fullName: teacher.full_name?.trim() ?? "",
            employmentStatus: teacher.employment_status?.trim() ?? "",
            staffCategory: teacher.staff_category?.trim() ?? "",
            primaryRole: teacher.primary_role?.trim() || teacher.employment_status?.trim() || "",
            additionalRoles: Array.isArray(teacher.additional_roles) ? teacher.additional_roles : [],
          }));
          rows.push(...page);
          if (page.length < pageSize) break;
        }
        return rows;
      })(),
    ]);

    const usernameCounts = new Map<string, number>();
    teachers.forEach((teacher) => {
      const username = normalizeAccountUsername(teacher.nip);
      if (username) usernameCounts.set(username, (usernameCounts.get(username) ?? 0) + 1);
    });
    const usersByUsername = new Map(
      users.map((user) => [normalizeAccountUsername(user.username), user]),
    );
    const usersById = new Map(users.map((user) => [user.id, user]));
    const rows = teachers.map((teacher): TeacherAccountGeneratorRow => {
      const username = normalizeAccountUsername(teacher.nip);
      const profileAccount = teacher.profileId ? usersById.get(teacher.profileId) : undefined;
      const usernameAccount = username ? usersByUsername.get(username) : undefined;
      const account = profileAccount ?? usernameAccount;
      const role = teacherRoleForGenerator(teacher.primaryRole, teacher.staffCategory);
      const linked = Boolean(teacher.profileId && profileAccount?.id === teacher.profileId);
      const row: TeacherAccountGeneratorRow = {
        ...teacher,
        role,
        hasAccount: Boolean(account),
        status: "ready",
        message: "Siap dibuat",
      };

      if (!/^\d{6,}$/.test(teacher.nip)) {
        row.status = "invalid";
        row.message = "NIP harus berisi minimal 6 angka";
      } else if (teacher.fullName.length < 2 || teacher.fullName.length > 150) {
        row.status = "invalid";
        row.message = "Nama harus terdiri dari 2–150 karakter";
      } else if ((usernameCounts.get(username) ?? 0) > 1) {
        row.status = "duplicate";
        row.message = "NIP muncul lebih dari sekali di Data Induk";
      } else if (
        profileAccount
        && usernameAccount
        && profileAccount.id !== usernameAccount.id
      ) {
        row.status = "invalid";
        row.message = usernameAccount.role === "siswa"
          ? "NIP sudah digunakan akun siswa"
          : usernameAccount.role === "super_admin"
            ? "NIP sudah digunakan akun Super Admin"
            : "NIP sudah digunakan akun lain selain profil tertaut";
      } else if (account?.role === "siswa") {
        row.status = "invalid";
        row.message = "NIP sudah digunakan akun siswa";
      } else if (account?.role === "super_admin") {
        row.status = "invalid";
        row.message = "Akun Super Admin tidak dapat ditautkan";
      } else if (teacher.profileId && account && teacher.profileId !== account.id) {
        row.status = "invalid";
        row.message = "Data Induk sudah tertaut ke akun lain";
      } else if (teacher.profileId && !account) {
        row.status = "invalid";
        row.message = "Profil tertaut tidak ditemukan di daftar pengguna";
      } else if (linked) {
        row.status = "existing";
        row.message = "Akun sudah tertaut";
      } else if (account) {
        row.status = "link";
        row.message = "Akun dengan NIP ini akan ditautkan";
      }
      return row;
    });

    setManagedUsers(await attachManagedUserDirectoryMetadata(users));
    setUsersLoaded(true);
    setUsersError("");
    setTeacherGeneratorRows(rows);
    setTeacherGeneratorSelectedIds([]);
  } catch (error) {
    setTeacherGeneratorError(
      error instanceof Error ? error.message : "Data guru/tendik atau akun gagal dimuat.",
    );
  } finally {
    setTeacherGeneratorLoading(false);
  }
};

const createTeacherAccountsFromDataInduk = async () => {
  if (currentUser?.role !== "super_admin" || teacherGeneratorCreating) return;
  const selectedRows = teacherGeneratorRows.filter((row) =>
    ["ready", "link"].includes(row.status) && teacherGeneratorSelectedIds.includes(row.id),
  );
  if (!selectedRows.length) return;
  if (!window.confirm(
    `Proses ${selectedRows.length} akun guru/tendik yang dipilih? Akun baru memakai NIP sebagai username dan password awal.`,
  )) return;

  setTeacherGeneratorCreating(true);
  setTeacherGeneratorError("");
  setTeacherGeneratorMessage("");
  const completedIds: string[] = [];
  let createdCount = 0;
  let linkedCount = 0;
  let syncWarningCount = 0;
  try {
    const latestUsers = await getManagedUsers();
    const usersByUsername = new Map(
      latestUsers.map((user) => [normalizeAccountUsername(user.username), user]),
    );
    const usersById = new Map(latestUsers.map((user) => [user.id, user]));
    setManagedUsers(await attachManagedUserDirectoryMetadata(latestUsers));
    setUsersLoaded(true);

    for (let index = 0; index < selectedRows.length; index += 1) {
      const row = selectedRows[index];
      setTeacherGeneratorRows((current) => current.map((item) => item.id === row.id
        ? { ...item, status: "creating", message: "Membuat atau menautkan akun..." }
        : item));

      try {
        if (!/^\d{6,}$/.test(row.nip)) {
          throw new Error("NIP harus berisi minimal 6 angka.");
        }
        const profileAccount = row.profileId ? usersById.get(row.profileId) : undefined;
        const usernameAccount = usersByUsername.get(normalizeAccountUsername(row.nip));
        if (
          profileAccount
          && usernameAccount
          && profileAccount.id !== usernameAccount.id
        ) {
          if (usernameAccount.role === "siswa") {
            throw new Error("NIP sudah digunakan akun siswa; penautan dibatalkan.");
          }
          if (usernameAccount.role === "super_admin") {
            throw new Error("NIP sudah digunakan akun Super Admin; penautan dibatalkan.");
          }
          throw new Error("NIP sudah digunakan akun lain selain profil tertaut.");
        }
        let account: ManagedUser | undefined = profileAccount ?? usernameAccount;
        if (account?.role === "siswa") {
          throw new Error("NIP sudah digunakan akun siswa; penautan dibatalkan.");
        }
        if (account?.role === "super_admin") {
          throw new Error("Akun Super Admin dilindungi dan tidak dapat ditautkan.");
        }
        if (row.profileId && account && row.profileId !== account.id) {
          throw new Error("Data Induk sudah tertaut ke akun lain.");
        }
        if (row.profileId && !account) {
          throw new Error("Profil tertaut tidak ditemukan di daftar pengguna.");
        }

        let wasCreated = false;
        if (!account) {
          const createdUser = await createManagedUserAccount({
            username: row.nip,
            full_name: row.fullName,
            role: row.role,
            password: row.nip,
          });
          account = { ...createdUser, created_at: new Date().toISOString() };
          wasCreated = true;
          latestUsers.push(account);
          usersById.set(account.id, account);
          usersByUsername.set(normalizeAccountUsername(account.username), account);
        }

        const { data: savedTeacher, error: linkError } = await supabase.from("teachers")
          .update({ profile_id: account.id })
          .eq("id", row.id)
          .select("id")
          .single();
        if (linkError) throw new Error(`Tautan Data Induk gagal: ${linkError.message}`);
        if (!savedTeacher) throw new Error("Data guru/tendik tidak ditemukan saat menyimpan tautan.");

        let syncWarning = "";
        try {
          await syncTeacherManagedAccount(row.id);
        } catch (error) {
          syncWarning = error instanceof Error ? error.message : String(error);
          syncWarningCount += 1;
        }
        completedIds.push(row.id);
        if (wasCreated) createdCount += 1;
        else linkedCount += 1;
        setTeacherGeneratorRows((current) => current.map((item) => item.id === row.id
          ? {
              ...item,
              profileId: account.id,
              hasAccount: true,
              status: "created",
              role: syncWarning ? item.role : account.role,
              message: syncWarning
                ? `Akun tertaut, tetapi sinkronisasi peran gagal: ${syncWarning}`
                : wasCreated ? "Akun dibuat, ditautkan, dan disinkronkan" : "Akun berhasil ditautkan dan disinkronkan",
            }
          : item));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Akun gagal dibuat atau ditautkan.";
        setTeacherGeneratorRows((current) => current.map((item) => item.id === row.id
          ? { ...item, status: "failed", message }
          : item));
      }
      if (index < selectedRows.length - 1) {
        await new Promise<void>((resolve) => window.setTimeout(resolve, 250));
      }
    }

    setTeacherGeneratorSelectedIds((current) => current.filter((id) => !completedIds.includes(id)));
    const failedCount = selectedRows.length - completedIds.length;
    setTeacherGeneratorMessage(
      `${createdCount} akun dibuat, ${linkedCount} akun ditautkan, ${failedCount} gagal.`
      + (syncWarningCount ? ` Sinkronisasi peran gagal pada ${syncWarningCount} akun.` : ""),
    );
    if (completedIds.length) {
      const auditWarning = await auditUserChange(
        "Akun guru/tendik disinkronkan dari Data Induk",
        `${createdCount} akun dibuat dan ${linkedCount} akun yang sudah ada ditautkan.`,
      );
      if (auditWarning) setTeacherGeneratorMessage((current) => `${current} ${auditWarning}`);
    }
    await loadManagedUsers();
  } catch (error) {
    setTeacherGeneratorError(
      error instanceof Error ? error.message : "Daftar akun terbaru gagal dimuat.",
    );
  } finally {
    setTeacherGeneratorCreating(false);
  }
};

const createStudentAccountsFromDataInduk = async () => {
  if (currentUser?.role !== "super_admin" || studentGeneratorCreating) return;
  const selectedRows = studentGeneratorRows.filter(
    (row) => row.status === "ready" && studentGeneratorSelectedIds.includes(row.id),
  );
  if (!selectedRows.length) return;

  setStudentGeneratorCreating(true);
  setStudentGeneratorError("");
  setStudentGeneratorMessage("");
  const createdIds: string[] = [];
  let createdCount = 0;
  try {
    const latestUsers = await getManagedUsers();
    setManagedUsers(await attachManagedUserDirectoryMetadata(latestUsers));
    setUsersLoaded(true);
    const latestUsernames = new Set(
      latestUsers.map((user) => user.username.trim().toLowerCase()),
    );
    const rowsToCreate = selectedRows.filter((row) => !latestUsernames.has(row.nisn.toLowerCase()));
    const alreadyCreatedRows = selectedRows.filter((row) => latestUsernames.has(row.nisn.toLowerCase()));
    alreadyCreatedRows.forEach((row) => {
      setStudentGeneratorRows((current) => current.map((item) => item.id === row.id
        ? { ...item, hasAccount: true, status: "existing", message: "Sudah punya akun" }
        : item));
    });
    if (!rowsToCreate.length) {
      setStudentGeneratorMessage("Semua siswa yang dipilih sudah memiliki akun.");
      await loadManagedUsers();
      return;
    }
    if (!window.confirm(
      `Buat ${rowsToCreate.length} akun siswa? Username dan password awal setiap akun adalah NISN masing-masing.`,
    )) {
      return;
    }

    for (let index = 0; index < rowsToCreate.length; index += 1) {
      const row = rowsToCreate[index];
      setStudentGeneratorRows((current) => current.map((item) => item.id === row.id
        ? { ...item, status: "creating", message: "Membuat akun..." }
        : item));

      try {
        let createdUser: Awaited<ReturnType<typeof createManagedUserAccount>> | null = null;
        let attempt = 0;
        while (!createdUser) {
          try {
            createdUser = await createManagedUserAccount({
              username: row.nisn,
              full_name: row.fullName,
              role: "siswa",
              password: row.nisn,
            });
          } catch (error) {
            if (!isSupabaseRateLimitError(error) || attempt >= 3) throw error;
            await new Promise<void>((resolve) =>
              window.setTimeout(resolve, 1000 * (2 ** attempt)),
            );
            attempt += 1;
          }
        }

        let linkWarning = "";
        const { error: linkError } = await supabase
          .from("students")
          .update({ profile_id: createdUser.id })
          .eq("id", row.id);
        if (linkError) {
          const missingProfileId = linkError.code === "42703"
            || (linkError.code === "PGRST204" && linkError.message.includes("profile_id"));
          if (!missingProfileId) linkWarning = `Akun dibuat, tetapi tautan Data Induk gagal: ${linkError.message}`;
        }

        createdCount += 1;
        createdIds.push(row.id);
        setStudentGeneratorRows((current) => current.map((item) => item.id === row.id
          ? {
              ...item,
              hasAccount: true,
              status: "created",
              message: linkWarning || "Akun berhasil dibuat",
            }
          : item));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Akun gagal dibuat.";
        setStudentGeneratorRows((current) => current.map((item) => item.id === row.id
          ? { ...item, status: "failed", message }
          : item));
      }

      if (index < rowsToCreate.length - 1) {
        await new Promise<void>((resolve) => window.setTimeout(resolve, 250));
      }
    }

    setStudentGeneratorSelectedIds((current) => current.filter((id) => !createdIds.includes(id)));
    const failedCount = rowsToCreate.length - createdCount;
    setStudentGeneratorMessage(`${createdCount} akun berhasil dibuat, ${failedCount} gagal.`);
    const auditWarning = createdCount
      ? await auditUserChange(
          "Akun siswa digenerate dari Data Induk",
          `${createdCount} akun siswa berhasil dibuat.`,
        )
      : "";
    if (auditWarning) setStudentGeneratorMessage((current) => `${current} ${auditWarning}`);
    await loadManagedUsers();
  } catch (error) {
    setStudentGeneratorError(
      error instanceof Error ? error.message : "Daftar akun terbaru gagal dimuat.",
    );
  } finally {
    setStudentGeneratorCreating(false);
  }
};

const moduleEnabledOverrides = useMemo(() => {
  const normalizeModuleName = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
  const nextSettings: Record<string, boolean> = {};
  const legacyModuleName = normalizeModuleName("Kesiswaan & BK");

  for (const setting of moduleSettings) {
    const identifiers = [setting.label, setting.module_key, setting.route_key]
      .filter((value): value is string => typeof value === "string")
      .map(normalizeModuleName);
    const app = apps.find((item) => identifiers.includes(normalizeModuleName(item.name)));
    if (app) nextSettings[app.name] = setting.is_enabled;
  }

  const legacySetting = moduleSettings.find((setting) =>
    [setting.label, setting.module_key, setting.route_key]
      .filter((value): value is string => typeof value === "string")
      .some((value) => normalizeModuleName(value) === legacyModuleName)
  );
  if (legacySetting) {
    nextSettings.Kesiswaan ??= legacySetting.is_enabled;
    nextSettings["Bimbingan dan Konseling"] ??= legacySetting.is_enabled;
  }

  return nextSettings;
}, [moduleSettings]);

useEffect(() => {
  if (contextError) setToast(`Konteks sekolah gagal dimuat: ${contextError}`);
}, [contextError]);

const refreshSettingsContext = useCallback(async () => {
  try {
    await refreshSchoolContext();
  } catch (error) {
    setToast(error instanceof Error
      ? `Pengaturan sekolah gagal diperbarui: ${error.message}`
      : "Pengaturan sekolah gagal diperbarui.");
  }
}, [refreshSchoolContext]);

const auditUserChange = async (action: string, details: string) => {
  try {
    await logAppActivity({
      actorId: currentUser?.id,
      actorLabel: currentUser?.full_name || currentUser?.username,
      actorRole: currentUser?.role,
      action,
      moduleKey: "Pengguna",
      details,
    });
    return "";
  } catch (error) {
    return `Perubahan tersimpan, tetapi audit aktivitas gagal: ${error instanceof Error ? error.message : String(error)}`;
  }
};

const createManagedUser = async (
  event: React.FormEvent<HTMLFormElement>
) => {
  event.preventDefault();
  setSavingUser(true);
  setToast("");

  try {
    const { data, error } = await supabase.functions.invoke(
      "manage-users",
      {
        body: {
          action: "create",
          username: newUserNip.trim(),
          full_name: newUserName.trim(),
          role: newUserRole,
          password: newUserPassword.trim(),
        },
      }
    );

    if (error) {
  let serverMessage = "";

  try {
    const response = (error as { context?: Response }).context;

    if (response) {
      const payload = await response.clone().json();
      serverMessage = payload?.error || "";
    }
  } catch {
    // Menggunakan pesan error cadangan jika pesan server tidak terbaca.
  }

  throw new Error(
    serverMessage || data?.error || error.message || "Akun gagal dibuat."
  );
}

    if (!data || data.error) {
      throw new Error(data?.error || "Akun gagal dibuat.");
    }

    const auditWarning = await auditUserChange(
      "Akun pengguna dibuat",
      `${newUserName.trim()} · ${newUserNip.trim()} · ${newUserRole}`,
    );
    setToast(auditWarning || (
      typeof data.message === "string"
        ? data.message
        : "Akun pengguna berhasil dibuat."
    ));
    setNewUserNip("");
    setNewUserName("");
    setNewUserPassword("");
    setNewUserRole("guru");
    setShowAddUserForm(false);

    await loadManagedUsers();
  } catch (error) {
    setToast(
      error instanceof Error
        ? error.message
        : "Akun gagal dibuat."
    );
  } finally {
    setSavingUser(false);
  }
};

const updateManagedUser = async (
  userId: string,
  changes: { role?: string; status?: "active" | "disabled" }
) => {
  const confirmed = window.confirm(
    changes.status
      ? changes.status === "disabled"
        ? "Nonaktifkan akun ini? Pengguna tidak dapat login kembali."
        : "Aktifkan kembali akun ini?"
      : "Simpan perubahan role pengguna ini?"
  );

  if (!confirmed) return;

  setUsersError("");
  setToast("");

  try {
    const { data, error } = await supabase.functions.invoke(
      "manage-users",
      {
        body: {
          action: "update",
          user_id: userId,
          ...changes,
        },
      }
    );

    
if (error) {
  let serverMessage = "";

  try {
    const response = (error as { context?: Response }).context;

    if (response) {
      const payload = await response.clone().json();
      serverMessage = payload?.error || "";
    }
  } catch {
    // Gunakan pesan error umum jika respons bukan JSON.
  }

  throw new Error(
    serverMessage ||
      data?.error ||
      error.message ||
      "Perubahan gagal disimpan."
  );
}


    if (!data || data.error) {
      throw new Error(data?.error || "Perubahan gagal disimpan.");
    }

    const detail = changes.role
      ? `Role ${userId} diubah menjadi ${roleLabels[changes.role] ?? changes.role}`
      : `Status akun ${userId} diubah menjadi ${changes.status}`;
    const auditWarning = await auditUserChange("Akun pengguna diperbarui", detail);
    setToast(auditWarning ||
      data.message || "Perubahan pengguna berhasil disimpan."
    );

    await loadManagedUsers();
  } catch (error) {
    setToast(
      error instanceof Error
        ? error.message
        : "Perubahan pengguna gagal disimpan."
    );
  }
};


const deleteManagedUser = async (user: ManagedUser) => {
  const confirmed = window.confirm(
    `Hapus akun ${user.full_name} (${user.username}) secara permanen? Tindakan ini tidak dapat dibatalkan.`
  );

  if (!confirmed) return;

  setToast("");

  try {
    const { data, error } = await supabase.functions.invoke(
      "manage-users",
      {
        body: {
          action: "delete",
          user_id: user.id,
        },
      }
    );

    if (error) {
      let serverMessage = "";

      try {
        const response = (error as { context?: Response }).context;
        if (response) {
          const payload = await response.clone().json();
          serverMessage = payload?.error || "";
        }
      } catch {
        // Gunakan pesan cadangan.
      }

      throw new Error(
        serverMessage || data?.error || error.message || "Pengguna gagal dihapus."
      );
    }

    if (!data || data.error) {
      throw new Error(data?.error || "Pengguna gagal dihapus.");
    }

    const auditWarning = await auditUserChange(
      "Akun pengguna dihapus",
      `${user.full_name} · ${user.username}`,
    );
    setToast(auditWarning || data.message || "Pengguna berhasil dihapus.");
    await loadManagedUsers();
  } catch (error) {
    setToast(
      error instanceof Error
        ? error.message
        : "Pengguna gagal dihapus."
    );
  }
};

const openEditUser = (user: ManagedUser) => {
  setEditingUser(user);
  setEditUserNip(user.username);
  setEditUserName(user.full_name);
  setEditUserError("");
};

const saveEditedUser = async (
  event: React.FormEvent<HTMLFormElement>
) => {
  event.preventDefault();

  if (!editingUser) return;

  setSavingEditUser(true);
  setEditUserError("");

  try {
    const { data, error } = await supabase.functions.invoke(
      "manage-users",
      {
        body: {
          action: "update",
          user_id: editingUser.id,
          username: editUserNip.trim(),
          full_name: editUserName.trim(),
        },
      }
    );

    if (error) {
      throw new Error(
        data?.error || error.message || "Data gagal diperbarui."
      );
    }

    if (!data || data.error) {
      throw new Error(data?.error || "Data gagal diperbarui.");
    }

    const auditWarning = await auditUserChange(
      "Identitas akun diperbarui",
      `${editUserName.trim()} · ${editUserNip.trim()}`,
    );
    setToast(auditWarning ||
      data.message || "Data pengguna berhasil diperbarui."
    );
    setEditingUser(null);

    await loadManagedUsers();
  } catch (error) {
    setToast(
      error instanceof Error
        ? error.message
        : "Data pengguna gagal diperbarui."
    );
  } finally {
    setSavingEditUser(false);
  }
};

const [supabaseStatus, setSupabaseStatus] = useState("Memeriksa koneksi...");

useEffect(() => {
  let mounted = true;
  let sessionSyncId = 0;
  let recoveryTimer = 0;
  let recoveryAttempt = 0;

  function clearRecoveryTimer() {
    if (recoveryTimer) window.clearTimeout(recoveryTimer);
    recoveryTimer = 0;
  }

  function scheduleSessionRecovery(syncId: number, staleAccount?: CachedSessionUser | null) {
    if (!mounted || syncId !== sessionSyncId) return;
    recoveryAttempt += 1;
    const backoffDelay = Math.min(
      30_000 * 2 ** (recoveryAttempt - 1) + Math.floor(Math.random() * 30_000),
      5 * 60_000,
    );
    const retryDelay = Math.max(
      getSupabaseSessionRetryDelayMs(),
      backoffDelay,
    );
    if (staleAccount) {
      currentUserRef.current = staleAccount;
      setCurrentUser(staleAccount);
    }
    setAuthReady(true);
    setAuthError("");
    setSessionRecoveryMessage(
      "Koneksi Supabase sedang dibatasi. Data yang sudah dimuat tetap tersedia; pemulihan dilakukan dengan jeda.",
    );
    setSupabaseStatus("Supabase membatasi permintaan sementara");
    clearRecoveryTimer();
    recoveryTimer = window.setTimeout(() => {
      recoveryTimer = 0;
      if (mounted && syncId === sessionSyncId) void syncSession();
    }, retryDelay);
  }

  async function syncSession() {
    clearRecoveryTimer();
    const syncId = ++sessionSyncId;
    let retryScheduled = false;

    try {
      const session = await withTimeout(
        getValidSupabaseSession(),
        16_000,
        "Pemeriksaan sesi Supabase melewati batas waktu.",
      );
      const userId = session?.user.id;

      if (!userId) {
        if (mounted && syncId === sessionSyncId) {
          recoveryAttempt = 0;
          if (currentUserRef.current?.id) clearLoginSessionTracking(currentUserRef.current.id);
          clearCachedSessionUser(currentUserRef.current?.id);
          currentUserRef.current = null;
          setSessionRecoveryMessage("");
          setCurrentUser(null);
          setAuthError("");
          setActivePage("Dashboard");
          setAuthReady(true);
        }
        return;
      }

      const { data: profile, error: profileError } = await withTimeout(Promise.resolve(supabase
        .from("profiles")
        .select("id, username, role, status")
        .eq("id", userId)
        .maybeSingle()));

      if (syncId !== sessionSyncId || !mounted) return;

      if (profileError) {
        if (isTemporarySessionFailure(profileError)) {
          retryScheduled = true;
          const staleAccount = currentUserRef.current?.id === userId
            ? currentUserRef.current
            : readCachedSessionUser(userId);
          scheduleSessionRecovery(syncId, staleAccount);
          return;
        }
        console.error("Profil pengguna gagal diperiksa:", profileError);
        setAuthError(`Profil akun belum dapat diverifikasi: ${profileError.message}`);
        return;
      }

      if (profile?.role === "siswa" && profile.status !== "active") {
        await supabase.auth.signOut({ scope: "local" });
        if (syncId !== sessionSyncId || !mounted) return;
        clearCachedSessionUser(userId);
        currentUserRef.current = null;
        setCurrentUser(null);
        setActivePage("Dashboard");
        setAuthError("Akun siswa sedang nonaktif di Data Induk. Hubungi administrator sekolah.");
        return;
      }

      if (!profile || profile.status !== "active" || profile.role === "pending") {
        await supabase.auth.signOut({ scope: "local" });
        if (syncId !== sessionSyncId || !mounted) return;
        clearCachedSessionUser(userId);
        currentUserRef.current = null;
        setCurrentUser(null);
        setAuthError("");
        setActivePage("Dashboard");
        return;
      }

      if (profile.role === "siswa") {
        const { data: studentStatus, error: studentStatusError } = await withTimeout(
          Promise.resolve(supabase.rpc("get_my_student_account_status")),
          12_000,
          "Pemeriksaan status siswa melewati batas waktu.",
        );
        if (syncId !== sessionSyncId || !mounted) return;
        if (studentStatusError) {
          if (isTemporarySessionFailure(studentStatusError)) {
            retryScheduled = true;
            const staleAccount = currentUserRef.current?.id === userId
              ? currentUserRef.current
              : readCachedSessionUser(userId);
            scheduleSessionRecovery(syncId, staleAccount);
            return;
          }
          console.error("Status siswa gagal diperiksa:", studentStatusError);
          setAuthError(`Status siswa belum dapat diverifikasi: ${studentStatusError.message}`);
          return;
        }
        if (typeof studentStatus === "string" && studentStatus.toLowerCase() !== "active") {
          await supabase.auth.signOut({ scope: "local" });
          if (syncId !== sessionSyncId || !mounted) return;
          clearCachedSessionUser(userId);
          currentUserRef.current = null;
          setCurrentUser(null);
          setActivePage("Dashboard");
          setAuthError("Akun siswa sedang nonaktif di Data Induk. Hubungi administrator sekolah.");
          return;
        }
      }

      recoveryAttempt = 0;
      setSessionRecoveryMessage("");
      setAuthError("");
      const nextUser = {
        id: profile.id,
        username: profile.username,
        role: profile.role,
      };
      writeCachedSessionUser(nextUser);
      currentUserRef.current = currentUserRef.current?.id === nextUser.id
        ? { ...currentUserRef.current, ...nextUser }
        : nextUser;
      setSupabaseStatus("Database terhubung");
      setCurrentUser((currentUser) => {
        const mergedUser = currentUser?.id === nextUser.id
          ? { ...currentUser, ...nextUser }
          : currentUserRef.current?.id === nextUser.id
            ? currentUserRef.current
            : nextUser;
        currentUserRef.current = mergedUser;
        return mergedUser;
      });
    } catch (error) {
      if (mounted && syncId === sessionSyncId) {
        if (isTemporarySessionFailure(error)) {
          retryScheduled = true;
          const userId = getCachedSupabaseSession()?.user.id
            ?? currentUserRef.current?.id
            ?? null;
          const staleAccount = userId
            ? currentUserRef.current?.id === userId
              ? currentUserRef.current
              : readCachedSessionUser(userId)
            : null;
          scheduleSessionRecovery(syncId, staleAccount);
          return;
        }
        console.error("Pemeriksaan sesi gagal:", error);
        const message = error instanceof Error ? error.message : String(error);
        setAuthError(`Sesi login belum dapat diverifikasi: ${message}`);
      }
    } finally {
      if (mounted && syncId === sessionSyncId && !retryScheduled) setAuthReady(true);
    }
  }

  const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
    if (!mounted) return;

    if (event === "INITIAL_SESSION") return;

    if (event === "SIGNED_OUT") {
      clearRecoveryTimer();
      recoveryAttempt = 0;
      if (currentUserRef.current?.id) clearLoginSessionTracking(currentUserRef.current.id);
      clearCachedSessionUser(currentUserRef.current?.id);
      currentUserRef.current = null;
      sessionSyncId += 1;
      setCurrentUser(null);
      setLoginSessionId("");
      setAuthError("");
      setSessionRecoveryMessage("");
      setActivePage("Dashboard");
      setAuthReady(true);
      return;
    }

    if (event !== "SIGNED_IN") return;

    clearRecoveryTimer();
    recoveryAttempt = 0;
    if (session?.user.id) {
      setLoginSessionId(getLoginSessionMarker(session.user.id));
    }
    setAutomaticLogoutNotice("");
    setAuthReady(false);
    setAuthError("");
    setSessionRecoveryMessage("");
    sessionSyncId += 1;
    const scheduledSyncId = sessionSyncId;
    window.setTimeout(() => {
      if (mounted && scheduledSyncId === sessionSyncId) {
        void syncSession();
      }
    }, 0);
  });

  void syncSession();

  return () => {
    mounted = false;
    clearRecoveryTimer();
    subscription.unsubscribe();
  };
}, [sessionRetry, setCurrentUser]);

async function signOutFromMaintenanceLock() {
  try {
    const { error } = await supabase.auth.signOut({ scope: "local" });
    if (error) throw error;
  } catch (error) {
    console.error("Keluar dari aplikasi saat pemeliharaan gagal:", error);
    setAuthError(
      error instanceof Error
        ? error.message
        : "Tidak dapat keluar dari aplikasi. Silakan coba kembali.",
    );
  }
}

useEffect(() => {
  if (!currentUser) {
    setDashboardStats(initialDashboardStats);
    return;
  }
  if (activePage !== "Dashboard") return;

  const dashboardUser = currentUser;
  let active = true;
  const canViewSchoolTotals = ["super_admin", "operator"].includes(dashboardUser.role);
  if (canViewSchoolTotals) {
    setDashboardStats(
      readCachedDashboardStats(dashboardUser.id) ?? initialDashboardStats,
    );
  }
  const requestState = dashboardStatsRefreshState.current.get(dashboardUser.id) ?? {
    lastRequestedAt: 0,
    inFlight: false,
    requestId: 0,
  };
  dashboardStatsRefreshState.current.set(dashboardUser.id, requestState);
  async function loadDashboardStats() {
    if (!active || requestState.inFlight) return;
    if (Date.now() - requestState.lastRequestedAt < 120_000) {
      setDashboardRefreshing(false);
      return;
    }
    if (dashboardUser.role === "guru_bk") {
      setDashboardRefreshing(false);
      return;
    }
    const requestId = ++requestState.requestId;
    requestState.inFlight = true;
    requestState.lastRequestedAt = Date.now();
    setDashboardRefreshing(true);

    if (!canViewSchoolTotals) {
      try {
        const session = await getValidSupabaseSession();
        if (!active) return;
        if (!session) {
          setCurrentUser(null);
          return;
        }
        if (dashboardUser.role === "siswa") {
          const dateParts = new Intl.DateTimeFormat("en-CA", {
            timeZone: "Asia/Makassar",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
          }).formatToParts(new Date());
          const year = dateParts.find((part) => part.type === "year")?.value;
          const month = dateParts.find((part) => part.type === "month")?.value;
          const day = dateParts.find((part) => part.type === "day")?.value;
          if (!year || !month || !day) {
            throw new Error("Tanggal absensi sekolah tidak dapat ditentukan.");
          }
          const attendanceResult = await supabase.from("attendance_records")
            .select("id", { count: "exact", head: true })
            .eq("attendance_date", `${year}-${month}-${day}`);
          if (!active) return;
          setDashboardStats((previous) => ({
            ...previous,
            attendance: dashboardMetric(
              "kehadiran pribadi",
              attendanceResult.count,
              attendanceResult.error,
              previous.attendance,
            ),
          }));
          if (isSupabaseRateLimitError(attendanceResult.error)) {
            setSupabaseStatus("Permintaan Supabase dibatasi sementara");
          } else if (!attendanceResult.error) {
            setSupabaseStatus("Database terhubung");
          }
          return;
        }
        const canViewAttendanceToday = [
          "guru",
          "kepala_sekolah",
          "kepala_tata_usaha",
          "staff_tata_usaha",
          "tendik",
        ].includes(dashboardUser.role);
        const lettersPromise = supabase.from("letter_requests")
          .select("id", { count: "exact", head: true })
          .in("status", [...LETTER_IN_PROGRESS_STATUSES]);
        const attendancePromise = canViewAttendanceToday
          ? (() => {
              const dateParts = new Intl.DateTimeFormat("en-CA", {
                timeZone: "Asia/Makassar",
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
              }).formatToParts(new Date());
              const year = dateParts.find((part) => part.type === "year")?.value;
              const month = dateParts.find((part) => part.type === "month")?.value;
              const day = dateParts.find((part) => part.type === "day")?.value;
              if (!year || !month || !day) {
                throw new Error("Tanggal absensi sekolah tidak dapat ditentukan.");
              }
              let query = supabase.from("attendance_records")
                .select("id", { count: "exact", head: true })
                .eq("attendance_date", `${year}-${month}-${day}`);
              if (dashboardUser.role !== "kepala_sekolah") {
                query = query
                  .eq("person_type", "guru_tendik")
                  .eq("person_identifier", dashboardUser.username);
              }
              return query;
            })()
          : Promise.resolve({ count: null, error: null });
        const [lettersResult, attendanceResult] = await Promise.all([
          lettersPromise,
          attendancePromise,
        ]);
        if (!active) return;
        const restrictedMetric = {
          value: "—",
          note: "Akses data dibatasi untuk peran ini",
          trend: "Perlu peran operator/admin",
        };
        setDashboardStats((previous) => ({
          students: { value: "—", note: "Akses data dibatasi untuk peran ini", trend: "Perlu peran operator/admin" },
          staff: { value: "—", note: "Akses data dibatasi untuk peran ini", trend: "Perlu peran operator/admin" },
          attendance: canViewAttendanceToday
            ? dashboardMetric(
                "kehadiran pribadi",
                attendanceResult.count,
                attendanceResult.error,
                previous.attendance,
              )
            : restrictedMetric,
          letters: dashboardMetric("surat diproses", lettersResult.count, lettersResult.error, previous.letters),
        }));
        if (
          isSupabaseRateLimitError(lettersResult.error) ||
          isSupabaseRateLimitError(attendanceResult.error)
        ) {
          setSupabaseStatus("Permintaan Supabase dibatasi sementara");
        }
      } catch (error) {
        if (active) {
          if (isSupabaseRateLimitError(error)) {
            setSupabaseStatus("Permintaan Supabase dibatasi sementara");
          }
          const canViewAttendanceToday = [
            "guru",
            "kepala_sekolah",
            "kepala_tata_usaha",
            "staff_tata_usaha",
            "tendik",
          ].includes(dashboardUser.role);
          setDashboardStats((previous) => dashboardUser.role === "siswa"
            ? {
                ...previous,
                attendance: dashboardMetric(
                  "kehadiran pribadi",
                  null,
                  error,
                  previous.attendance,
                ),
              }
            : {
                ...previous,
                attendance: canViewAttendanceToday
                  ? dashboardMetric(
                      "kehadiran pribadi",
                      null,
                      error,
                      previous.attendance,
                    )
                  : {
                      value: "—",
                      note: "Akses data dibatasi untuk peran ini",
                      trend: "Perlu peran operator/admin",
                    },
                letters: dashboardMetric(
                  "surat diproses",
                  null,
                  error,
                  previous.letters,
                ),
              });
        }
      } finally {
        if (requestState.requestId === requestId) {
          requestState.inFlight = false;
          if (active) setDashboardRefreshing(false);
        }
      }
      return;
    }

    try {
      const session = await getValidSupabaseSession();
      if (!active) return;
      if (!session) {
        setCurrentUser(null);
        return;
      }

      const dateParts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Makassar",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).formatToParts(new Date());
      const year = dateParts.find((part) => part.type === "year")?.value;
      const month = dateParts.find((part) => part.type === "month")?.value;
      const day = dateParts.find((part) => part.type === "day")?.value;
      if (!year || !month || !day) {
        throw new Error("Tanggal absensi sekolah tidak dapat ditentukan.");
      }
      const attendanceDate = `${year}-${month}-${day}`;
      const [studentsResult, staffResult, attendanceResult, lettersResult] = await Promise.all([
        supabase.from("students").select("id", { count: "exact" }).eq("status", "Active").limit(1),
        supabase.from("teachers").select("id", { count: "exact" }).limit(1),
        supabase.from("attendance_records").select("id", { count: "exact" }).eq("attendance_date", attendanceDate).limit(1),
        supabase.from("letter_requests")
          .select("id", { count: "exact", head: true })
          .in("status", [...LETTER_IN_PROGRESS_STATUSES]),
      ]);

      if (!active) return;

      const hasRateLimitedResult = [
        studentsResult.error,
        staffResult.error,
        attendanceResult.error,
        lettersResult.error,
      ].some(isSupabaseRateLimitError);
      if (hasRateLimitedResult) {
        setSupabaseStatus("Permintaan Supabase dibatasi sementara");
      } else if (
        !studentsResult.error &&
        !staffResult.error &&
        !attendanceResult.error &&
        !lettersResult.error
      ) {
        setSupabaseStatus("Database terhubung");
      }

      setDashboardStats((previous) => ({
        students: dashboardMetric("siswa", studentsResult.count, studentsResult.error, previous.students),
        staff: dashboardMetric("guru & staf", staffResult.count, staffResult.error, previous.staff),
        attendance: dashboardMetric(
          "kehadiran",
          attendanceResult.count,
          attendanceResult.error,
          previous.attendance,
        ),
        letters: dashboardMetric(
          "surat diproses",
          lettersResult.count,
          lettersResult.error,
          previous.letters,
        ),
      }));
      if (
        canViewSchoolTotals &&
        !studentsResult.error &&
        !staffResult.error &&
        !attendanceResult.error &&
        !lettersResult.error &&
        studentsResult.count !== null &&
        staffResult.count !== null &&
        attendanceResult.count !== null &&
        lettersResult.count !== null
      ) {
        writeCachedDashboardStats(dashboardUser.id, {
          students: dashboardMetric("siswa", studentsResult.count, null, initialDashboardStats.students),
          staff: dashboardMetric("guru & staf", staffResult.count, null, initialDashboardStats.staff),
          attendance: dashboardMetric("kehadiran", attendanceResult.count, null, initialDashboardStats.attendance),
          letters: dashboardMetric("surat diproses", lettersResult.count, null, initialDashboardStats.letters),
        });
      }
    } catch (error) {
      const isRateLimited = isSupabaseRateLimitError(error);
      if (!isRateLimited) console.error("Ringkasan dashboard gagal dimuat:", error);
      if (active) {
        const message = error instanceof Error ? error.message : String(error);
        setDashboardStats((previous) => {
          const wasLoaded = previous.students.value !== "—" ||
            previous.staff.value !== "—" ||
            previous.attendance.value !== "—" ||
            previous.letters.value !== "—";
          const note = isRateLimited
            ? "Supabase membatasi permintaan sementara (HTTP 429). Data terakhir tetap ditampilkan."
            : `${wasLoaded ? "Gagal diperbarui" : "Gagal dimuat"}: ${message}`;
          const trend = isRateLimited
            ? "Jeda sementara sebelum mencoba lagi"
            : wasLoaded
              ? "Menampilkan data terakhir"
              : "Periksa koneksi database";
          return {
            students: { ...previous.students, note, trend },
            staff: { ...previous.staff, note, trend },
            attendance: { ...previous.attendance, note, trend },
            letters: { ...previous.letters, note, trend },
          };
        });
        if (isRateLimited) {
          setSupabaseStatus("Supabase sementara menolak permintaan (HTTP 429)");
        }
      }
    } finally {
      if (requestState.requestId === requestId) {
        requestState.inFlight = false;
        if (active) setDashboardRefreshing(false);
      }
    }
  }

  void loadDashboardStats();
  const intervalId = window.setInterval(() => {
    if (document.visibilityState === "visible") void loadDashboardStats();
  }, 10 * 60_000);
  let lastVisibilityRefreshAt = 0;
  const handleVisibilityChange = () => {
    if (
      document.visibilityState === "visible" &&
      Date.now() - lastVisibilityRefreshAt >= 120_000
    ) {
      lastVisibilityRefreshAt = Date.now();
      void loadDashboardStats();
    }
  };
  document.addEventListener("visibilitychange", handleVisibilityChange);

  return () => {
    active = false;
    if (requestState.inFlight) {
      requestState.inFlight = false;
      requestState.lastRequestedAt = 0;
      requestState.requestId += 1;
    }
    setDashboardRefreshing(false);
    window.clearInterval(intervalId);
    document.removeEventListener("visibilitychange", handleVisibilityChange);
  };
}, [activePage, currentUser, dashboardReload, setCurrentUser]);

  const filteredApps = useMemo(
    () => apps.filter((app) =>
      `${app.name} ${app.description} ${app.category}`
        .toLowerCase().includes(query.toLowerCase())
    ),
    [query]
  );

  
function openPage(name: string) {
  const allowedAccountSettings = name === "Pengaturan" && Boolean(currentUser);
  if (!allowedPages.includes(name) && !allowedAccountSettings) {
    setToast("Anda tidak memiliki hak akses ke halaman ini.");
    setProfileOpen(false);
    setNotificationsOpen(false);
    return;
  }

  setActivePage(name);
  setMobileMenu(false);
  setNotificationsOpen(false);
  setProfileOpen(false);

  if (name === "Dashboard") {
    setToast("");
  }
}
const handleModuleOpen = (name: string) => {
   const isSuperAdmin = currentUser?.role === "super_admin";
   const additionalRoles = currentUser?.additional_roles ?? [];
   const isTeacherRole = ["guru", "guru_bk"].includes(currentUser?.role ?? "");
   if (
     name === "Kesiswaan" &&
     isTeacherRole &&
     !additionalRoles.includes("Wakasek Kesiswaan")
   ) {
     setToast("Menu Kesiswaan hanya tersedia untuk guru dengan jabatan Wakasek Kesiswaan.");
     return;
   }
   if (
     name === "Inventaris" &&
     ["guru", "guru_bk"].includes(currentUser?.role ?? "") &&
     !additionalRoles.includes("Wakasek Sarana dan Prasarana")
   ) {
     setToast("Modul Inventaris hanya tersedia untuk Wakasek Sarana dan Prasarana.");
     return;
   }
   if (name === "Dashboard") {
    openPage("Dashboard");
    return;
  }
    if (moduleEnabledOverrides[name] === false && !isSuperAdmin) {
     setToast(`${name} sedang dinonaktifkan melalui Pengaturan & Integrasi.`);
     return;
   }
   const status = moduleStatuses[name] ?? "coming-soon";

  if (status === "coming-soon") {
    setToast(`${name} belum tersedia. Nantikan peluncurannya.`);
    return;
  }

  if (status === "development") {
    setToast(`${name} masih dalam tahap pengembangan.`);
    return;
  }

  openPage(name);
};

  
const teacherAdditionalRoles = currentUser?.additional_roles ?? [];
const isTeacherRole = ["guru", "guru_bk"].includes(currentUser?.role ?? "");
const canAccessKesiswaan = !isTeacherRole
  || teacherAdditionalRoles.includes("Wakasek Kesiswaan");
const isDashboard = activePage === "Dashboard";
const jobSpecificPages = [
  ...(isTeacherRole && teacherAdditionalRoles.includes("Wakasek Kesiswaan")
    ? ["Kesiswaan"]
    : []),
  ...( ["guru", "guru_bk"].includes(currentUser?.role ?? "")
    && teacherAdditionalRoles.includes("Wakasek Sarana dan Prasarana")
    ? ["Inventaris"]
    : []),
  ...(isTeacherRole && teacherAdditionalRoles.includes("Kepala Perpustakaan")
    ? ["Perpustakaan"]
    : []),
];
const roleAllowedPages = [...new Set([
  ...(roleAccess[currentUser?.role ?? ""] ?? [
  "Dashboard",
  ]),
  ...jobSpecificPages,
])];
const isSuperAdmin = currentUser?.role === "super_admin";
const showAttendanceAndLettersDashboard = [
  "guru",
  "kepala_sekolah",
  "kepala_tata_usaha",
  "staff_tata_usaha",
  "tendik",
  "bendahara",
].includes(currentUser?.role ?? "");
const allowedPages = roleAllowedPages.filter((name) =>
  (name !== "Kesiswaan" || canAccessKesiswaan)
  && (name !== "Inventaris"
    || !["guru", "guru_bk"].includes(currentUser?.role ?? "")
    || teacherAdditionalRoles.includes("Wakasek Sarana dan Prasarana"))
  && (name === "Dashboard" || name === "Pengaturan" || isSuperAdmin || moduleEnabledOverrides[name] !== false)
);
useEffect(() => {
  const accountSettingsAllowed = activePage === "Pengaturan";
  if (activePage !== "Dashboard" && !accountSettingsAllowed && !allowedPages.includes(activePage)) {
    setActivePage("Dashboard");
  }
}, [activePage, allowedPages]);
const quickActions = (dashboardQuickActions[currentUser?.role ?? ""] ?? [])
  .filter((action) => allowedPages.includes(action.module));
const activityItems: DashboardActivity[] = dashboardActivities.length
  ? dashboardActivities
  : dashboardNotifications.slice(0, 5).map((notification) => ({
      id: notification.id,
      title: notification.title,
      detail: notification.body,
      module: notification.module,
      createdAt: notification.createdAt,
    }));
const unreadNotificationCount = dashboardNotifications.filter((item) => item.unread).length;

useEffect(() => {
  if (!isSuperAdmin && activePage !== "Dashboard" && moduleEnabledOverrides[activePage] === false) {
    setActivePage("Dashboard");
  }
}, [activePage, isSuperAdmin, moduleEnabledOverrides]);

const visibleNavGroups = navGroups
  .map((group) => ({
    ...group,
    items: group.items.filter((item) =>
      allowedPages.includes(item.label)
    ),
  }))
  .filter((group) => group.items.length > 0);

const visibleFilteredApps = filteredApps.filter((app) =>
  allowedPages.includes(app.name) && moduleEnabledOverrides[app.name] !== false
);

const visibleApps = showAllApps
  ? visibleFilteredApps
  : visibleFilteredApps.slice(0, 8);

const filteredManagedUsers = useMemo(() => {
  const searchTerm = userSearch.trim().toLocaleLowerCase("id-ID");
  return managedUsers.filter((user) => {
    const matchesSearch = !searchTerm
      || `${user.username} ${user.full_name} ${user.employmentStatus ?? ""} ${user.className ?? ""} ${roleLabels[user.role] ?? user.role}`
        .toLocaleLowerCase("id-ID").includes(searchTerm);
    const matchesRole = userRoleFilter === "all" || user.role === userRoleFilter;
    const matchesStatus = userStatusFilter === "all"
      || (userStatusFilter === "active" ? user.status === "active" : user.status !== "active");
    return matchesSearch && matchesRole && matchesStatus;
  });
}, [managedUsers, userRoleFilter, userSearch, userStatusFilter]);

const managedUsersByGroup = useMemo(() => ({
  teachers: managedUsers.filter((user) => getManagedUserGroup(user) === "teachers"),
  staff: managedUsers.filter((user) => getManagedUserGroup(user) === "staff"),
  students: managedUsers.filter((user) => getManagedUserGroup(user) === "students"),
}), [managedUsers]);

const filteredManagedUsersByGroup = useMemo(() => ({
  teachers: filteredManagedUsers.filter((user) => getManagedUserGroup(user) === "teachers"),
  staff: filteredManagedUsers.filter((user) => getManagedUserGroup(user) === "staff"),
  students: filteredManagedUsers.filter((user) => getManagedUserGroup(user) === "students"),
}), [filteredManagedUsers]);

const studentUserClassOptions = useMemo(() => [...new Set(
  managedUsersByGroup.students
    .map((user) => user.className)
    .filter((className): className is string => Boolean(className)),
)].sort((left, right) => left.localeCompare(right, "id")), [managedUsersByGroup.students]);

const filteredStudentManagedUsers = useMemo(() => (
  filteredManagedUsersByGroup.students.filter((user) =>
    studentUserClassFilter === "all"
      || (studentUserClassFilter === "unassigned"
        ? !user.className
        : user.className === studentUserClassFilter),
  )
), [filteredManagedUsersByGroup.students, studentUserClassFilter]);

const studentGeneratorClasses = useMemo(() => {
  const classes = new Map<string, string>();
  studentGeneratorRows.forEach((row) => {
    if (row.classId && row.className) classes.set(row.classId, row.className);
  });
  return [...classes.entries()].sort((left, right) =>
    left[1].localeCompare(right[1], "id"),
  );
}, [studentGeneratorRows]);

const filteredStudentGeneratorRows = useMemo(() => {
  const searchTerm = studentGeneratorSearch.trim().toLocaleLowerCase("id-ID");
  return studentGeneratorRows.filter((row) => {
    const matchesSearch = !searchTerm
      || `${row.nisn} ${row.fullName}`.toLocaleLowerCase("id-ID").includes(searchTerm);
    const matchesClass = studentGeneratorClass === "all"
      || (studentGeneratorClass === "unassigned"
        ? !row.classId
        : row.classId === studentGeneratorClass);
    const matchesUncreated = !studentGeneratorUncreatedOnly || !row.hasAccount;
    return matchesSearch && matchesClass && matchesUncreated;
  });
}, [
  studentGeneratorClass,
  studentGeneratorRows,
  studentGeneratorSearch,
  studentGeneratorUncreatedOnly,
]);

const selectedReadyStudentCount = studentGeneratorRows.filter(
  (row) => row.status === "ready" && studentGeneratorSelectedIds.includes(row.id),
).length;

const filteredTeacherGeneratorRows = useMemo(() => {
  const searchTerm = teacherGeneratorSearch.trim().toLocaleLowerCase("id-ID");
  return teacherGeneratorRows.filter((row) => {
    const matchesSearch = !searchTerm
      || `${row.nip} ${row.fullName} ${row.employmentStatus} ${row.primaryRole} ${row.additionalRoles.join(" ")}`
        .toLocaleLowerCase("id-ID").includes(searchTerm);
    const matchesCategory = teacherGeneratorCategory === "all"
      || (teacherGeneratorCategory === "guru"
        ? row.staffCategory === "Guru"
        : row.staffCategory !== "Guru");
    const matchesUncreated = !teacherGeneratorUncreatedOnly
      || (row.status !== "existing" && row.status !== "created");
    return matchesSearch && matchesCategory && matchesUncreated;
  });
}, [
  teacherGeneratorCategory,
  teacherGeneratorRows,
  teacherGeneratorSearch,
  teacherGeneratorUncreatedOnly,
]);

const selectedReadyTeacherCount = teacherGeneratorRows.filter((row) =>
  ["ready", "link"].includes(row.status) && teacherGeneratorSelectedIds.includes(row.id),
).length;

const managedUserSubtitle = (user: ManagedUserDirectoryEntry) => {
  if (user.role === "siswa") {
    return user.className ? `Siswa · Kelas ${user.className}` : "Siswa · Kelas belum terhubung";
  }
  return user.employmentStatus || roleLabels[user.role] || user.role;
};

const renderManagedUserTable = (
  users: ManagedUserDirectoryEntry[],
  emptyMessage: string,
) => users.length === 0 ? (
  <div className="user-empty-state user-empty-state-compact">
    <span><Search size={22} /></span>
    <div><strong>Tidak ada akun di bagian ini</strong><p>{emptyMessage}</p></div>
  </div>
) : (
  <div className="user-table-scroll user-directory-table-scroll">
    <table className="user-table">
      <colgroup>
        <col className="user-table-username-column" />
        <col className="user-table-name-column" />
        <col className="user-table-role-column" />
        <col className="user-table-status-column" />
        <col className="user-table-actions-column" />
      </colgroup>
      <thead>
        <tr>
          <th>NIP / Username</th>
          <th>Nama Pengguna</th>
          <th>Role</th>
          <th>Status</th>
          <th>Aksi</th>
        </tr>
      </thead>
      <tbody>
        {users.map((user, index) => (
          <tr key={user.id} style={{ animationDelay: `${Math.min(index * 45, 360)}ms` }}>
            <td><span className="user-username">{user.username}</span></td>
            <td>
              <span className="user-person-cell">
                <span className="user-person-avatar">{user.full_name.trim().charAt(0).toUpperCase() || "?"}</span>
                <span className="user-person-copy">
                  <strong className="user-name-cell">{user.full_name}</strong>
                  <small>{managedUserSubtitle(user)}</small>
                </span>
              </span>
            </td>
            <td>
              <div className="user-role-cell">
                {user.role === "super_admin" ? (
                  <span className="user-role-label"><ShieldCheck size={14} /> Super Admin</span>
                ) : (
                  <select
                    className="user-role-select"
                    value={user.role}
                    onChange={(event) => updateManagedUser(user.id, { role: event.target.value })}
                    aria-label={`Role ${user.full_name}`}
                  >
                    {!managedUserRoleOptions.some((option) => option.value === user.role) && (
                      <option value={user.role} disabled>
                        {roleLabels[user.role] ?? user.role}
                      </option>
                    )}
                    {managedUserRoleOptions.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                )}
                {user.employmentStatus && /bendahara/i.test(user.employmentStatus) && (
                  <span className="user-position-badge">{user.employmentStatus}</span>
                )}
              </div>
            </td>
            <td>
              <span className={user.status === "active" ? "user-status-active" : "user-status-disabled"}>
                <span />{user.status === "active" ? "Aktif" : "Nonaktif"}
              </span>
            </td>
            <td>
              {user.role === "super_admin" ? (
                <span className="user-protected-label">Akun terlindungi</span>
              ) : (
                <div className="user-action-group">
                  <button type="button" className="user-action-button" onClick={() => openEditUser(user)}>
                    <Pencil size={14} /> Edit
                  </button>
                  <button
                    type="button"
                    className="user-action-button"
                    onClick={() => updateManagedUser(user.id, {
                      status: user.status === "active" ? "disabled" : "active",
                    })}
                  >
                    {user.status === "active" ? <UserRoundX size={14} /> : <UserRoundCheck size={14} />}
                    {user.status === "active" ? "Nonaktifkan" : "Aktifkan"}
                  </button>
                  <button type="button" className="user-action-button user-delete-button" onClick={() => void deleteManagedUser(user)}>
                    <Trash2 size={14} /> Hapus
                  </button>
                </div>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

  if (!authReady || !maintenanceStatusLoaded) {
  return (
    <div className="auth-loading">
      <MaintenanceBanner />
      <p role="status" aria-live="polite">
        {sessionRecoveryMessage || "Memeriksa sesi dan status pemeliharaan..."}
      </p>
      {sessionRecoveryMessage && (
        <button
          type="button"
          onClick={() => {
            setSessionRecoveryMessage("");
            setAuthReady(false);
            setSessionRetry((retry) => retry + 1);
          }}
        >
          Muat ulang sesi
        </button>
      )}
    </div>
  );
}

  if (authError) {
    return (
      <div className="auth-loading">
        <MaintenanceBanner />
        <div className="auth-error">
          <p role="alert">{authError}</p>
          <button
            type="button"
            onClick={() => {
              setAuthReady(false);
              setAuthError("");
              setSessionRecoveryMessage("");
              setSessionRetry((retry) => retry + 1);
            }}
          >
            Coba verifikasi lagi
          </button>
        </div>
      </div>
    );
  }

if (!currentUser) {
  const portals = [
    { id: "super_app" as const, label: "Super App", roles: [] },
    { id: "siswa" as const, label: "Siswa", roles: ["siswa"] },
    { id: "guru" as const, label: "Guru / Guru BK", roles: ["guru", "guru_bk"] },
    { id: "tendik" as const, label: "Tendik / Staff", roles: ["staff_tata_usaha", "kepala_tata_usaha", "tendik"] },
  ];
  const portal = portals.find((item) => item.id === loginPortal) ?? portals[0];
  return (
    <div className={`login-portal-shell login-theme-${loginTheme}`}>
      <MaintenanceBanner />
      {automaticLogoutNotice && (
        <div className="session-recovery-banner" role="status">
          <span>{automaticLogoutNotice}</span>
          <button type="button" onClick={() => setAutomaticLogoutNotice("")}>Tutup</button>
        </div>
      )}
      {sessionRecoveryMessage && (
        <div className="session-recovery-banner" role="status">
          <span>{sessionRecoveryMessage}</span>
          <button
            type="button"
            onClick={() => {
              setSessionRecoveryMessage("");
              setSessionRetry((retry) => retry + 1);
            }}
          >
            Coba pulihkan sesi
          </button>
        </div>
      )}
      <div className="login-portal-tabs" aria-label="Pilih portal login">
        {portals.map((item) => (
          <button
            type="button"
            className={loginPortal === item.id ? "active" : ""}
            key={item.id}
            onClick={() => setLoginPortal(item.id)}
            aria-pressed={loginPortal === item.id}
          >
            {item.label}
          </button>
        ))}
      </div>
      <Login
        key={loginPortal}
        moduleName={portal.label === "Super App" ? "Super App SMAN 7 MAROS" : `Portal ${portal.label}`}
        allowedRoles={portal.roles}
        loginTheme={loginTheme}
        maintenanceActive={maintenanceStatus?.is_active ?? false}
        maintenanceMessage={maintenanceStatus?.message ?? "Aplikasi sedang dalam perbaikan atau pembaruan. Silakan cek kembali beberapa saat lagi."}
        onThemeChange={setLoginTheme}
        onLoginSuccess={(user) => {
          writeCachedSessionUser(user);
          setLoginSessionId(getLoginSessionMarker(user.id));
          setAutomaticLogoutNotice("");
          currentUserRef.current = user;
          setAuthError("");
          setCurrentUser(user);
          setActivePage("Dashboard");
        }}
      />
    </div>
  );
}

if (maintenanceStatus?.is_active && currentUser.role !== "super_admin") {
  return (
    <main className="maintenance-lock-screen">
      <MaintenanceBanner />
      <section className="maintenance-lock-card" role="status">
        <span className="maintenance-lock-icon" aria-hidden="true">⚙</span>
        <h1>Aplikasi sedang dalam perbaikan</h1>
        <p>{maintenanceStatus.message}</p>
        <p>Silakan cek kembali beberapa saat lagi.</p>
        {authError && <p className="maintenance-lock-error" role="alert">{authError}</p>}
        <button type="button" onClick={() => void signOutFromMaintenanceLock()}>
          Keluar dari aplikasi
        </button>
      </section>
    </main>
  );
}

if (!isSuperAdmin && moduleEnabledOverrides[activePage] === false && activePage !== "Dashboard") {
  return (
    <main className="module-fullscreen">
      <MaintenanceBanner />
      <p>Modul ini dinonaktifkan melalui Pengaturan & Integrasi. Anda akan kembali ke Dashboard.</p>
    </main>
  );
}

if (activePage === "Absensi Digital") {
  return (
    <main className="attendance-fullscreen">
      <MaintenanceBanner />
      <button type="button" className="attendance-fullscreen-back" onClick={() => setActivePage("Dashboard")}>
        <ChevronLeft size={18} /> Kembali ke Dashboard
      </button>
      <AbsensiDigital currentUser={currentUser} userRole={currentUser.role} />
    </main>
  );
}

const moduleFullscreenComponents: Partial<Record<string, ReactNode>> = {
  "Data Induk": <DataInduk userRole={currentUser.role} />,
  "Perpustakaan": <Perpustakaan userRole={currentUser.role} userId={currentUser.id} username={currentUser.username} additionalRoles={currentUser.additional_roles} />,
  "Inventaris": <Inventaris userRole={currentUser.role} additionalRoles={currentUser.additional_roles} />,
  "Keuangan": <KeuanganDigital userRole={currentUser.role} />,
  "Persuratan": <PersuratanModule currentUser={currentUser} onBack={() => setActivePage(letterReturnPage)} initialStudentPrefill={parentLetterPrefill} onStudentPrefillHandled={handleStudentPrefillHandled} />,
  "Akademik": <Akademik currentUser={currentUser} userRole={currentUser.role} />,
  "SMAVEN Learn": <SmavenLearn currentUser={currentUser} userRole={currentUser.role} userName={currentUser.full_name} />,
  "Kesiswaan": <KesiswaanBK key="kesiswaan" currentUser={currentUser} userRole={currentUser.role} module="kesiswaan" canAccessKesiswaan={canAccessKesiswaan} onOpenParentLetter={openParentLetter} />,
  "Bimbingan dan Konseling": <KesiswaanBK key="bimbingan-konseling" currentUser={currentUser} userRole={currentUser.role} module="bimbingan-konseling" onOpenParentLetter={openParentLetter} />,
  "Pemilihan OSIS": <PemilihanOSISModule hasAuthenticatedUser={Boolean(currentUser)} userId={currentUser.id} />,
  "Laporan & Analitik": <LaporanAnalitik userRole={currentUser.role} />,
  "Pengaturan": currentUser.role === "super_admin"
    ? <PengaturanIntegrasi onModulesUpdated={refreshSettingsContext} moduleCatalog={appModuleCatalog} />
    : <AccountSettings
      currentUser={currentUser}
      onReopenAnnouncements={() => window.dispatchEvent(new Event("super-app:reopen-announcements"))}
    />,
};

if (moduleStatuses[activePage] === "active" && moduleFullscreenComponents[activePage]) {
  return (
    <main className={`module-fullscreen${activePage === "SMAVEN Learn" ? " smaven-learn-fullscreen" : ""}${activePage === "Persuratan" ? " persuratan-module-fullscreen" : ""}`}>
      <MaintenanceBanner />
      {loginSessionId && (
        <OfficialAnnouncementModal
          key={`${currentUser.id}:${currentUser.role}:${loginSessionId}`}
          userId={currentUser.id}
          role={currentUser.role}
          loginSessionId={loginSessionId}
        />
      )}
      {activePage !== "Persuratan" && <button type="button" className="module-fullscreen-back" onClick={() => setActivePage("Dashboard")}>
        <ChevronLeft size={18} /> Kembali ke Dashboard
      </button>}
      {activePage === "Pemilihan OSIS"
        ? <div className="osis-module-stage">{moduleFullscreenComponents[activePage]}</div>
        : moduleFullscreenComponents[activePage]}
    </main>
  );
}


// useEffect(() => {
//   let active = true;
//
//   async function checkConnection() {
//     try {
//       const { error } = await supabase
//         .from("school_settings")
//         .select("id")
//         .limit(1);
//
//       if (error) {
//         throw error;
//       }
//
//       if (active) {
//         setSupabaseStatus("Database terhubung");
//       }
//     } catch (error) {
//       console.error("Pemeriksaan Supabase gagal:", error);
//
//       if (active) {
//         setSupabaseStatus("Koneksi atau akses database bermasalah");
//       }
//     }
  return (
    <div className={`app-shell ${moduleStatuses[activePage] === "active" && moduleEnabledOverrides[activePage] !== false ? "active-module-fullshell" : ""}`}>
        <MaintenanceBanner />
      {loginSessionId && (
        <OfficialAnnouncementModal
          key={`${currentUser.id}:${currentUser.role}:${loginSessionId}`}
          userId={currentUser.id}
          role={currentUser.role}
          loginSessionId={loginSessionId}
        />
      )}
      <AnimatePresence>
        {mobileMenu && (
          <motion.div
            className="mobile-overlay"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setMobileMenu(false)}
          />
        )}
      </AnimatePresence>

      <aside className={`sidebar ${sidebarOpen ? "" : "sidebar-collapsed"} ${mobileMenu ? "sidebar-mobile-open" : ""}`}>
        <div className="brand">
          <div className="brand-logo"><img src="/logo-sekolah.png" alt="Logo SMAN 7 Maros" /></div>
          {sidebarOpen && (
            <div className="brand-copy">
              <strong>SMAN 7 MAROS</strong>
              <span>School Digital Ecosystem</span>
            </div>
          )}
          <button className="icon-btn sidebar-close-mobile" onClick={() => setMobileMenu(false)} aria-label="Tutup menu">
            <X size={20} />
          </button>
        </div>

        {sidebarOpen && <div className="workspace-pill"><span className="online-dot" /> Portal Sekolah <ChevronDown size={15} /></div>}

        <nav className="sidebar-nav">
          {visibleNavGroups.map((group) => (
            <div className="nav-group" key={group.label}>
              {sidebarOpen && <div className="nav-heading">{group.label}</div>}
              {group.items.map((item) => {
                const Icon = item.icon;
                const active = activePage === item.label;
                return (
                  <button
                    key={item.label}
                    title={!sidebarOpen ? item.label : undefined}
                    className={`nav-item ${active ? "active" : ""}`}
                    onClick={() => handleModuleOpen(item.label)}
                  >
                    <Icon size={19} strokeWidth={active ? 2.3 : 1.8} />
                    {sidebarOpen && <span>{item.label}</span>}
                    {active && sidebarOpen && <span className="active-indicator" />}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        {sidebarOpen && (
          <div className="sidebar-bottom">
            <div className="help-card">
              <div className="help-icon"><Sparkles size={18} /></div>
              <strong>School workspace</strong>
              <p>Satu portal untuk seluruh layanan sekolah.</p>
              <span className="development-chip"><span /> Dalam pengembangan</span>
            </div>
            <div className="sidebar-footer">
              <span className="footer-avatar">7M</span>
              <div><strong>SMAN 7 Maros</strong><span>Portal Administrasi</span></div>
              <ShieldCheck size={17} className="footer-shield" />
            </div>
          </div>
        )}
      </aside>

      <main className="main-area">
        {sessionRecoveryMessage && (
          <div className="session-recovery-banner" role="status">
            <span>{sessionRecoveryMessage}</span>
            <button
              type="button"
              onClick={() => {
                setSessionRecoveryMessage("");
                setSessionRetry((retry) => retry + 1);
              }}
            >
              Coba pulihkan sesi
            </button>
          </div>
        )}
        {moduleStatuses[activePage] === "active" && moduleEnabledOverrides[activePage] !== false && activePage !== "Absensi Digital" && (
          <div className="module-fullshell-back-wrap">
            <button type="button" className="module-fullshell-back" onClick={() => setActivePage("Dashboard")}>
              <ChevronLeft size={18} /> Kembali ke Dashboard
            </button>
          </div>
        )}
        <header className="topbar">
          <div className="topbar-left">
            <button className="icon-btn mobile-menu-btn" onClick={() => setMobileMenu(true)} aria-label="Buka menu"><Menu size={21} /></button>
            <button className="icon-btn desktop-collapse-btn" onClick={() => setSidebarOpen(!sidebarOpen)} aria-label="Ubah lebar sidebar">
              {sidebarOpen ? <PanelLeftClose size={20} /> : <ChevronRight size={20} />}
            </button>
            <div className="breadcrumb"><span>SMAN 7 MAROS</span><ChevronRight size={15} /><strong>{activePage}</strong></div>
          </div>
          <div className="topbar-actions">
            <label className="global-search">
              <Search size={17} />
              <input value={query} onChange={(e) => { setQuery(e.target.value); if (e.target.value) setActivePage("Dashboard"); }} placeholder="Cari aplikasi..." />
              <kbd><Command size={11} /> K</kbd>
            </label>
            <div className="action-wrap">
              <button className={`icon-btn notification-btn ${notificationsOpen ? "selected" : ""}`} onClick={() => { setNotificationsOpen(!notificationsOpen); setProfileOpen(false); }} aria-label={`Notifikasi, ${unreadNotificationCount} perlu perhatian`}>
                <Bell size={20} />{unreadNotificationCount > 0 && <span className="notification-dot" />}
              </button>
              <AnimatePresence>
                {notificationsOpen && (
                  <motion.div className="floating-panel notification-panel" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}>
                    <div className="panel-title"><strong>Notifikasi</strong><span className="muted-label">{unreadNotificationCount} perlu perhatian</span></div>
                    {dashboardNotifications.slice(0, 7).map((item) => (
                      <div
                        className="notification-row"
                        key={item.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => { setNotificationsOpen(false); handleModuleOpen(item.page); }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            setNotificationsOpen(false);
                            handleModuleOpen(item.page);
                          }
                        }}
                      >
                        <span className={`notification-symbol ${item.unread ? "purple" : "green"}`}><Bell size={17}/></span>
                        <div><strong>{item.title}</strong><p>{item.body || item.module} · {dashboardTime(item.createdAt)}</p></div>
                      </div>
                    ))}
                    {dashboardFeedLoading && dashboardNotifications.length === 0 && (
                      <span className="panel-note">Memuat notifikasi terbaru…</span>
                    )}
                    {!dashboardFeedLoading && dashboardNotifications.length === 0 && !dashboardFeedError && (
                      <span className="panel-note">Belum ada notifikasi atau tindak lanjut yang perlu ditampilkan.</span>
                    )}
                    {dashboardFeedError && (
                      <span className="panel-note">Sebagian data notifikasi gagal dimuat: {dashboardFeedError}</span>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <div className="action-wrap">
              <button className="profile-button" onClick={() => { setProfileOpen(!profileOpen); setNotificationsOpen(false); }}>
                <span className="profile-avatar">7M</span>
                <span className="profile-copy"><strong>{currentUser?.username ?? "Administrator"}</strong><small>
  {currentUser
    ? roleLabels[currentUser.role] ?? currentUser.role
    : "Mode pratinjau"}
</small></span>
                <ChevronDown size={15} />
              </button>
              <AnimatePresence>
                {profileOpen && (
                  <motion.div className="floating-panel profile-panel" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}>
                    <div className="profile-menu-heading">Akun pengguna</div>
                    <button onClick={() => openPage("Pengaturan")}><Settings size={16}/> Pengaturan</button>
                    <button
                      type="button"
                      disabled={loggingOut}
                      onClick={async () => {
                        if (loggingOut) return;
                        setLoggingOut(true);
                        setProfileOpen(false);
                        setToast("");

                        try {
                          const { error } = await withTimeout(
                            supabase.auth.signOut({ scope: "local" }),
                            8000,
                            "Proses keluar melewati batas waktu. Coba sekali lagi.",
                          );
                          if (error) throw error;
                          setCurrentUser(null);
                          setActivePage("Dashboard");
                        } catch (logoutError) {
                          console.error("Logout gagal:", logoutError);
                          const message = logoutError instanceof Error
                            ? logoutError.message
                            : typeof logoutError === "object" && logoutError !== null && "message" in logoutError
                              ? String(logoutError.message)
                              : String(logoutError);
                          setToast(`Gagal keluar: ${message}`);
                        } finally {
                          setLoggingOut(false);
                        }
                      }}
                    >
                      <LogOut size={16} /> {loggingOut ? "Keluar..." : "Keluar dari akun"}
                    </button>
                    <span className="panel-note">Akun terhubung melalui Supabase.</span>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </header>

        {sessionRecoveryMessage && currentUser && (
          <div className="session-recovery-banner" role="status">
            <span>{sessionRecoveryMessage}</span>
            <button
              type="button"
              onClick={() => {
                setSessionRecoveryMessage("");
                setSessionRetry((retry) => retry + 1);
              }}
            >
              Muat ulang
            </button>
          </div>
        )}

        <div className="page-content">
          <AnimatePresence>
            {isDashboard ? (
              <motion.div key="dashboard" className="page-stack" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} transition={{ duration: 0.2 }}>
                <section className="welcome-banner">
                  <div className="welcome-decoration decoration-one" />
                  <div className="welcome-decoration decoration-two" />
                  <div className="welcome-content">
                    <div className="welcome-eyebrow"><Sparkles size={14} /> SCHOOL DIGITAL ECOSYSTEM</div>
                    <p className="connection-status">
  Status Supabase: {supabaseStatus}
</p>
                    <DashboardDateTime />
                    <h1>Selamat datang {dashboardUserName} di<br /><span>Super App SMAN 7 Maros!</span></h1>
                    <p>Satu pintu untuk mengelola layanan dan aktivitas sekolah dengan lebih mudah, cepat, dan terintegrasi.</p>
                    <button className="welcome-button" onClick={() => document.getElementById("app-directory")?.scrollIntoView({ behavior: "smooth" })}>Jelajahi aplikasi <ArrowRight size={17} /></button>
                  </div>
                  <div className="welcome-art" aria-hidden="true">
                    <div className="art-orbit orbit-one" /><div className="art-orbit orbit-two" />
                    <div className="art-center"><img src="/logo-sekolah.png" alt="" /></div>
                    <div className="art-float float-one"><CalendarCheck size={21} /></div>
                    <div className="art-float float-two"><BookOpen size={21} /></div>
                    <div className="art-float float-three"><ChartNoAxesCombined size={21} /></div>
                    <div className="art-spark spark-one">✦</div><div className="art-spark spark-two">✧</div>
                  </div>
                </section>

                <div className="stats-refresh">
                  <button
                    type="button"
                    className="text-button"
                    disabled={dashboardRefreshing || dashboardFeedLoading}
                    onClick={() => {
                      const feedState = dashboardFeedRefreshState.current.get(currentUser.id);
                      if (feedState) feedState.lastRequestedAt = 0;
                      const statsState = dashboardStatsRefreshState.current.get(currentUser.id);
                      if (statsState) statsState.lastRequestedAt = 0;
                      setDashboardReload((reload) => reload + 1);
                      setDashboardFeedReload((reload) => reload + 1);
                    }}
                  >
                    {dashboardRefreshing || dashboardFeedLoading ? "Memperbarui kartu..." : "Perbarui ringkasan"}
                  </button>
                </div>
                <section
                  className={currentUser.role === "siswa"
                    ? "stats-grid stats-grid-student"
                    : currentUser.role === "guru_bk"
                      ? "stats-grid stats-grid-summary"
                    : showAttendanceAndLettersDashboard
                      ? "stats-grid stats-grid-summary"
                      : "stats-grid"}
                  aria-label={currentUser.role === "siswa"
                    ? "Ringkasan kehadiran siswa"
                    : currentUser.role === "guru_bk"
                      ? "Ringkasan tindak lanjut BK"
                      : currentUser.role === "bendahara"
                        ? "Ringkasan persuratan"
                    : showAttendanceAndLettersDashboard
                      ? "Ringkasan kehadiran dan persuratan"
                      : "Ringkasan data sekolah"}
                >
                  {(currentUser.role === "siswa"
                    ? [{ label: "Kehadiran Hari Ini", ...dashboardStats.attendance, icon: CalendarCheck, color: "green" }]
                    : currentUser.role === "guru_bk"
                      ? [
                          {
                            label: "Peringatan Belum Dibaca",
                            value: dashboardSummary.unreadBkAlerts === null ? "—" : dashboardSummary.unreadBkAlerts.toLocaleString("id-ID"),
                            note: "Peringatan absensi siswa",
                            trend: "Perlu ditinjau",
                            icon: CircleAlert,
                            color: "orange",
                          },
                          {
                            label: "Kasus BK Aktif",
                            value: dashboardSummary.openBkCases === null ? "—" : dashboardSummary.openBkCases.toLocaleString("id-ID"),
                            note: "Kasus belum selesai",
                            trend: "Dalam pendampingan",
                            icon: HeartHandshake,
                            color: "purple",
                          },
                        ]
                    : currentUser.role === "bendahara"
                      ? [{ label: "Surat Diproses", ...dashboardStats.letters, icon: FileText, color: "orange" }]
                    : showAttendanceAndLettersDashboard
                      ? [
                          { label: "Kehadiran Hari Ini", ...dashboardStats.attendance, icon: CalendarCheck, color: "green" },
                          { label: "Surat Diproses", ...dashboardStats.letters, icon: FileText, color: "orange" },
                        ]
                    : [
                        { label: "Total Siswa", ...dashboardStats.students, icon: Users, color: "blue" },
                        { label: "Guru & Staf", ...dashboardStats.staff, icon: GraduationCap, color: "purple" },
                        { label: "Kehadiran Hari Ini", ...dashboardStats.attendance, icon: CalendarCheck, color: "green" },
                        { label: "Surat Diproses", ...dashboardStats.letters, icon: FileText, color: "orange" },
                      ]
                  ).map((stat, i) => {
                    const Icon = stat.icon;
                    return (
                      <motion.div key={stat.label} className={`stat-card stat-card-${stat.color}`} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}>
                        <div className="stat-top"><span>{stat.label}</span><span className={`stat-icon ${stat.color}`}><Icon size={20}/></span></div>
                        <div className="stat-value">{stat.value}</div>
                        <div className="stat-note">{stat.note}</div>
                        <div className="stat-bottom"><span className="neutral-dot" />{stat.trend}</div>
                      </motion.div>
                    );
                  })}
                </section>

                <section className="section-block" id="app-directory">
                  <div className="section-header">
                    <div><div className="section-kicker">WORKSPACE</div><h2>Jelajahi Aplikasi</h2><p>Akses seluruh kebutuhan sekolah dari satu tempat.</p></div>
                    <button className="text-button" onClick={() => setShowAllApps(!showAllApps)}>{showAllApps ? "Tampilkan ringkas" : "Lihat semua"} <ArrowUpRight size={16}/></button>
                  </div>
                  {query && <div className="search-result-label">{visibleFilteredApps.length} aplikasi ditemukan untuk “{query}”</div>}
                  {visibleApps.length > 0 ? (
                    <div className="apps-grid">
                      {visibleApps.map((app, i) => {
                        const Icon = app.icon;
                        return (
                          <motion.button key={app.name} className="app-card" onClick={() => handleModuleOpen(app.name)} whileHover={{ y: -4 }} whileTap={{ scale: 0.98 }} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i * 0.035, 0.24) }}>
                            <div className="app-card-top"><span className="app-icon" style={{ background: app.bg, color: app.color }}><Icon size={23}/></span><span className="app-arrow"><ArrowUpRight size={17}/></span></div>
                            <span className="app-name">{app.name}</span>
                            <span className="app-description">{app.description}</span>
                            <span className="app-category">{app.category}</span>

<span className={`module-status ${moduleEnabledOverrides[app.name] === false ? "coming-soon" : moduleStatuses[app.name] ?? "coming-soon"}`}>
  {moduleEnabledOverrides[app.name] === false
    ? "Nonaktif"
    : moduleStatuses[app.name] === "active"
    ? "Siap Dibuka"
    : moduleStatuses[app.name] === "development"
      ? "Dalam Pengembangan"
      : "Segera Hadir"}
</span>
                          </motion.button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="empty-state"><Search size={28}/><strong>Aplikasi tidak ditemukan</strong><span>Coba kata kunci yang lain.</span></div>
                  )}
                </section>

                <section className="bottom-grid">
                  <div className="content-card activity-card">
                    <div className="card-heading"><div><h3>Aktivitas & Pengembangan</h3><p>Aktivitas nyata lintas modul</p></div><span className="heading-icon"><Clock3 size={19}/></span></div>
                    <div className="activity-list">
                      {activityItems.map((activity) => {
                        const Icon = activity.module === "Persuratan"
                          ? Mail
                          : activity.module === "Akademik"
                            ? GraduationCap
                            : activity.module === "Keuangan"
                              ? Wallet
                              : activity.module === "BK"
                                ? HeartHandshake
                                : CheckCircle2;
                        const color = activity.module === "Persuratan"
                          ? "#8754E8"
                          : activity.module === "Keuangan"
                            ? "#0D91B5"
                            : activity.module === "BK"
                              ? "#D34B99"
                              : "#3976F6";
                        return <div className="activity-item" key={activity.id}><span className="activity-icon" style={{ color }}><Icon size={19}/></span><div className="activity-copy"><strong>{activity.title}</strong><span>{activity.detail}</span></div><span className="activity-time">{dashboardTime(activity.createdAt)}</span></div>;
                      })}
                      {activityItems.length === 0 && <div className="activity-item"><span className="activity-copy"><span>{dashboardFeedLoading ? "Memuat aktivitas…" : dashboardFeedError ? "Aktivitas dashboard gagal dimuat. Lihat detail pada panel notifikasi." : "Belum ada aktivitas yang dapat ditampilkan."}</span></span></div>}
                    </div>
                    {(allowedPages.includes("Pengaturan") || allowedPages.includes("Laporan & Analitik")) && (
                      <button className="card-link" onClick={() => handleModuleOpen(allowedPages.includes("Pengaturan") ? "Pengaturan" : "Laporan & Analitik")}>Lihat riwayat <ArrowRight size={15}/></button>
                    )}
                  </div>
                  <div className="content-card quick-card">
                    <div className="card-heading"><div><h3>Akses Cepat</h3><p>Pintasan layanan sekolah</p></div><span className="heading-icon"><Command size={19}/></span></div>
                    <div className="quick-links">
                      {quickActions.map((action) => {
                        const Icon = action.icon;
                        return <button key={action.module} onClick={() => handleModuleOpen(action.module)}><span className={`quick-icon quick-${action.color}`}><Icon size={18}/></span><span><strong>{action.title}</strong><small>{action.description}</small></span><ChevronRight size={17}/></button>;
                      })}
                    </div>
                    <button className="card-link" onClick={() => { setQuery(""); setShowAllApps(true); document.getElementById("app-directory")?.scrollIntoView({ behavior: "smooth" }); }}>Semua aplikasi <ArrowRight size={15}/></button>
                  </div>
                </section>

                <footer className="page-footer"><span>© {new Date().getFullYear()} SMAN 7 MAROS</span><span><span className="footer-status-dot"/> Super App · Tahap pengembangan awal</span></footer>
              </motion.div>
            
) : activePage === "Data Induk" ? (
  <motion.div
    key="data-induk"
    className="page-stack"
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: -5 }}
    transition={{ duration: 0.2 }}
  >
    <DataInduk userRole={currentUser.role} />
  </motion.div>
) : activePage === "Absensi Digital" ? (
        <motion.div key="absensi-digital" className="page-stack">
          <AbsensiDigital currentUser={currentUser} userRole={currentUser.role} />
        </motion.div>
) : activePage === "Perpustakaan" ? (
     <motion.div key="perpustakaan" className="page-stack" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} transition={{ duration: 0.2 }}>
       <Perpustakaan userRole={currentUser.role} userId={currentUser.id} username={currentUser.username} additionalRoles={currentUser.additional_roles} />
     </motion.div>
) : activePage === "Akademik" ? (
     <motion.div key="akademik" className="page-stack" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} transition={{ duration: 0.2 }}>
       <Akademik currentUser={currentUser} userRole={currentUser.role} />
     </motion.div>
) : activePage === "Kesiswaan" ? (
     <motion.div key="kesiswaan" className="page-stack" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} transition={{ duration: 0.2 }}>
       <KesiswaanBK currentUser={currentUser} userRole={currentUser.role} module="kesiswaan" canAccessKesiswaan={canAccessKesiswaan} onOpenParentLetter={openParentLetter} />
     </motion.div>
) : activePage === "Bimbingan dan Konseling" ? (
     <motion.div key="bimbingan-konseling" className="page-stack" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} transition={{ duration: 0.2 }}>
       <KesiswaanBK currentUser={currentUser} userRole={currentUser.role} module="bimbingan-konseling" onOpenParentLetter={openParentLetter} />
     </motion.div>
) : activePage === "Pemilihan OSIS" ? (
     <motion.div key="pemilihan-osis" className="page-stack" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} transition={{ duration: 0.2 }}>
       <PemilihanOSISModule hasAuthenticatedUser={Boolean(currentUser)} userId={currentUser.id} />
     </motion.div>
) : activePage === "Laporan & Analitik" ? (
     <motion.div key="laporan-analitik" className="page-stack" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} transition={{ duration: 0.2 }}>
       <LaporanAnalitik userRole={currentUser.role} />
     </motion.div>
) : activePage === "Pengaturan" ? (
      <motion.div key="pengaturan-akun" className="page-stack" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} transition={{ duration: 0.2 }}>
        {currentUser.role === "super_admin"
          ? <PengaturanIntegrasi onModulesUpdated={refreshSettingsContext} moduleCatalog={appModuleCatalog} />
          : <AccountSettings
            currentUser={currentUser}
            onReopenAnnouncements={() => window.dispatchEvent(new Event("super-app:reopen-announcements"))}
          />}
      </motion.div>
) : activePage === "Pengguna" ? (
  <motion.div
    key="pengguna"
    className="module-placeholder user-management-page"
    initial={{ opacity: 0, y: 12 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0 }}
    transition={{ duration: 0.35, ease: "easeOut" }}
  >
    <div className="user-page-header">
      <div className="user-header-copy">
        <span className="user-header-kicker"><Sparkles size={14} /> PUSAT KONTROL SEKOLAH</span>
        <h1>Pengguna</h1>
        <p>
          Kelola akun, peran, dan status akses warga SMAN 7 Maros dalam satu tempat.
        </p>
        <span className="user-header-caption"><span /> Akses dikelola terpusat oleh Super Admin</span>
      </div>
      <div className="user-header-art" aria-hidden="true">
        <span className="user-header-art-glow" />
        <ShieldCheck size={34} />
        <span className="user-header-art-label">ACCOUNT<br />CONTROL</span>
      </div>
    </div>

    <div className="user-page-summary" aria-label="Ringkasan pengguna">
      <div className="user-summary-item">
        <span className="user-summary-icon"><Users size={19} /></span>
        <div><span>Total akun</span><strong>{usersLoaded ? managedUsers.length : "—"}</strong></div>
        <small>{usersLoaded ? "Seluruh akun terdaftar" : "Muat daftar untuk melihat data"}</small>
      </div>
      <div className="user-summary-item is-active">
        <span className="user-summary-icon"><UserRoundCheck size={19} /></span>
        <div><span>Akun aktif</span><strong>{usersLoaded ? managedUsers.filter((user) => user.status === "active").length : "—"}</strong></div>
        <small>Akun yang dapat mengakses aplikasi</small>
      </div>
      <div className="user-summary-item is-disabled">
        <span className="user-summary-icon"><UserRoundX size={19} /></span>
        <div><span>Akun nonaktif</span><strong>{usersLoaded ? managedUsers.filter((user) => user.status !== "active").length : "—"}</strong></div>
        <small>Akun yang aksesnya dinonaktifkan</small>
      </div>
    </div>

    <div className="user-page-actions">
      <button
        className="user-button user-button-secondary"
        onClick={loadManagedUsers}
        disabled={usersLoading}
      >
        <RefreshCw size={17} className={usersLoading ? "user-spin" : ""} />
        {usersLoading ? "Memuat pengguna..." : "Perbarui daftar"}
      </button>

      <button
        className="user-button user-button-primary"
        onClick={() => {
          setShowAddUserForm(!showAddUserForm);
          setCreateUserError("");
          setCreateUserMessage("");
        }}
      >
        <Plus size={18} />
        {showAddUserForm ? "Batal Tambah" : "Tambah Pengguna"}
      </button>

      {currentUser?.role === "super_admin" && (
        <button
          type="button"
          className="user-button user-button-primary user-button-generator"
          onClick={() => {
            const nextOpen = !showStudentAccountGenerator;
            setShowStudentAccountGenerator(nextOpen);
            if (nextOpen) {
              void loadStudentAccountGenerator();
            }
          }}
          disabled={studentGeneratorCreating}
        >
          <Sparkles size={17} />
          {showStudentAccountGenerator ? "Tutup Generator Siswa" : "Generate Akun dari Data Induk"}
        </button>
      )}
      {currentUser?.role === "super_admin" && (
        <button
          type="button"
          className="user-button user-button-primary user-button-generator"
          onClick={() => {
            const nextOpen = !showTeacherAccountGenerator;
            setShowTeacherAccountGenerator(nextOpen);
            if (nextOpen) void loadTeacherAccountGenerator();
          }}
          disabled={teacherGeneratorCreating}
        >
          <UserRoundPlus size={17} />
          {showTeacherAccountGenerator ? "Tutup Generator Guru / Tendik" : "Generate Akun Guru / Tendik"}
        </button>
      )}
      <span className="user-actions-spacer" />
      {usersLoaded && <span className="user-sync-indicator"><span /> Data tersinkron dari server</span>}
    </div>

    {showStudentAccountGenerator && currentUser?.role === "super_admin" && (
      <section className="content-card user-list-card student-account-import-card">
        <div className="card-heading">
          <div>
            <h3>Generate Akun dari Data Induk</h3>
            <p>Akun siswa aktif yang belum terdaftar akan dibuat dengan NISN sebagai username dan password awal.</p>
          </div>
          <span className="heading-icon"><Sparkles size={19} /></span>
        </div>

        <div className="student-import-actions">
          <button
            type="button"
            className="user-action-button"
            onClick={() => void loadStudentAccountGenerator()}
            disabled={studentGeneratorLoading || studentGeneratorCreating}
          >
            <RefreshCw size={16} className={studentGeneratorLoading ? "user-spin" : ""} />
            {studentGeneratorLoading ? "Memuat Data Induk..." : "Muat ulang Data Induk"}
          </button>
          {studentGeneratorLoading && <span className="student-import-filename">Memeriksa akun dan siswa terbaru...</span>}
        </div>

        {studentGeneratorError && (
          <div className="module-notice" role="alert">
            <CircleAlert size={18} /><span>{studentGeneratorError}</span>
          </div>
        )}
        {studentGeneratorMessage && (
          <p className="student-import-result" role="status">{studentGeneratorMessage}</p>
        )}

        {studentGeneratorRows.length > 0 && (
          <>
            <p className="student-import-count">
              {studentGeneratorRows.filter((row) => row.status === "ready").length} siap dibuat ·{" "}
              {studentGeneratorRows.filter((row) => row.status === "existing").length} sudah punya akun ·{" "}
              {studentGeneratorRows.filter((row) => ["invalid", "duplicate", "failed"].includes(row.status)).length} perlu diperiksa
            </p>

            <div className="user-table-toolbar">
              <label className="user-search-field">
                <Search size={16} />
                <input
                  type="search"
                  value={studentGeneratorSearch}
                  onChange={(event) => setStudentGeneratorSearch(event.target.value)}
                  placeholder="Cari nama atau NISN..."
                  aria-label="Cari siswa di pratinjau akun"
                />
              </label>
              <label className="user-filter-field">
                <select
                  value={studentGeneratorClass}
                  onChange={(event) => setStudentGeneratorClass(event.target.value)}
                  aria-label="Filter kelas siswa"
                >
                  <option value="all">Semua kelas</option>
                  {studentGeneratorClasses.map(([classId, className]) => (
                    <option key={classId} value={classId}>{className}</option>
                  ))}
                  {studentGeneratorRows.some((row) => !row.classId) && (
                    <option value="unassigned">Belum ditentukan</option>
                  )}
                </select>
              </label>
              <label className="user-filter-field">
                <input
                  type="checkbox"
                  checked={studentGeneratorUncreatedOnly}
                  onChange={(event) => setStudentGeneratorUncreatedOnly(event.target.checked)}
                />
                Belum punya akun
              </label>
            </div>

            <div className="user-table-scroll">
              <table className="student-import-table">
                <thead>
                  <tr>
                    <th>
                      <input
                        type="checkbox"
                        aria-label="Pilih semua siswa siap dibuat yang terlihat"
                        checked={
                          filteredStudentGeneratorRows.some((row) => row.status === "ready")
                          && filteredStudentGeneratorRows
                            .filter((row) => row.status === "ready")
                            .every((row) => studentGeneratorSelectedIds.includes(row.id))
                        }
                        onChange={(event) => {
                          const checked = event.currentTarget.checked;
                          const visibleReadyIds = filteredStudentGeneratorRows
                            .filter((row) => row.status === "ready")
                            .map((row) => row.id);
                          setStudentGeneratorSelectedIds((current) => {
                            const selected = new Set(current);
                            visibleReadyIds.forEach((id) => {
                              if (checked) selected.add(id);
                              else selected.delete(id);
                            });
                            return [...selected];
                          });
                        }}
                        disabled={studentGeneratorCreating || studentGeneratorLoading}
                      />
                    </th>
                    <th>NISN</th>
                    <th>Nama Lengkap</th>
                    <th>Kelas</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStudentGeneratorRows.length === 0 ? (
                    <tr><td colSpan={5}>Tidak ada siswa yang cocok dengan filter.</td></tr>
                  ) : filteredStudentGeneratorRows.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <input
                          type="checkbox"
                          aria-label={`Pilih ${row.fullName}`}
                          checked={row.status === "ready" && studentGeneratorSelectedIds.includes(row.id)}
                          disabled={row.status !== "ready" || studentGeneratorCreating || studentGeneratorLoading}
                          onChange={(event) => {
                            const checked = event.currentTarget.checked;
                            setStudentGeneratorSelectedIds((current) => checked
                              ? [...new Set([...current, row.id])]
                              : current.filter((id) => id !== row.id));
                          }}
                        />
                      </td>
                      <td>{row.nisn || "—"}</td>
                      <td>{row.fullName || "—"}</td>
                      <td>{row.className || "Belum ditentukan"}</td>
                      <td>
                        <span className={`student-import-status is-${row.status}`}>
                          {row.status === "ready" ? "Siap dibuat"
                            : row.status === "existing" ? "Sudah punya akun"
                              : row.status === "duplicate" ? "Duplikat"
                                : row.status === "invalid" ? "Perlu diperiksa"
                                  : row.status === "creating" ? "Membuat akun..."
                                    : row.status === "created" ? "Akun berhasil dibuat"
                                      : row.message}
                        </span>
                        {row.status !== "ready" && row.status !== "existing" && row.message && (
                          <small className="student-import-guidance">{row.message}</small>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <button
              type="button"
              className="primary-button student-import-create"
              onClick={() => void createStudentAccountsFromDataInduk()}
              disabled={studentGeneratorCreating || studentGeneratorLoading || selectedReadyStudentCount === 0}
            >
              {studentGeneratorCreating
                ? "Membuat akun..."
                : `Generate ${selectedReadyStudentCount} Akun Siswa`}
            </button>
          </>
        )}
        {!studentGeneratorLoading && !studentGeneratorError && studentGeneratorRows.length === 0 && (
          <p className="student-import-guidance">Belum ada data siswa pada Data Induk.</p>
        )}
      </section>
    )}

    {showTeacherAccountGenerator && currentUser?.role === "super_admin" && (
      <section className="content-card user-list-card student-account-import-card">
        <div className="card-heading">
          <div>
            <h3>Generate Akun Guru / Tendik</h3>
            <p>Akun baru menggunakan NIP sebagai username dan password awal. Akun dengan NIP yang sudah terdaftar akan ditautkan ke Data Induk.</p>
          </div>
          <span className="heading-icon"><UserRoundPlus size={19} /></span>
        </div>

        <div className="student-import-actions">
          <button
            type="button"
            className="user-action-button"
            onClick={() => void loadTeacherAccountGenerator()}
            disabled={teacherGeneratorLoading || teacherGeneratorCreating}
          >
            <RefreshCw size={16} className={teacherGeneratorLoading ? "user-spin" : ""} />
            {teacherGeneratorLoading ? "Memuat Data Induk..." : "Muat ulang Data Induk"}
          </button>
          {teacherGeneratorLoading && <span className="student-import-filename">Memeriksa NIP dan akun guru/tendik...</span>}
        </div>

        {teacherGeneratorError && (
          <div className="module-notice" role="alert">
            <CircleAlert size={18} /><span>{teacherGeneratorError}</span>
          </div>
        )}
        {teacherGeneratorMessage && (
          <p className="student-import-result" role="status">{teacherGeneratorMessage}</p>
        )}

        {teacherGeneratorRows.length > 0 && (
          <>
            <p className="student-import-count">
              {teacherGeneratorRows.filter((row) => row.status === "ready" || row.status === "link").length} siap dibuat/ditautkan ·{" "}
              {teacherGeneratorRows.filter((row) => row.status === "existing").length} sudah tertaut ·{" "}
              {teacherGeneratorRows.filter((row) => ["invalid", "duplicate", "failed"].includes(row.status)).length} perlu diperiksa
            </p>

            <div className="user-table-toolbar">
              <label className="user-search-field">
                <Search size={16} />
                <input
                  type="search"
                  value={teacherGeneratorSearch}
                  onChange={(event) => setTeacherGeneratorSearch(event.target.value)}
                  placeholder="Cari nama, NIP, atau jabatan..."
                  aria-label="Cari guru atau tendik di pratinjau akun"
                />
              </label>
              <label className="user-filter-field">
                <select
                  value={teacherGeneratorCategory}
                  onChange={(event) => setTeacherGeneratorCategory(event.target.value)}
                  aria-label="Filter kategori guru atau tendik"
                >
                  <option value="all">Semua</option>
                  <option value="guru">Guru</option>
                  <option value="tendik">Tendik</option>
                </select>
              </label>
              <label className="user-filter-field">
                <input
                  type="checkbox"
                  checked={teacherGeneratorUncreatedOnly}
                  onChange={(event) => setTeacherGeneratorUncreatedOnly(event.target.checked)}
                />
                Belum punya akun
              </label>
            </div>

            <div className="user-table-scroll">
              <table className="student-import-table">
                <thead>
                  <tr>
                    <th>
                      <input
                        type="checkbox"
                        aria-label="Pilih semua guru/tendik siap diproses yang terlihat"
                        checked={
                          filteredTeacherGeneratorRows.some((row) => row.status === "ready" || row.status === "link")
                          && filteredTeacherGeneratorRows
                            .filter((row) => row.status === "ready" || row.status === "link")
                            .every((row) => teacherGeneratorSelectedIds.includes(row.id))
                        }
                        onChange={(event) => {
                          const checked = event.currentTarget.checked;
                          const visibleReadyIds = filteredTeacherGeneratorRows
                            .filter((row) => row.status === "ready" || row.status === "link")
                            .map((row) => row.id);
                          setTeacherGeneratorSelectedIds((current) => {
                            const selected = new Set(current);
                            visibleReadyIds.forEach((id) => {
                              if (checked) selected.add(id);
                              else selected.delete(id);
                            });
                            return [...selected];
                          });
                        }}
                        disabled={teacherGeneratorCreating || teacherGeneratorLoading}
                      />
                    </th>
                    <th>NIP</th>
                    <th>Nama Lengkap</th>
                    <th>Kategori / Jabatan</th>
                    <th>Role Akun</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTeacherGeneratorRows.length === 0 ? (
                    <tr><td colSpan={6}>Tidak ada guru/tendik yang cocok dengan filter.</td></tr>
                  ) : filteredTeacherGeneratorRows.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <input
                          type="checkbox"
                          aria-label={`Pilih ${row.fullName}`}
                          checked={["ready", "link"].includes(row.status) && teacherGeneratorSelectedIds.includes(row.id)}
                          disabled={!["ready", "link"].includes(row.status) || teacherGeneratorCreating || teacherGeneratorLoading}
                          onChange={(event) => {
                            const checked = event.currentTarget.checked;
                            setTeacherGeneratorSelectedIds((current) => checked
                              ? [...new Set([...current, row.id])]
                              : current.filter((item) => item !== row.id));
                          }}
                        />
                      </td>
                      <td>{row.nip || "—"}</td>
                      <td>{row.fullName || "—"}</td>
                      <td>{row.staffCategory || "Tenaga Kependidikan"} · {row.primaryRole || row.employmentStatus || "Jabatan tidak dicantumkan"}</td>
                      <td>{roleLabels[row.role] ?? row.role}</td>
                      <td>
                        <span className={`student-import-status is-${row.status}`}>
                          {row.status === "ready" ? "Siap dibuat"
                            : row.status === "link" ? "Siap ditautkan"
                              : row.status === "existing" ? "Sudah tertaut"
                                : row.status === "duplicate" ? "Duplikat NIP"
                                  : row.status === "invalid" ? "Perlu diperiksa"
                                    : row.status === "creating" ? "Memproses..."
                                      : row.status === "created" ? "Akun tersinkron"
                                        : "Gagal diproses"}
                        </span>
                        {row.message && row.status !== "ready" && row.status !== "link" && (
                          <small className="student-import-guidance">{row.message}</small>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <button
              type="button"
              className="primary-button student-import-create"
              onClick={() => void createTeacherAccountsFromDataInduk()}
              disabled={teacherGeneratorCreating || teacherGeneratorLoading || selectedReadyTeacherCount === 0}
            >
              {teacherGeneratorCreating
                ? "Membuat/menautkan akun..."
                : `Generate / Tautkan ${selectedReadyTeacherCount} Akun`}
            </button>
          </>
        )}
        {!teacherGeneratorLoading && !teacherGeneratorError && teacherGeneratorRows.length === 0 && (
          <p className="student-import-guidance">Belum ada data guru/tendik pada Data Induk.</p>
        )}
      </section>
    )}

    {usersError && (
      <div className="module-notice user-error-notice" role="alert">
        <CircleAlert size={18} />
        <span>{usersError}{usersLoaded ? " Data terakhir tetap ditampilkan." : ""}</span>
        <button type="button" onClick={() => void loadManagedUsers()} disabled={usersLoading}>
          {usersLoading ? "Memuat..." : "Coba lagi"}
        </button>
      </div>
    )}

    {!usersLoaded && !usersLoading && !usersError && (
      <section className="user-empty-state">
        <span className="user-empty-icon"><Users size={26} /></span>
        <div>
          <strong>Direktori pengguna siap dimuat</strong>
          <p>Ambil data terbaru dari server untuk melihat dan mengelola akun sekolah.</p>
        </div>
        <button type="button" className="user-button user-button-primary" onClick={() => void loadManagedUsers()}>
          <RefreshCw size={16} /> Muat daftar pengguna
        </button>
      </section>
    )}

    {usersLoading && !usersLoaded && (
      <section className="user-empty-state" role="status">
        <span className="user-empty-icon"><RefreshCw size={24} className="user-spin" /></span>
        <div>
          <strong>Menghubungkan ke server...</strong>
          <p>Daftar akun sedang dimuat. Proses ini mungkin memerlukan beberapa saat.</p>
        </div>
      </section>
    )}

    {createUserError && (
      <div className="module-notice" role="alert">
        <CircleAlert size={18} />
        <span>{createUserError}</span>
      </div>
    )}

    {createUserMessage && (
      <p className="user-success-notice" role="status">{createUserMessage}</p>
    )}

    {showAddUserForm && (
      <form
          onSubmit={createManagedUser}
          className="user-list-card user-add-card"
      >
        <div className="user-add-heading">
          <span><UserRoundPlus size={19} /></span>
          <div><h3>Tambah Akun Guru atau Staf</h3><p>Username dan password awal menggunakan NIP.</p></div>
        </div>

        <label className="user-form-field">
          <span>NIP</span>
          <input
            value={newUserNip}
            onChange={(e) => {
              const nip = e.target.value;
              setNewUserNip(nip);
              setNewUserPassword(nip);
            }}
            inputMode="numeric"
            pattern="[0-9]{6,30}"
            minLength={6}
            maxLength={30}
            required
            placeholder="Masukkan NIP (6–30 angka)"
          />
        </label>

        <label className="user-form-field">
          <span>Nama lengkap</span>
          <input
            value={newUserName}
            onChange={(e) => setNewUserName(e.target.value)}
            minLength={2}
            maxLength={150}
            required
            placeholder="Nama lengkap guru atau staf"
          />
        </label>

        <label className="user-form-field">
          <span>Role</span>
          <select
            value={newUserRole}
            onChange={(e) => setNewUserRole(e.target.value)}
            required
          >
            {managedUserRoleOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>

        <label className="user-form-field">
          <span>Password awal</span>
          <input
            type="password"
            value={newUserPassword}
            onChange={(e) => setNewUserPassword(e.target.value)}
            minLength={6}
            maxLength={128}
            autoComplete="new-password"
            required
            placeholder="Otomatis terisi dari NIP; bisa diubah"
          />
          <span className="user-initial-password-note">Otomatis mengikuti NIP, tetapi dapat disunting. Sampaikan password awal secara aman.</span>
        </label>

        <button
          type="submit"
          className="primary-button"
          disabled={savingUser}
        >
          {savingUser ? "Menyimpan..." : "Simpan Akun"}
        </button>
      </form>
    )}

    {userDirectoryMetadataWarning && (
      <div className="module-notice user-metadata-warning" role="status">
        <CircleAlert size={18} />
        <span>{userDirectoryMetadataWarning}</span>
      </div>
    )}

    {usersLoaded && (
      <>
        <section className="content-card user-list-card user-directory-controls">
          <div className="card-heading">
            <div>
              <span className="user-card-eyebrow">DIREKTORI AKUN</span>
              <h3>Daftar Pengguna</h3>
              <p>Pencarian dan filter berlaku untuk ketiga daftar.</p>
            </div>
            <span className="heading-icon"><Users size={19} /></span>
          </div>
          <div className="user-table-toolbar">
            <label className="user-search-field">
              <Search size={17} />
              <input
                type="search"
                value={userSearch}
                onChange={(event) => setUserSearch(event.target.value)}
                placeholder="Cari nama, NIP/username, jabatan, atau kelas..."
                aria-label="Cari di seluruh daftar pengguna"
              />
              {userSearch && (
                <button type="button" onClick={() => setUserSearch("")} aria-label="Hapus pencarian">
                  <X size={15} />
                </button>
              )}
            </label>
            <label className="user-filter-field">
              <SlidersHorizontal size={16} />
              <select value={userRoleFilter} onChange={(event) => setUserRoleFilter(event.target.value)} aria-label="Filter berdasarkan role">
                <option value="all">Semua role</option>
                {Array.from(new Set(managedUsers.map((user) => user.role))).sort().map((role) => (
                  <option key={role} value={role}>{roleLabels[role] ?? role}</option>
                ))}
              </select>
            </label>
            <label className="user-filter-field">
              <select value={userStatusFilter} onChange={(event) => setUserStatusFilter(event.target.value)} aria-label="Filter berdasarkan status">
                <option value="all">Semua status</option>
                <option value="active">Aktif</option>
                <option value="inactive">Nonaktif</option>
              </select>
            </label>
            {(userSearch || userRoleFilter !== "all" || userStatusFilter !== "all" || studentUserClassFilter !== "all") && (
              <button
                type="button"
                className="user-reset-filters"
                onClick={() => {
                  setUserSearch("");
                  setUserRoleFilter("all");
                  setUserStatusFilter("all");
                  setStudentUserClassFilter("all");
                }}
              >
                Atur ulang filter
              </button>
            )}
          </div>
          {managedUsers.length === 0 && (
            <div className="user-empty-state user-empty-state-compact">
              <span><Users size={22} /></span>
              <div><strong>Belum ada pengguna</strong><p>Akun yang terdaftar akan muncul di sini.</p></div>
            </div>
          )}
        </section>

        <section className="content-card user-list-card user-directory-card">
          <div className="card-heading">
            <div>
              <span className="user-card-eyebrow">AKUN SEKOLAH</span>
              <h3>Pengguna Guru</h3>
              <p>Menampilkan {filteredManagedUsersByGroup.teachers.length} dari {managedUsersByGroup.teachers.length} akun guru.</p>
            </div>
            <span className="heading-icon"><GraduationCap size={19} /></span>
          </div>
          {renderManagedUserTable(filteredManagedUsersByGroup.teachers, "Tidak ada akun guru yang cocok dengan filter.")}
        </section>

        <section className="content-card user-list-card user-directory-card">
          <div className="card-heading">
            <div>
              <span className="user-card-eyebrow">AKUN SEKOLAH</span>
              <h3>Pengguna Tenaga Kependidikan / Tendik</h3>
              <p>Menampilkan {filteredManagedUsersByGroup.staff.length} dari {managedUsersByGroup.staff.length} akun, termasuk administrator dan role lain.</p>
            </div>
            <span className="heading-icon"><ShieldCheck size={19} /></span>
          </div>
          {renderManagedUserTable(filteredManagedUsersByGroup.staff, "Tidak ada akun tenaga kependidikan yang cocok dengan filter.")}
        </section>

        <section className="content-card user-list-card user-directory-card">
          <div className="card-heading">
            <div>
              <span className="user-card-eyebrow">AKUN AKADEMIK</span>
              <h3>Pengguna Siswa</h3>
              <p>Menampilkan {filteredStudentManagedUsers.length} dari {managedUsersByGroup.students.length} akun siswa.</p>
            </div>
            <span className="heading-icon"><BookOpen size={19} /></span>
          </div>
          <label className="user-filter-field user-student-class-filter">
            <SlidersHorizontal size={16} />
            <select
              value={studentUserClassFilter}
              onChange={(event) => setStudentUserClassFilter(event.target.value)}
              aria-label="Filter akun siswa berdasarkan kelas"
            >
              <option value="all">Semua kelas</option>
              {studentUserClassOptions.map((className) => (
                <option key={className} value={className}>{className}</option>
              ))}
              {managedUsersByGroup.students.some((user) => !user.className) && (
                <option value="unassigned">Kelas belum terhubung</option>
              )}
            </select>
          </label>
          {renderManagedUserTable(filteredStudentManagedUsers, "Tidak ada akun siswa yang cocok dengan pencarian atau filter kelas.")}
        </section>
      </>
    )}
  

{editingUser && (
  <form
    className="content-card user-form"
    onSubmit={saveEditedUser}
  >
    <h3>Edit Data Pengguna</h3>

    <label className="user-form-field">
      <span>NIP / Username</span>
      <input
        value={editUserNip}
        onChange={(event) => setEditUserNip(event.target.value)}
        inputMode="numeric"
        pattern="[0-9]{5,30}"
        minLength={5}
        maxLength={30}
        required
      />
    </label>

    <label className="user-form-field">
      <span>Nama Lengkap</span>
      <input
        value={editUserName}
        onChange={(event) => setEditUserName(event.target.value)}
        minLength={2}
        maxLength={150}
        required
      />
    </label>

    {editUserError && (
      <p role="alert" className="form-error">
        {editUserError}
      </p>
    )}

    <div className="user-form-actions">
      <button
        type="submit"
        className="primary-button"
        disabled={savingEditUser}
      >
        {savingEditUser ? "Menyimpan..." : "Simpan Perubahan"}
      </button>

      <button
        type="button"
        className="user-action-button"
        onClick={() => setEditingUser(null)}
        disabled={savingEditUser}
      >
        Batal
      </button>
    </div>
  </form>
)}
    <div className="module-notice" style={{ marginTop: 20 }}>
      <CircleAlert size={18} />
      <span>
        Kelola akun melalui fungsi server yang memverifikasi
        sesi dan hak akses Super Admin.
      </span>
    </div>
  </motion.div>
) : (
  <motion.div
    key={activePage}
    className="module-placeholder"
    initial={{ opacity: 0, y: 12 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0 }}
  >
    <div className="module-placeholder-icon">
      <Library size={34} />
    </div>
    <span className="section-kicker">MODUL SUPER APP</span>
    <h1>{activePage}</h1>
    <p>
      Halaman ini sudah terdaftar dalam navigasi Super App SMAN 7 Maros.
      Fitur dan data akan kita bangun serta hubungkan secara bertahap.
    </p>
    <div className="module-notice">
      <CircleAlert size={18} />
      <span>
        Ini masih halaman pratinjau. Belum ada transaksi atau data
        sekolah yang diproses.
      </span>
    </div>
    <button
      className="primary-button"
      onClick={() => openPage("Dashboard")}
    >
      <LayoutDashboard size={17} />
      Kembali ke dashboard
    </button>
  </motion.div>
)}

</AnimatePresence>
        </div>
      </main>

      <AnimatePresence>
        {toast && (
          <motion.div className="toast" role="status" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}>
            <span className="toast-symbol"><CheckCircle2 size={19}/></span><span>{toast}</span><button onClick={() => setToast("")} aria-label="Tutup notifikasi"><X size={17}/></button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

