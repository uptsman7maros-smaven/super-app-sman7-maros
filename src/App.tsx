import { createElement, Fragment, useCallback, useEffect, useMemo, useState } from "react";
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
  FileSpreadsheet,
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
  Upload,
  Download,
  Vote,
  Wallet,
  X,
} from "lucide-react";
import {
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
} from "./lib/manageUsers";
import type { ManagedUser } from "./lib/manageUsers";
import { LETTER_IN_PROGRESS_STATUSES } from "./lib/letterMetrics";
import * as XLSX from "xlsx";
import DataInduk from "./DataInduk";
import AbsensiDigital from "./AbsensiDigital";
import Perpustakaan from "./Perpustakaan";
import Akademik from "./Akademik";
import KesiswaanBK from "./KesiswaanBK";
import LaporanAnalitik from "./LaporanAnalitik";
import PengaturanIntegrasi from "./PengaturanIntegrasi";
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

type StudentAccountImportRow = {
  rowNumber: number;
  nisn: string;
  fullName: string;
  status: "ready" | "duplicate" | "existing" | "invalid" | "creating" | "created" | "failed";
  message: string;
};

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
};

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
    "Akademik",
    "SMAVEN Learn",
    "Kesiswaan",
    "Bimbingan dan Konseling",
    "Pemilihan OSIS",
    "Laporan & Analitik",
  ],
  kepala_tata_usaha: [
    "Dashboard",
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
    "Kesiswaan",
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
};

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
  const [activePage, setActivePage] = useState("Dashboard");
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
  const [managedUsers, setManagedUsers] = useState<ManagedUser[]>([]);
  const [showAddUserForm, setShowAddUserForm] = useState(false);
  const [newUserNip, setNewUserNip] = useState("");
  const [newUserName, setNewUserName] = useState("");
  const [newUserRole, setNewUserRole] = useState("guru");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [savingUser, setSavingUser] = useState(false);
  const [studentAccountRows, setStudentAccountRows] = useState<StudentAccountImportRow[]>([]);
  const [studentAccountFileName, setStudentAccountFileName] = useState("");
  const [studentAccountImportError, setStudentAccountImportError] = useState("");
  const [studentAccountImportMessage, setStudentAccountImportMessage] = useState("");
  const [creatingStudentAccounts, setCreatingStudentAccounts] = useState(false);
  const [showStudentAccountImport, setShowStudentAccountImport] = useState(false);
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
  const [createUserError, setCreateUserError] = useState("");
  const [createUserMessage, setCreateUserMessage] = useState("");
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState("");
  const [usersLoaded, setUsersLoaded] = useState(false);
  const [userSearch, setUserSearch] = useState("");
  const [userRoleFilter, setUserRoleFilter] = useState("all");
  const [userStatusFilter, setUserStatusFilter] = useState("all");
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

  void getMaintenanceStatus()
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
  let requestInFlight = false;
  const refreshFeed = async () => {
    if (!active || requestInFlight) return;
    requestInFlight = true;
    setDashboardFeedLoading(true);
    try {
      const feed = await loadDashboardFeed(account);
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
      requestInFlight = false;
      if (active) setDashboardFeedLoading(false);
    }
  };

  void refreshFeed();
  const realtimeTables = new Set<string>(["school_notifications", "school_announcements"]);
  if (account.role === "siswa") {
    ["academic_records", "library_loans", "library_loan_requests", "library_digital_access", "letter_requests"]
      .forEach((table) => realtimeTables.add(table));
  } else if (account.role === "guru" && account.teacher_id) {
    ["academic_records", "attendance_qr_records", "letter_requests"]
      .forEach((table) => realtimeTables.add(table));
  } else if (account.role === "guru_bk") {
    ["attendance_bk_alerts", "kb_catatan_bk", "letter_requests"]
      .forEach((table) => realtimeTables.add(table));
  }
  if (["super_admin", "kepala_sekolah", "operator", "kepala_tata_usaha"].includes(account.role)) {
    ["letter_requests", "finance_transactions", "inv_issues", "app_activity_logs"]
      .forEach((table) => realtimeTables.add(table));
  }
  let channel = supabase.channel(`dashboard-notifications-${account.id}`);
  realtimeTables.forEach((table) => {
    channel = channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table },
      () => void refreshFeed(),
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
  }, 60_000);
  const onVisibilityChange = () => {
    if (document.visibilityState === "visible") void refreshFeed();
  };
  document.addEventListener("visibilitychange", onVisibilityChange);

  return () => {
    active = false;
    window.clearInterval(intervalId);
    document.removeEventListener("visibilitychange", onVisibilityChange);
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



const loadManagedUsers = useCallback(async () => {
  setUsersLoading(true);
  setUsersError("");

  try {
    const users = await getManagedUsers();
    setManagedUsers(users);
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
}, []);

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

    setManagedUsers(users);
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
    setManagedUsers(latestUsers);
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

const downloadStudentAccountTemplate = () => {
  const dataSheet = XLSX.utils.aoa_to_sheet([
    ["NISN", "Nama Lengkap"],
  ]);
  dataSheet["!cols"] = [{ wch: 18 }, { wch: 36 }];
  const instructions = XLSX.utils.aoa_to_sheet([
    ["TEMPLATE AKUN SISWA SMAN 7 MAROS"],
    ["Isi satu siswa pada setiap baris di lembar Data Siswa."],
    ["NISN wajib berupa 10 angka. Atur kolom NISN sebagai teks agar angka nol di depan tidak hilang."],
    ["Nama Lengkap wajib diisi."],
    ["Jangan mengubah nama kolom pada baris pertama."],
    ["Password awal setiap akun akan sama dengan NISN."],
  ]);
  instructions["!cols"] = [{ wch: 110 }];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, dataSheet, "Data Siswa");
  XLSX.utils.book_append_sheet(workbook, instructions, "Petunjuk");
  XLSX.writeFile(workbook, "Template_Akun_Siswa_SMAN_7_Maros.xlsx");
};

const handleStudentAccountFile = async (
  event: React.ChangeEvent<HTMLInputElement>
) => {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;

  setStudentAccountImportError("");
  setStudentAccountImportMessage("");
  setStudentAccountRows([]);
  setStudentAccountFileName(file.name);

  try {
    const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    if (!sheet) throw new Error("File Excel tidak memiliki lembar kerja.");

    const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: "",
      raw: false,
      blankrows: true,
    });
    const parsedRows = rawRows.flatMap((raw, index): StudentAccountImportRow[] => {
        const values = new Map<string, string>();
        Object.entries(raw).forEach(([key, value]) => {
          values.set(key.trim().toLowerCase().replace(/[\s_-]+/g, ""), String(value ?? "").trim());
        });
        const nisn = values.get("nisn") ?? "";
        const fullName = values.get("namalengkap") ?? values.get("nama") ?? "";
        if (!nisn && !fullName) return [];

        const problems: string[] = [];
        if (!/^\d{10}$/.test(nisn)) problems.push("NISN harus 10 angka");
        if (fullName.length < 2 || fullName.length > 150) problems.push("Nama wajib 2–150 karakter");

        return [{
          rowNumber: index + 2,
          nisn,
          fullName,
          status: problems.length ? "invalid" as const : "ready" as const,
          message: problems.join("; "),
        }];
      });

    if (parsedRows.length === 0) {
      throw new Error("Tidak ada baris data. Periksa lembar pertama dan nama kolom template.");
    }

    const nisnCounts = new Map<string, number>();
    parsedRows.forEach((row) => {
      if (row.nisn) nisnCounts.set(row.nisn, (nisnCounts.get(row.nisn) ?? 0) + 1);
    });
    const existingUsernames = new Set(
      managedUsers
        .map((user) => user.username.trim().toLowerCase())
    );
    const rows = parsedRows.map((row) => {
      if (row.status === "invalid") return row;
      if ((nisnCounts.get(row.nisn) ?? 0) > 1) {
        return { ...row, status: "duplicate" as const, message: "NISN muncul lebih dari sekali di file" };
      }
      if (existingUsernames.has(row.nisn.toLowerCase())) {
        return { ...row, status: "existing" as const, message: "Username sudah digunakan akun lain" };
      }
      return row;
    });
    setStudentAccountRows(rows);
  } catch (error) {
    setStudentAccountImportError(
      error instanceof Error ? error.message : "File Excel gagal dibaca."
    );
  }
};

const createStudentAccounts = async () => {
  const readyRows = studentAccountRows.filter((row) => row.status === "ready");
  if (readyRows.length === 0 || creatingStudentAccounts) return;
  if (!window.confirm(`Buat ${readyRows.length} akun siswa? Username dan password awal setiap akun adalah NISN.`)) {
    return;
  }

  setCreatingStudentAccounts(true);
  setStudentAccountImportError("");
  setStudentAccountImportMessage("");
  try {
    const currentUsers = await getManagedUsers();
    setManagedUsers(currentUsers);
    setUsersLoaded(true);
    const existingUsernames = new Set(
      currentUsers
        .map((user) => user.username.trim().toLowerCase())
    );
    const pendingRows = studentAccountRows.map((row) =>
      row.status === "ready" && existingUsernames.has(row.nisn.toLowerCase())
        ? { ...row, status: "existing" as const, message: "Username sudah digunakan akun lain" }
        : row
    );
    setStudentAccountRows(pendingRows);

    const rowsToCreate = pendingRows.filter((row) => row.status === "ready");
    if (rowsToCreate.length === 0) {
      setStudentAccountImportMessage("Tidak ada akun baru yang perlu dibuat.");
      return;
    }

    let createdCount = 0;
    for (const row of rowsToCreate) {
      setStudentAccountRows((current) =>
        current.map((item) => item.rowNumber === row.rowNumber
          ? { ...item, status: "creating", message: "Sedang dibuat..." }
          : item)
      );
      try {
        const { data, error } = await supabase.functions.invoke("manage-users", {
          body: {
            action: "create",
            username: row.nisn,
            full_name: row.fullName,
            role: "siswa",
            password: row.nisn,
          },
        });
        if (error) {
          let serverMessage = "";
          try {
            const response = (error as { context?: Response }).context;
            if (response) {
              const payload = await response.clone().json();
              serverMessage = payload?.error || "";
            }
          } catch {
            // Use the function client's message when the response is not JSON.
          }
          throw new Error(serverMessage || data?.error || error.message || "Akun gagal dibuat.");
        }
        if (!data || data.error) throw new Error(data?.error || "Akun gagal dibuat.");

        createdCount += 1;
        setStudentAccountRows((current) =>
          current.map((item) => item.rowNumber === row.rowNumber
            ? { ...item, status: "created", message: "Akun berhasil dibuat" }
            : item)
        );
      } catch (error) {
        setStudentAccountRows((current) =>
          current.map((item) => item.rowNumber === row.rowNumber
            ? {
                ...item,
                status: "failed",
                message: error instanceof Error ? error.message : "Akun gagal dibuat",
              }
            : item)
        );
      }
    }

    const failedCount = rowsToCreate.length - createdCount;
    const auditWarning = createdCount > 0
      ? await auditUserChange("Akun siswa dibuat secara massal", `${createdCount} akun siswa berhasil dibuat.`)
      : "";
    setStudentAccountImportMessage(
      `${createdCount} akun berhasil dibuat${failedCount ? `, ${failedCount} gagal` : ""}.${auditWarning ? ` ${auditWarning}` : ""}`
    );
    await loadManagedUsers();
  } catch (error) {
    setStudentAccountImportError(
      error instanceof Error ? error.message : "Daftar akun tidak dapat diperiksa."
    );
  } finally {
    setCreatingStudentAccounts(false);
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
  let active = true;

  async function checkConnection() {
    try {
      const session = await getValidSupabaseSession();
      if (!session) {
        if (active) setSupabaseStatus("Sesi login tidak aktif");
        return;
      }

      const { error } = await supabase
        .from("school_settings")
        .select("id")
        .limit(1);

      if (error) throw error;

      if (active) {
        setSupabaseStatus("Database terhubung");
      }
    } catch (error) {
      if (active) {
        const statusError = error as { code?: string; message?: string };
        const message = isSupabaseRateLimitError(error)
          ? "Supabase sementara menolak permintaan (HTTP 429)"
          : statusError.code === "42501"
            ? "Database terhubung — akses pengaturan terbatas"
            : statusError.message?.includes("Failed to fetch")
              ? "Koneksi database tidak tersedia"
              : "Database belum dapat diperiksa";
        setSupabaseStatus(message);
      }
    }
  }

  void checkConnection();

  return () => {
    active = false;
  };
}, []);

useEffect(() => {
  let mounted = true;
  let sessionSyncId = 0;

  async function syncSession() {
    const syncId = ++sessionSyncId;

    try {
      const session = await withTimeout(
        getValidSupabaseSession(),
        16_000,
        "Pemeriksaan sesi Supabase melewati batas waktu.",
      );
      const userId = session?.user.id;

      if (!userId) {
        if (mounted && syncId === sessionSyncId) {
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
        console.error("Profil pengguna gagal diperiksa:", profileError);
        setAuthError(`Profil akun belum dapat diverifikasi: ${profileError.message}`);
        return;
      }

      if (!profile || profile.status !== "active" || profile.role === "pending") {
        await supabase.auth.signOut({ scope: "local" });
        if (syncId !== sessionSyncId || !mounted) return;
        setCurrentUser(null);
        setAuthError("");
        setActivePage("Dashboard");
        return;
      }

      setAuthError("");
      const nextUser = {
        id: profile.id,
        username: profile.username,
        role: profile.role,
      };
      setCurrentUser((currentUser) =>
        currentUser !== null &&
        currentUser.id === nextUser.id &&
        currentUser.username === nextUser.username &&
        currentUser.role === nextUser.role
          ? currentUser
          : nextUser,
      );
    } catch (error) {
      console.error("Pemeriksaan sesi gagal:", error);
      if (mounted && syncId === sessionSyncId) {
        const message = error instanceof Error ? error.message : String(error);
        setAuthError(`Sesi login belum dapat diverifikasi: ${message}`);
      }
    } finally {
      if (mounted && syncId === sessionSyncId) setAuthReady(true);
    }
  }

  const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
    if (!mounted) return;

    if (event === "INITIAL_SESSION") return;

    if (event === "SIGNED_OUT") {
      sessionSyncId += 1;
      setCurrentUser(null);
      setAuthError("");
      setActivePage("Dashboard");
      setAuthReady(true);
      return;
    }

    if (event !== "SIGNED_IN") return;

    setAuthReady(false);
    setAuthError("");
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
  let statsRequestInFlight = false;
  async function loadDashboardStats() {
    if (!active || statsRequestInFlight) return;
    if (dashboardUser.role === "guru_bk") {
      return;
    }
    statsRequestInFlight = true;
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
            : previous.attendance,
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
                ...(canViewAttendanceToday
                  ? {
                      attendance: dashboardMetric(
                        "kehadiran pribadi",
                        null,
                        error,
                        previous.attendance,
                      ),
                    }
                  : {}),
                letters: dashboardMetric(
                  "surat diproses",
                  null,
                  error,
                  previous.letters,
                ),
              });
        }
      } finally {
        statsRequestInFlight = false;
        if (active) setDashboardRefreshing(false);
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
            ? "Supabase membatasi pembaruan sesi (HTTP 429). Data terakhir tetap ditampilkan."
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
      statsRequestInFlight = false;
      if (active) setDashboardRefreshing(false);
    }
  }

  void loadDashboardStats();
  const intervalId = window.setInterval(() => {
    if (document.visibilityState === "visible") void loadDashboardStats();
  }, 60_000);
  const handleVisibilityChange = () => {
    if (document.visibilityState === "visible") void loadDashboardStats();
  };
  document.addEventListener("visibilitychange", handleVisibilityChange);

  return () => {
    active = false;
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
  if (!allowedPages.includes(name)) {
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
   if (name === "Dashboard") {
    openPage("Dashboard");
    return;
  }
   if (moduleEnabledOverrides[name] === false) {
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

  
const isDashboard = activePage === "Dashboard";

const roleAllowedPages = roleAccess[currentUser?.role ?? ""] ?? [
  "Dashboard",
];
const showAttendanceAndLettersDashboard = [
  "guru",
  "kepala_sekolah",
  "kepala_tata_usaha",
  "staff_tata_usaha",
  "tendik",
].includes(currentUser?.role ?? "");
const allowedPages = roleAllowedPages.filter((name) =>
  name === "Dashboard" || name === "Pengaturan" || moduleEnabledOverrides[name] !== false
);
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
  if (activePage !== "Dashboard" && moduleEnabledOverrides[activePage] === false) {
    setActivePage("Dashboard");
  }
}, [activePage, moduleEnabledOverrides]);

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
      || `${user.username} ${user.full_name}`.toLocaleLowerCase("id-ID").includes(searchTerm);
    const matchesRole = userRoleFilter === "all" || user.role === userRoleFilter;
    const matchesStatus = userStatusFilter === "all"
      || (userStatusFilter === "active" ? user.status === "active" : user.status !== "active");
    return matchesSearch && matchesRole && matchesStatus;
  });
}, [managedUsers, userRoleFilter, userSearch, userStatusFilter]);

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

  if (!authReady || !maintenanceStatusLoaded) {
  return (
    <div className="auth-loading">
      <MaintenanceBanner />
      Memeriksa sesi dan status pemeliharaan...
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

if (moduleEnabledOverrides[activePage] === false && activePage !== "Dashboard") {
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
  "Perpustakaan": <Perpustakaan userRole={currentUser.role} userId={currentUser.id} username={currentUser.username} />,
  "Inventaris": <Inventaris userRole={currentUser.role} />,
  "Keuangan": <KeuanganDigital userRole={currentUser.role} />,
  "Persuratan": <PersuratanModule currentUser={currentUser} onBack={() => setActivePage("Dashboard")} />,
  "Akademik": <Akademik currentUser={currentUser} userRole={currentUser.role} />,
  "SMAVEN Learn": <SmavenLearn currentUser={currentUser} userRole={currentUser.role} userName={currentUser.full_name} />,
  "Kesiswaan": <KesiswaanBK key="kesiswaan" currentUser={currentUser} userRole={currentUser.role} module="kesiswaan" />,
  "Bimbingan dan Konseling": <KesiswaanBK key="bimbingan-konseling" currentUser={currentUser} userRole={currentUser.role} module="bimbingan-konseling" />,
  "Pemilihan OSIS": <PemilihanOSISModule hasAuthenticatedUser={Boolean(currentUser)} />,
  "Laporan & Analitik": <LaporanAnalitik userRole={currentUser.role} />,
  "Pengaturan": <PengaturanIntegrasi onModulesUpdated={refreshSettingsContext} />,
};

if (moduleStatuses[activePage] === "active" && moduleFullscreenComponents[activePage]) {
  return (
    <main className={`module-fullscreen${activePage === "SMAVEN Learn" ? " smaven-learn-fullscreen" : ""}${activePage === "Persuratan" ? " persuratan-module-fullscreen" : ""}`}>
      <MaintenanceBanner />
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
                    <h1>Selamat datang di<br /><span>Super App SMAN 7 Maros!</span></h1>
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
                    disabled={dashboardRefreshing}
                    onClick={() => {
                      setDashboardReload((reload) => reload + 1);
                      setDashboardFeedReload((reload) => reload + 1);
                    }}
                  >
                    {dashboardRefreshing ? "Memperbarui kartu..." : "Perbarui ringkasan"}
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
                      {activityItems.length === 0 && <div className="activity-item"><span className="activity-copy"><span>{dashboardFeedLoading ? "Memuat aktivitas…" : "Belum ada aktivitas yang dapat ditampilkan."}</span></span></div>}
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
       <Perpustakaan userRole={currentUser.role} userId={currentUser.id} username={currentUser.username} />
     </motion.div>
) : activePage === "Akademik" ? (
     <motion.div key="akademik" className="page-stack" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} transition={{ duration: 0.2 }}>
       <Akademik currentUser={currentUser} userRole={currentUser.role} />
     </motion.div>
) : activePage === "Kesiswaan" ? (
     <motion.div key="kesiswaan" className="page-stack" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} transition={{ duration: 0.2 }}>
       <KesiswaanBK currentUser={currentUser} userRole={currentUser.role} module="kesiswaan" />
     </motion.div>
) : activePage === "Bimbingan dan Konseling" ? (
     <motion.div key="bimbingan-konseling" className="page-stack" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} transition={{ duration: 0.2 }}>
       <KesiswaanBK currentUser={currentUser} userRole={currentUser.role} module="bimbingan-konseling" />
     </motion.div>
) : activePage === "Pemilihan OSIS" ? (
     <motion.div key="pemilihan-osis" className="page-stack" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} transition={{ duration: 0.2 }}>
       <PemilihanOSISModule hasAuthenticatedUser={Boolean(currentUser)} />
     </motion.div>
) : activePage === "Laporan & Analitik" ? (
     <motion.div key="laporan-analitik" className="page-stack" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} transition={{ duration: 0.2 }}>
       <LaporanAnalitik userRole={currentUser.role} />
     </motion.div>
) : activePage === "Pengaturan" ? (
      <motion.div key="pengaturan-integrasi" className="page-stack" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} transition={{ duration: 0.2 }}>
        <PengaturanIntegrasi onModulesUpdated={refreshSettingsContext} />
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
        {usersLoading ? "Memuat pengguna..." : usersLoaded ? "Perbarui daftar" : "Muat daftar pengguna"}
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

      <button
        className="user-button user-button-import"
        onClick={() => {
          setShowStudentAccountGenerator(false);
          setShowStudentAccountImport((show) => !show);
          setStudentAccountImportError("");
          setStudentAccountImportMessage("");
        }}
        disabled={studentGeneratorCreating}
      >
        <FileSpreadsheet size={17} />
        {showStudentAccountImport ? "Tutup Impor Siswa" : "Tambah Akun Siswa Massal"}
      </button>
      {currentUser?.role === "super_admin" && (
        <button
          type="button"
          className="user-button user-button-primary"
          onClick={() => {
            const nextOpen = !showStudentAccountGenerator;
            setShowStudentAccountGenerator(nextOpen);
            if (nextOpen) {
              setShowStudentAccountImport(false);
              void loadStudentAccountGenerator();
            }
          }}
          disabled={studentGeneratorCreating || creatingStudentAccounts}
        >
          <Sparkles size={17} />
          {showStudentAccountGenerator ? "Tutup Generator Siswa" : "Generate Akun dari Data Induk"}
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

    {showStudentAccountImport && (
      <section className="content-card user-list-card student-account-import-card">
        <div className="card-heading">
          <div>
            <h3>Impor Akun Siswa</h3>
            <p>Gunakan NISN sebagai username dan password awal.</p>
          </div>
          <span className="heading-icon"><FileSpreadsheet size={19} /></span>
        </div>

        <div className="student-import-actions">
          <button
            type="button"
            className="user-action-button"
            onClick={downloadStudentAccountTemplate}
            disabled={creatingStudentAccounts}
          >
            <Download size={16} /> Unduh Template Excel
          </button>
          <label className="user-action-button student-import-upload">
            <Upload size={16} /> Pilih File Excel
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={(event) => void handleStudentAccountFile(event)}
              disabled={creatingStudentAccounts}
            />
          </label>
          {studentAccountFileName && (
            <span className="student-import-filename">{studentAccountFileName}</span>
          )}
        </div>

        <p className="student-import-guidance">
          Kolom yang dibutuhkan: <strong>NISN</strong> (10 angka) dan <strong>Nama Lengkap</strong>.
          NISN harus diatur sebagai teks pada Excel agar angka nol di depan tidak terhapus.
          Akun yang sudah terdaftar dan NISN ganda di file tidak akan dibuat.
        </p>

        {studentAccountImportError && (
          <div className="module-notice" role="alert">
            <CircleAlert size={18} /><span>{studentAccountImportError}</span>
          </div>
        )}
        {studentAccountImportMessage && (
          <p className="student-import-result" role="status">{studentAccountImportMessage}</p>
        )}

        {studentAccountRows.length > 0 && (
          <>
            <p className="student-import-count">
              {studentAccountRows.filter((row) => row.status === "ready").length} siap dibuat ·{" "}
              {studentAccountRows.filter((row) => row.status === "existing").length} sudah ada ·{" "}
              {studentAccountRows.filter((row) => row.status === "duplicate").length} duplikat file ·{" "}
              {studentAccountRows.filter((row) => row.status === "invalid" || row.status === "failed").length} perlu diperiksa/gagal
            </p>
            <div className="user-table-scroll">
              <table className="student-import-table">
                <thead>
                  <tr><th>Baris</th><th>NISN</th><th>Nama Lengkap</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {studentAccountRows.map((row) => (
                    <tr key={`${row.rowNumber}-${row.nisn}`}>
                      <td>{row.rowNumber}</td>
                      <td>{row.nisn || "—"}</td>
                      <td>{row.fullName || "—"}</td>
                      <td>
                        <span className={`student-import-status is-${row.status}`}>
                          {row.message || (row.status === "ready" ? "Siap dibuat" : row.status)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button
              type="button"
              className="primary-button student-import-create"
              onClick={() => void createStudentAccounts()}
              disabled={creatingStudentAccounts || !studentAccountRows.some((row) => row.status === "ready")}
            >
              {creatingStudentAccounts ? "Membuat akun..." : "Buat Akun yang Siap"}
            </button>
          </>
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
            <option value="kepala_sekolah">Kepala Sekolah</option>
            <option value="operator">Operator Sekolah</option>
            <option value="kepala_tata_usaha">Kepala Tata Usaha</option>
            <option value="staff_tata_usaha">Staff Tata Usaha</option>
            <option value="guru">Guru</option>
            <option value="guru_bk">Guru BK</option>
            <option value="siswa">Siswa</option>
            <option value="tendik">Tendik</option>
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

    {usersLoaded && (
      <div className="content-card user-list-card">
        <div className="card-heading">
          <div>
            <span className="user-card-eyebrow">DIREKTORI AKUN</span>
            <h3>Daftar Pengguna</h3>
            <p>Menampilkan {filteredManagedUsers.length} dari {managedUsers.length} akun</p>
          </div>
          <span className="heading-icon">
            <Users size={19} />
          </span>
        </div>

        <div className="user-table-toolbar">
          <label className="user-search-field">
            <Search size={17} />
            <input
              type="search"
              value={userSearch}
              onChange={(event) => setUserSearch(event.target.value)}
              placeholder="Cari nama atau NIP/username..."
              aria-label="Cari pengguna"
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
        </div>

        {managedUsers.length === 0 ? (
          <div className="user-empty-state user-empty-state-compact">
            <span><Users size={22} /></span>
            <div><strong>Belum ada pengguna</strong><p>Akun yang terdaftar akan muncul di sini.</p></div>
          </div>
        ) : filteredManagedUsers.length === 0 ? (
          <div className="user-empty-state user-empty-state-compact">
            <span><Search size={22} /></span>
            <div>
              <strong>Pengguna tidak ditemukan</strong>
              <p>Coba ubah kata kunci atau filter yang dipilih.</p>
            </div>
            <button type="button" className="user-reset-filters" onClick={() => {
              setUserSearch("");
              setUserRoleFilter("all");
              setUserStatusFilter("all");
            }}>Atur ulang filter</button>
          </div>
        ) : (
          <div className="user-table-scroll">
            <table className="user-table">
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
                {filteredManagedUsers.map((user, index) => (
                  <tr key={user.id} style={{ animationDelay: `${Math.min(index * 45, 360)}ms` }}>
                    <td><span className="user-username">{user.username}</span></td>
                    <td>
                      <span className="user-person-cell">
                        <span className="user-person-avatar">{user.full_name.trim().charAt(0).toUpperCase() || "?"}</span>
                        <span className="user-person-copy">
                          <strong className="user-name-cell">{user.full_name}</strong>
                          <small>{user.username}</small>
                        </span>
                      </span>
                    </td>
                    <td>
                      {user.role === "super_admin" ? (
                        <span className="user-role-label"><ShieldCheck size={14} /> Super Admin</span>
                      ) : (
                        <select
                          className="user-role-select"
                          value={user.role}
                          onChange={(event) => updateManagedUser(user.id, { role: event.target.value })}
                          aria-label={`Role ${user.full_name}`}
                        >
                          <option value="kepala_sekolah">Kepala Sekolah</option>
                          <option value="operator">Operator</option>
                          <option value="kepala_tata_usaha">Kepala Tata Usaha</option>
                          <option value="staff_tata_usaha">Staff Tata Usaha</option>
                          <option value="guru">Guru</option>
                          <option value="guru_bk">Guru BK</option>
                          <option value="siswa">Siswa</option>
                          <option value="tendik">Tendik</option>
                        </select>
                      )}
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
        )}
      </div>
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

