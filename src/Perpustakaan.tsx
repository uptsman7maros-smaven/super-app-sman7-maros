import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import * as XLSX from "xlsx";
import {
  AlertTriangle,
  BookMarked,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Download,
  LibraryBig,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Settings2,
  ShieldCheck,
  Upload,
  Users,
  X,
} from "lucide-react";
import { getManagedUsers, type ManagedUser } from "./lib/manageUsers";
import { supabase } from "./lib/supabase";
import { useSchoolContext } from "./context/useSchoolContext";
import PersonPicker from "./components/shared/PersonPicker";
import type { PersonOption } from "./services/masterDataService";
import "./Perpustakaan.css";
import "./PerpustakaanPermissions.css";

type Book = {
  id: string;
  code: string;
  title: string;
  author: string;
  publisher: string | null;
  publish_year: number | null;
  category: string | null;
  isbn: string | null;
  stock_total: number;
  stock_available: number;
  shelf: string | null;
};
type Member = {
  id: string;
  member_no: string;
  full_name: string;
  member_type: string;
  class_name: string | null;
  identifier: string | null;
  phone: string | null;
  active: boolean;
  profile_id?: string | null;
  student_id?: string | null;
  teacher_id?: string | null;
};
type Loan = {
  id: string;
  loan_code: string;
  book_id: string;
  member_id: string;
  profile_id: string | null;
  student_id?: string | null;
  teacher_id?: string | null;
  class_name?: string | null;
  borrowed_at: string;
  due_at: string;
  returned_at: string | null;
  status: string;
  note: string | null;
  books?: Book | null;
  library_members?: Member | null;
};
type Visit = {
  id: string;
  visit_date: string;
  visitor_name: string;
  visitor_type: string;
  purpose: string | null;
  profile_id: string | null;
};
type LoanRequest = {
  id: string;
  student_id: string;
  master_student_id?: string | null;
  class_name?: string | null;
  student_username: string;
  student_name: string;
  book_id: string;
  requested_at: string;
  note: string | null;
  status: string;
  review_note: string | null;
  due_at: string | null;
  loan_id: string | null;
};
type DigitalBook = {
  id: string;
  title: string;
  author: string;
  description: string | null;
  file_path: string;
  active: boolean;
};
type DigitalAccess = {
  id: string;
  digital_book_id: string;
  student_id: string;
  master_student_id?: string | null;
  class_name?: string | null;
  student_username: string;
  student_name: string;
  requested_at: string;
  status: string;
  expires_at: string | null;
};
type DigitalReader = {
  title: string;
  url: string;
  expiresAt: string;
};
type Settings = {
  physical_loan_days: number;
  digital_access_minutes: number;
};
type Props = {
  userRole?: string;
  userId?: string;
  username?: string;
};

const today = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};

const plusDays = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};

function errText(error: unknown) {
  if (typeof error === "object" && error !== null && "message" in error && typeof error.message === "string") {
    return error.message;
  }
  return "Terjadi kesalahan. Periksa koneksi dan pengaturan database.";
}

function displayDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("id-ID", {
    dateStyle: "medium",
    timeStyle: value.includes("T") ? "short" : undefined,
  });
}

function isDigitalAccessActive(access: DigitalAccess) {
  return access.status === "active"
    && !!access.expires_at
    && new Date(access.expires_at).getTime() > Date.now();
}

export default function Perpustakaan({
  userRole = "",
  userId = "",
  username = "",
}: Props) {
  const { currentUser } = useSchoolContext();
  const isStudent = userRole === "siswa";
  const isSuperAdmin = userRole === "super_admin";
  const [canManage, setCanManage] = useState(isSuperAdmin);
  const [tab, setTab] = useState(isStudent || !isSuperAdmin ? "katalog" : "ringkasan");
  const [books, setBooks] = useState<Book[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [loanRequests, setLoanRequests] = useState<LoanRequest[]>([]);
  const [digitalBooks, setDigitalBooks] = useState<DigitalBook[]>([]);
  const [digitalAccess, setDigitalAccess] = useState<DigitalAccess[]>([]);
  const [digitalReader, setDigitalReader] = useState<DigitalReader | null>(null);
  const [readerNow, setReaderNow] = useState(0);
  const autoOpenedAccessIds = useRef(new Set<string>());
  const [settings, setSettings] = useState<Settings>({ physical_loan_days: 7, digital_access_minutes: 30 });
  const [managedUsers, setManagedUsers] = useState<ManagedUser[]>([]);
  const [assignments, setAssignments] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [showBook, setShowBook] = useState(false);
  const [showMember, setShowMember] = useState(false);
  const [showLoan, setShowLoan] = useState(false);
  const [showVisit, setShowVisit] = useState(false);
  const [showDigitalBook, setShowDigitalBook] = useState(false);
  const [bookFile, setBookFile] = useState<File | null>(null);
  const [bookForm, setBookForm] = useState({
    code: "",
    title: "",
    author: "",
    publisher: "",
    publish_year: "",
    category: "",
    isbn: "",
    stock_total: "1",
    shelf: "",
  });
  const [memberForm, setMemberForm] = useState({
    member_no: "",
    full_name: "",
    member_type: "siswa",
    class_name: "",
    identifier: "",
    phone: "",
  });
  const [memberPerson, setMemberPerson] = useState<PersonOption | null>(null);
  const [loanForm, setLoanForm] = useState({
    book_id: "",
    member_id: "",
    borrowed_at: today(),
    due_at: plusDays(7),
    note: "",
  });
  const [studentVisit, setStudentVisit] = useState({ purpose: "Membaca di perpustakaan" });
  const [visitForm, setVisitForm] = useState({
    visit_date: today(),
    visitor_name: "",
    visitor_type: "siswa",
    purpose: "Membaca di perpustakaan",
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      let manager = isSuperAdmin;
      if (!isStudent && !isSuperAdmin) {
        const { data, error } = await supabase.rpc("library_can_manage");
        if (error) throw new Error(`Perbarui database Perpustakaan terlebih dahulu: ${error.message}`);
        manager = Boolean(data);
      }
      setCanManage(manager);

      const { data: bookData, error: bookError } = await supabase
        .from("library_books")
        .select("*")
        .order("title");
      if (bookError) throw bookError;
      setBooks(bookData ?? []);

      const { data: digitalBookData, error: digitalBookError } = await supabase
        .from("library_digital_books")
        .select("id,title,author,description,file_path,active")
        .eq("active", true)
        .order("title");
      if (digitalBookError) throw digitalBookError;
      setDigitalBooks(digitalBookData ?? []);

      if (manager) {
        const [membersResult, loansResult, visitsResult, requestsResult, accessResult, settingsResult] =
          await Promise.all([
            supabase.from("library_members").select("*").order("full_name"),
            supabase.from("library_loans")
              .select("*, books:library_books(*), library_members(*)")
              .order("borrowed_at", { ascending: false })
              .limit(500),
            supabase.from("library_visits").select("*").order("visit_date", { ascending: false }).limit(500),
            supabase.from("library_loan_requests").select("*").order("requested_at", { ascending: false }).limit(500),
            supabase.from("library_digital_access").select("*").order("requested_at", { ascending: false }).limit(500),
            supabase.from("library_settings").select("physical_loan_days,digital_access_minutes").maybeSingle(),
          ]);
        const queryError = [
          membersResult.error,
          loansResult.error,
          visitsResult.error,
          requestsResult.error,
          accessResult.error,
          settingsResult.error,
        ].find(Boolean);
        if (queryError) throw queryError;
        setMembers(membersResult.data ?? []);
        setLoans(loansResult.data ?? []);
        setVisits(visitsResult.data ?? []);
        setLoanRequests(requestsResult.data ?? []);
        setDigitalAccess(accessResult.data ?? []);
        if (settingsResult.data) setSettings(settingsResult.data);
      } else if (isStudent) {
        if (!userId) throw new Error("ID akun tidak tersedia untuk mengaitkan riwayat siswa.");
        const [loanResult, visitResult, requestResult, accessResult] = await Promise.all([
          supabase.from("library_loans")
            .select("*, books:library_books(*)")
            .eq("profile_id", userId)
            .order("borrowed_at", { ascending: false }),
          supabase.from("library_visits")
            .select("*")
            .eq("profile_id", userId)
            .order("visit_date", { ascending: false }),
          supabase.from("library_loan_requests")
            .select("*")
            .eq("student_id", userId)
            .order("requested_at", { ascending: false }),
          supabase.from("library_digital_access")
            .select("*")
            .eq("student_id", userId)
            .order("requested_at", { ascending: false }),
        ]);
        const queryError = [loanResult.error, visitResult.error, requestResult.error, accessResult.error].find(Boolean);
        if (queryError) throw queryError;
        setLoans(loanResult.data ?? []);
        setVisits(visitResult.data ?? []);
        setLoanRequests(requestResult.data ?? []);
        setDigitalAccess(accessResult.data ?? []);
      } else {
        setMembers([]);
        setLoans([]);
        setVisits([]);
        setLoanRequests([]);
        setDigitalAccess([]);
      }

      if (isSuperAdmin) {
        const { data, error } = await supabase
          .from("library_librarian_assignments")
          .select("profile_id")
          .eq("active", true);
        if (error) throw error;
        setAssignments((data ?? []).map((assignment) => assignment.profile_id));
      }
    } catch (error) {
      setNotice(errText(error));
    } finally {
      setLoading(false);
    }
  }, [isStudent, isSuperAdmin, userId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    if (!isSuperAdmin) return;
    let active = true;
    void getManagedUsers().then((users) => {
      if (active) setManagedUsers(users.filter((user) => user.status === "active"));
    }).catch((error: unknown) => {
      if (active) setNotice(errText(error));
    });
    return () => {
      active = false;
    };
  }, [isSuperAdmin]);

  const activeLoans = useMemo(() => loans.filter((loan) => !loan.returned_at), [loans]);
  const overdueLoans = useMemo(
    () => activeLoans.filter((loan) => loan.due_at < today()),
    [activeLoans],
  );
  const filteredBooks = useMemo(
    () => books.filter((book) =>
      `${book.title} ${book.author} ${book.code} ${book.category ?? ""} ${book.isbn ?? ""}`
        .toLowerCase()
        .includes(search.toLowerCase()),
    ),
    [books, search],
  );
  const filteredLoans = useMemo(
    () => loans.filter((loan) =>
      `${loan.loan_code} ${loan.books?.title ?? ""} ${loan.library_members?.full_name ?? ""} ${loan.library_members?.member_no ?? ""}`
        .toLowerCase()
        .includes(search.toLowerCase()),
    ),
    [loans, search],
  );
  const pendingRequests = loanRequests.filter((request) => request.status === "pending");
  const pendingDigitalAccess = digitalAccess.filter((access) => access.status === "pending");
  const pendingApprovalCount = pendingRequests.length + pendingDigitalAccess.length;
  const pendingStudentCount = new Set([
    ...pendingRequests.map((request) => request.student_id),
    ...pendingDigitalAccess.map((access) => access.student_id),
  ]).size;

  const tabs = isStudent
    ? [
      { id: "katalog", label: "Buku Fisik", icon: BookOpen },
      { id: "digital", label: "Buku Digital", icon: BookMarked },
      { id: "kunjungan", label: "Kunjungan", icon: CalendarDays },
      { id: "riwayat", label: "Riwayat Saya", icon: CalendarDays },
    ]
    : canManage
      ? [
        { id: "ringkasan", label: "Ringkasan", icon: LibraryBig },
        { id: "katalog", label: "Buku Fisik", icon: BookOpen },
        { id: "digital", label: "Buku Digital", icon: BookMarked },
        { id: "anggota", label: "Anggota", icon: Users },
        { id: "peminjaman", label: "Sirkulasi", icon: RotateCcw },
        { id: "permintaan", label: "Persetujuan", icon: CheckCircle2 },
        { id: "kunjungan", label: "Kunjungan", icon: CalendarDays },
        { id: "pengaturan", label: "Pengaturan", icon: Settings2 },
        ...(isSuperAdmin ? [{ id: "penanggung-jawab", label: "Penanggung Jawab", icon: ShieldCheck }] : []),
      ]
      : [{ id: "katalog", label: "Katalog Buku", icon: BookOpen }];

  const selectTab = (nextTab: string) => {
    setTab(nextTab);
    setSearch("");
  };

  const saveBook = async (event: FormEvent) => {
    event.preventDefault();
    try {
      const quantity = Math.max(0, Number(bookForm.stock_total) || 0);
      const { error } = await supabase.from("library_books").insert({
        code: bookForm.code.trim(),
        title: bookForm.title.trim(),
        author: bookForm.author.trim(),
        publisher: bookForm.publisher.trim() || null,
        publish_year: bookForm.publish_year ? Number(bookForm.publish_year) : null,
        category: bookForm.category.trim() || null,
        isbn: bookForm.isbn.trim() || null,
        stock_total: quantity,
        stock_available: quantity,
        shelf: bookForm.shelf.trim() || null,
      });
      if (error) throw error;
      setShowBook(false);
      setBookForm({
        code: "", title: "", author: "", publisher: "", publish_year: "",
        category: "", isbn: "", stock_total: "1", shelf: "",
      });
      setNotice("Buku berhasil ditambahkan.");
      await load();
    } catch (error) {
      setNotice(errText(error));
    }
  };

  const saveMember = async (event: FormEvent) => {
    event.preventDefault();
    try {
      const { error } = await supabase.from("library_members").insert({
        member_no: memberForm.member_no.trim(),
        full_name: memberForm.full_name.trim(),
        member_type: memberForm.member_type,
        class_name: memberForm.class_name.trim() || null,
        identifier: memberForm.identifier.trim() || null,
        phone: memberForm.phone.trim() || null,
        profile_id: memberPerson?.profile_id ?? null,
        student_id: memberPerson?.type === "student" ? memberPerson.id : null,
        teacher_id: memberPerson?.type === "teacher" ? memberPerson.id : null,
        class_id: memberPerson?.type === "student" ? memberPerson.class_id : null,
      });
      if (error) throw error;
      setShowMember(false);
      setMemberPerson(null);
      setNotice("Anggota berhasil ditambahkan.");
      await load();
    } catch (error) {
      setNotice(errText(error));
    }
  };

  const saveLoan = async (event: FormEvent) => {
    event.preventDefault();
    try {
      const book = books.find((item) => item.id === loanForm.book_id);
      if (!book || book.stock_available < 1) throw new Error("Stok buku tidak tersedia.");
      const loanCode = `PJM-${today().replaceAll("-", "")}-${crypto.randomUUID().slice(0, 5).toUpperCase()}`;
      const { error } = await supabase.rpc("library_create_loan", {
        p_book_id: loanForm.book_id,
        p_member_id: loanForm.member_id,
        p_loan_code: loanCode,
        p_borrowed_at: loanForm.borrowed_at,
        p_due_at: loanForm.due_at,
        p_note: loanForm.note.trim() || null,
      });
      if (error) throw error;
      setShowLoan(false);
      setNotice("Peminjaman tercatat dan stok diperbarui.");
      await load();
    } catch (error) {
      setNotice(errText(error));
    }
  };

  const returnLoan = async (loan: Loan) => {
    if (!window.confirm(`Catat pengembalian buku “${loan.books?.title ?? "buku"}”?`)) return;
    try {
      const { error } = await supabase.rpc("library_return_loan", {
        p_loan_id: loan.id,
        p_returned_at: today(),
      });
      if (error) throw error;
      setNotice("Pengembalian berhasil dicatat dan stok diperbarui.");
      await load();
    } catch (error) {
      setNotice(errText(error));
    }
  };

  const recordVisit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      if (isStudent) {
        const { error } = await supabase.rpc("library_record_student_visit", {
          p_visitor_name: currentUser?.full_name || username,
          p_visit_date: today(),
          p_purpose: studentVisit.purpose.trim() || null,
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.from("library_visits").insert({
          ...visitForm,
          visitor_name: visitForm.visitor_name.trim(),
          profile_id: null,
        });
        if (error) throw error;
        setShowVisit(false);
      }
      setNotice("Kunjungan berhasil dicatat.");
      await load();
    } catch (error) {
      setNotice(errText(error));
    }
  };

  const syncMasterMembers = async () => {
    try {
      const { data, error } = await supabase.rpc("library_sync_master_members");
      if (error) throw error;
      setNotice(`${Number(data ?? 0)} anggota berhasil disinkronkan dari Data Induk.`);
      await load();
    } catch (error) {
      setNotice(errText(error));
    }
  };

  const requestPhysicalLoan = async (bookId: string) => {
    try {
      const { error } = await supabase.rpc("library_request_physical_loan", {
        p_book_id: bookId,
        p_note: null,
      });
      if (error) throw error;
      setNotice("Permintaan tercatat. Peminjaman aktif setelah Kepala Perpustakaan menyerahkan buku.");
      await load();
    } catch (error) {
      setNotice(errText(error));
    }
  };

  const reviewPhysicalLoan = async (request: LoanRequest, decision: "approved" | "rejected") => {
    const dueDate = decision === "approved"
      ? window.prompt("Tanggal jatuh tempo (YYYY-MM-DD)", plusDays(settings.physical_loan_days))
      : null;
    if (decision === "approved" && !dueDate) return;
    try {
      const { error } = await supabase.rpc("library_review_physical_loan", {
        p_request_id: request.id,
        p_decision: decision,
        p_due_at: dueDate,
        p_review_note: null,
      });
      if (error) throw error;
      setNotice(decision === "approved" ? "Peminjaman disahkan dan stok diperbarui." : "Permintaan ditolak.");
      await load();
    } catch (error) {
      setNotice(errText(error));
    }
  };

  const requestDigitalAccess = async (bookId: string) => {
    try {
      const { error } = await supabase.rpc("library_request_digital_access", { p_book_id: bookId });
      if (error) throw error;
      setNotice("Permintaan akses buku digital dikirim kepada Kepala Perpustakaan.");
      await load();
    } catch (error) {
      setNotice(errText(error));
    }
  };

  const reviewDigitalAccess = async (access: DigitalAccess, decision: "approved" | "rejected") => {
    try {
      const { error } = await supabase.rpc("library_review_digital_access", {
        p_access_id: access.id,
        p_decision: decision,
        p_review_note: null,
      });
      if (error) throw error;
      setNotice(decision === "approved"
        ? `Akses disetujui selama ${settings.digital_access_minutes} menit sejak persetujuan.`
        : "Permintaan akses ditolak.");
      await load();
    } catch (error) {
      setNotice(errText(error));
    }
  };

  const saveDigitalBook = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const title = String(formData.get("title") ?? "").trim();
    const author = String(formData.get("author") ?? "").trim();
    const description = String(formData.get("description") ?? "").trim();
    if (!bookFile || bookFile.type !== "application/pdf" || !bookFile.name.toLowerCase().endsWith(".pdf")) {
      setNotice("Pilih berkas PDF yang valid.");
      return;
    }
    if (bookFile.size > 30 * 1024 * 1024) {
      setNotice("Ukuran PDF maksimal 30 MB.");
      return;
    }
    const path = `${crypto.randomUUID()}.pdf`;
    try {
      const { error: uploadError } = await supabase.storage
        .from("library-digital-books")
        .upload(path, bookFile, { contentType: "application/pdf", upsert: false });
      if (uploadError) throw uploadError;
      const { error: recordError } = await supabase.from("library_digital_books").insert({
        title,
        author,
        description: description || null,
        file_path: path,
        created_by: userId,
      });
      if (recordError) {
        const { error: cleanupError } = await supabase.storage.from("library-digital-books").remove([path]);
        if (cleanupError) {
          throw new Error(`${recordError.message} Berkas PDF yatim juga gagal dibersihkan: ${cleanupError.message}`);
        }
        throw recordError;
      }
      setShowDigitalBook(false);
      setBookFile(null);
      setNotice("Buku digital berhasil ditambahkan ke penyimpanan privat.");
      await load();
    } catch (error) {
      setNotice(errText(error));
    }
  };

  const saveSettings = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const physicalDays = Number(formData.get("physical_loan_days"));
    const digitalMinutes = Number(formData.get("digital_access_minutes"));
    try {
      const { error } = await supabase.rpc("library_update_settings", {
        p_physical_loan_days: physicalDays,
        p_digital_access_minutes: digitalMinutes,
      });
      if (error) throw error;
      setSettings({ physical_loan_days: physicalDays, digital_access_minutes: digitalMinutes });
      setNotice("Pengaturan layanan perpustakaan berhasil disimpan.");
    } catch (error) {
      setNotice(errText(error));
    }
  };

  const assignLibrarian = async (profileId: string, assigned: boolean) => {
    try {
      const { error } = assigned
        ? await supabase.rpc("library_remove_head_librarian", { p_profile_id: profileId })
        : await supabase.rpc("library_assign_head_librarian", { p_profile_id: profileId });
      if (error) throw error;
      setNotice(assigned ? "Penugasan Kepala Perpustakaan dicabut." : "Guru ditetapkan sebagai Kepala Perpustakaan.");
      await load();
    } catch (error) {
      setNotice(errText(error));
    }
  };

  const exportExcel = (rows: Record<string, string | number>[], name: string) => {
    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Laporan");
    XLSX.writeFile(workbook, `${name}_${today()}.xlsx`);
  };

  const digitalBookById = (id: string) => digitalBooks.find((book) => book.id === id);
  const physicalBookById = (id: string) => books.find((book) => book.id === id);
  const openDigitalBook = useCallback(async (access: DigitalAccess, automatic = false) => {
    if (automatic && autoOpenedAccessIds.current.has(access.id)) return;
    if (automatic) autoOpenedAccessIds.current.add(access.id);
    try {
      const { data, error } = await supabase.functions.invoke("library-digital-book-url", {
        body: { access_id: access.id },
      });
      if (error) throw error;
      if (typeof data?.url !== "string" || !data.url) {
        throw new Error(data?.error ?? "Tautan buku digital tidak tersedia.");
      }
      if (typeof data.expires_at !== "string") {
        throw new Error("Waktu kedaluwarsa tautan PDF tidak tersedia.");
      }
      setDigitalReader({
        title: digitalBooks.find((book) => book.id === access.digital_book_id)?.title ?? "Buku digital",
        url: data.url,
        expiresAt: data.expires_at,
      });
      setReaderNow(Date.now());
    } catch (error) {
      if (automatic) autoOpenedAccessIds.current.delete(access.id);
      setNotice(errText(error));
    }
  }, [digitalBooks]);

  const refreshStudentDigitalAccess = useCallback(async (autoOpen = false) => {
    const { data, error } = await supabase
      .from("library_digital_access")
      .select("*")
      .eq("student_id", userId)
      .order("requested_at", { ascending: false });
    if (error) {
      setNotice(errText(error));
      return;
    }
    const accesses = data ?? [];
    setDigitalAccess(accesses);
    if (autoOpen) {
      const activeAccess = accesses.find((access) =>
        isDigitalAccessActive(access) && !autoOpenedAccessIds.current.has(access.id),
      );
      if (activeAccess) void openDigitalBook(activeAccess, true);
    }
  }, [openDigitalBook, userId]);

  useEffect(() => {
    if (!isStudent) return;
    const activeAccess = digitalAccess.find((access) =>
      isDigitalAccessActive(access) && !autoOpenedAccessIds.current.has(access.id),
    );
    if (activeAccess) void openDigitalBook(activeAccess, true);
  }, [digitalAccess, isStudent, openDigitalBook]);

  useEffect(() => {
    if (!digitalReader) return;
    const timer = window.setInterval(() => setReaderNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [digitalReader]);

  useEffect(() => {
    if (!digitalReader) return;
    const timer = window.setTimeout(() => {
      setDigitalReader(null);
      setNotice("Waktu akses buku digital telah berakhir.");
    }, Math.max(0, new Date(digitalReader.expiresAt).getTime() - Date.now()));
    return () => window.clearTimeout(timer);
  }, [digitalReader]);

  useEffect(() => {
    if (!userId || (!isStudent && !canManage)) return;

    let channel = supabase.channel(`library-live-${userId}`);
    if (isStudent) {
      channel = channel
        .on("postgres_changes", {
          event: "*",
          schema: "public",
          table: "library_digital_access",
          filter: `student_id=eq.${userId}`,
        }, () => {
          void refreshStudentDigitalAccess(true);
        })
        .on("postgres_changes", {
          event: "*",
          schema: "public",
          table: "library_loan_requests",
          filter: `student_id=eq.${userId}`,
        }, () => {
          void load();
        });
    }
    if (canManage) {
      channel = channel
        .on("postgres_changes", {
          event: "*",
          schema: "public",
          table: "library_loan_requests",
        }, () => {
          void load();
        })
        .on("postgres_changes", {
          event: "*",
          schema: "public",
          table: "library_digital_access",
        }, () => {
          void load();
        });
    }
    channel.subscribe((status, error) => {
      if (status === "CHANNEL_ERROR" && error) setNotice(errText(error));
    });
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [canManage, isStudent, load, refreshStudentDigitalAccess, userId]);

  const readerSecondsRemaining = digitalReader
    ? Math.max(0, Math.ceil((new Date(digitalReader.expiresAt).getTime() - readerNow) / 1000))
    : 0;
  const readerTimeLabel = `${Math.floor(readerSecondsRemaining / 60)}:${String(readerSecondsRemaining % 60).padStart(2, "0")}`;

  return (
    <div className={`library-page${canManage ? "" : " lib-read-only"}${isStudent ? " lib-student" : ""}`} data-tab={tab}>
      <header className="library-hero">
        <div>
          <span className="library-eyebrow">SMAN 7 MAROS · LAYANAN LITERASI</span>
          <h1>Perpustakaan <span aria-hidden="true">📚</span></h1>
          <p>
            {isStudent
              ? "Ajukan peminjaman, akses buku digital, dan catat kunjungan perpustakaan."
              : canManage
                ? "Layanan perpustakaan dikelola Kepala Perpustakaan; role utama akun tetap."
                : "Jelajahi koleksi buku Perpustakaan SMAN 7 Maros."}
          </p>
        </div>
        <button className="lib-refresh" onClick={() => void load()}><RefreshCw size={16} /> Perbarui</button>
        <div className="library-orb orb-one" />
        <div className="library-orb orb-two" />
      </header>

      {isStudent && (
        <div className="lib-student-hint">
          <BookOpen size={17} />
          <span>Peminjaman fisik menunggu pengesahan saat buku diserahkan. Akses PDF juga memerlukan persetujuan.</span>
        </div>
      )}
      {notice && (
        <div className="lib-notice" role="status">
          <AlertTriangle size={17} />
          <span>{notice}</span>
          <button onClick={() => setNotice("")} aria-label="Tutup pemberitahuan"><X size={16} /></button>
        </div>
      )}

      {canManage && (
        <div className="lib-stats">
          <div className="lib-stat stat-violet"><span>Total judul buku fisik</span><strong>{books.length}</strong><BookOpen /></div>
          <div className="lib-stat stat-blue"><span>Eksemplar tersedia</span><strong>{books.reduce((sum, book) => sum + book.stock_available, 0)}</strong><LibraryBig /></div>
          <div className="lib-stat stat-orange"><span>Sedang dipinjam</span><strong>{activeLoans.length}</strong><BookMarked /></div>
          <div className="lib-stat stat-pink"><span>Permintaan menunggu</span><strong>{pendingApprovalCount}</strong><Clock3 /></div>
        </div>
      )}

      <nav className="lib-tabs" aria-label="Menu perpustakaan">
        {tabs.map((item) => (
          <button key={item.id} className={tab === item.id ? "selected" : ""} onClick={() => selectTab(item.id)}>
            <item.icon size={17} />{item.label}
            {item.id === "permintaan" && pendingStudentCount > 0 && (
              <span className="lib-tab-badge" aria-label={`${pendingStudentCount} siswa menunggu persetujuan`}>
                {pendingStudentCount}
              </span>
            )}
          </button>
        ))}
      </nav>

      <div className="lib-toolbar">
        <div className="lib-search">
          <Search size={18} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={tab === "katalog" || tab === "digital" ? "Cari judul, penulis, kode, ISBN..." : "Cari nama, kode, atau koleksi..."}
          />
        </div>
        <div className="lib-actions">
          {canManage && tab === "katalog" && <button className="lib-primary" onClick={() => setShowBook(true)}><Plus size={17} /> Tambah Buku</button>}
          {canManage && tab === "digital" && <button className="lib-primary" onClick={() => setShowDigitalBook(true)}><Upload size={17} /> Unggah PDF</button>}
          {canManage && tab === "anggota" && (
            <>
              <button className="lib-secondary" onClick={() => void syncMasterMembers()}><RefreshCw size={16} /> Sinkronkan Data Induk</button>
              <button className="lib-primary" onClick={() => { setMemberPerson(null); setShowMember(true); }}><Plus size={17} /> Tambah Anggota</button>
            </>
          )}
          {canManage && tab === "peminjaman" && (
            <>
              <button className="lib-primary" onClick={() => {
                setLoanForm({ ...loanForm, due_at: plusDays(settings.physical_loan_days) });
                setShowLoan(true);
              }}><Plus size={17} /> Catat Peminjaman</button>
              <button className="lib-secondary" onClick={() => exportExcel(loans.map((loan) => ({
                Kode: loan.loan_code,
                Anggota: loan.library_members?.full_name ?? "",
                Buku: loan.books?.title ?? "",
                Tanggal_Pinjam: loan.borrowed_at,
                Jatuh_Tempo: loan.due_at,
                Tanggal_Kembali: loan.returned_at ?? "",
                Status: loan.returned_at ? "Kembali" : loan.due_at < today() ? "Terlambat" : "Dipinjam",
              })), "laporan_peminjaman")}><Download size={16} /> Excel</button>
            </>
          )}
          {canManage && tab === "kunjungan" && (
            <>
              <button className="lib-primary" onClick={() => setShowVisit(true)}><Plus size={17} /> Catat Kunjungan</button>
              <button className="lib-secondary" onClick={() => exportExcel(visits.map((visit) => ({
                Tanggal: visit.visit_date, Nama: visit.visitor_name, Jenis: visit.visitor_type, Tujuan: visit.purpose ?? "",
              })), "laporan_kunjungan")}><Download size={16} /> Excel</button>
            </>
          )}
        </div>
      </div>

      {loading ? (
        <div className="lib-empty"><RefreshCw className="lib-spin" /> Memuat data perpustakaan...</div>
      ) : tab === "ringkasan" && canManage ? (
        <div className="lib-overview">
          <section className="lib-panel">
            <h2><AlertTriangle size={19} /> Pengingat jatuh tempo</h2>
            {overdueLoans.length === 0
              ? <div className="lib-empty"><CheckCircle2 /> Tidak ada peminjaman terlambat saat ini.</div>
              : overdueLoans.slice(0, 8).map((loan) => (
                <div className="lib-reminder" key={loan.id}>
                  <div className="lib-book-mini"><BookOpen /></div>
                  <div><b>{loan.books?.title ?? "Buku"}</b><span>{loan.library_members?.full_name ?? "Anggota"} · jatuh tempo {loan.due_at}</span></div>
                  <span className="lib-overdue-tag">Terlambat</span>
                  <button onClick={() => void returnLoan(loan)}>Kembalikan</button>
                </div>
              ))}
          </section>
          <section className="lib-panel">
            <h2><BookMarked size={19} /> Aktivitas peminjaman terbaru</h2>
            {loans.slice(0, 6).map((loan) => (
              <div className="lib-recent" key={loan.id}>
                <span className="lib-dot" />
                <div><b>{loan.library_members?.full_name ?? "Anggota"}</b><span>{loan.books?.title ?? "Buku"}</span></div>
                <small>{loan.returned_at ? "Sudah kembali" : loan.due_at < today() ? "Terlambat" : "Dipinjam"}</small>
              </div>
            ))}
            {loans.length === 0 && <p className="lib-muted">Belum ada transaksi peminjaman.</p>}
          </section>
        </div>
      ) : tab === "katalog" ? (
        <div className="lib-book-grid">
          {filteredBooks.map((book) => {
            const alreadyRequested = loanRequests.some((request) =>
              request.book_id === book.id && request.status === "pending",
            );
            return (
              <article className="lib-book-card" key={book.id}>
                <div className="lib-book-cover"><BookOpen size={33} /><span>{book.category || "Koleksi umum"}</span></div>
                <div className="lib-book-info">
                  <small>{book.code}{book.isbn ? ` · ISBN ${book.isbn}` : ""}</small>
                  <h3>{book.title}</h3>
                  <p>{book.author}</p>
                  <div className="lib-book-meta"><span>Rak: {book.shelf || "—"}</span><b>{book.stock_available}/{book.stock_total} tersedia</b></div>
                  <div className="lib-stock"><i style={{ width: `${book.stock_total ? Math.min(100, book.stock_available / book.stock_total * 100) : 0}%` }} /></div>
                  {isStudent && (
                    <button
                      className="lib-primary lib-card-action"
                      disabled={book.stock_available < 1 || alreadyRequested}
                      onClick={() => void requestPhysicalLoan(book.id)}
                    >
                      {alreadyRequested ? "Menunggu persetujuan" : book.stock_available < 1 ? "Stok habis" : "Ajukan peminjaman"}
                    </button>
                  )}
                </div>
              </article>
            );
          })}
          {filteredBooks.length === 0 && <div className="lib-empty">Belum ada buku yang cocok.</div>}
        </div>
      ) : tab === "digital" ? (
        <div className="lib-book-grid">
          {digitalBooks.filter((book) => `${book.title} ${book.author}`.toLowerCase().includes(search.toLowerCase())).map((book) => {
            const access = digitalAccess.find((item) => item.digital_book_id === book.id &&
              (item.status === "pending" || (item.status === "active" && !!item.expires_at && item.expires_at > new Date().toISOString())));
            return (
              <article className="lib-book-card" key={book.id}>
                <div className="lib-book-cover"><BookMarked size={33} /><span>PDF privat · akses bertimer</span></div>
                <div className="lib-book-info">
                  <h3>{book.title}</h3><p>{book.author}</p>
                  {book.description && <p>{book.description}</p>}
                  {isStudent && (
                    <div className="lib-card-actions">
                      {access?.status === "pending"
                        ? <span className="lib-pill warn">Menunggu persetujuan</span>
                        : access?.status === "active"
                          ? <button className="lib-primary" onClick={() => void openDigitalBook(access)}>Baca PDF · berakhir {displayDate(access.expires_at)}</button>
                          : <button className="lib-primary" onClick={() => void requestDigitalAccess(book.id)}>Minta akses baca</button>}
                    </div>
                  )}

                  {digitalReader && (
                    <div className="lib-reader-backdrop" onMouseDown={(event) => {
                      if (event.target === event.currentTarget) setDigitalReader(null);
                    }}>
                      <section className="lib-reader" role="dialog" aria-modal="true" aria-label={`Pembaca PDF: ${digitalReader.title}`}>
                        <header className="lib-reader-head">
                          <div>
                            <h2>{digitalReader.title}</h2>
                            <span>Akses berakhir dalam {readerTimeLabel}</span>
                          </div>
                          <button type="button" onClick={() => setDigitalReader(null)} aria-label="Tutup pembaca PDF"><X /></button>
                        </header>
                        <iframe src={digitalReader.url} title={`Baca ${digitalReader.title}`} />
                      </section>
                    </div>
                  )}
                </div>
              </article>
            );
          })}
          {digitalBooks.length === 0 && <div className="lib-empty">Belum ada buku digital yang tersedia.</div>}
        </div>
      ) : tab === "anggota" && canManage ? (
        <div className="lib-table-wrap">
          <table className="lib-table"><thead><tr><th>No. Anggota</th><th>Nama</th><th>Jenis</th><th>Kelas</th><th>Kontak</th><th>Status</th><th>Riwayat</th></tr></thead>
            <tbody>{members.filter((member) => `${member.member_no} ${member.full_name} ${member.class_name ?? ""}`.toLowerCase().includes(search.toLowerCase())).map((member) => (
              <tr key={member.id}>
                <td><b>{member.member_no}</b></td><td>{member.full_name}<small className="lib-subline">{member.identifier ?? ""}</small></td>
                <td>{member.member_type}</td><td>{member.class_name ?? "—"}</td><td>{member.phone ?? "—"}</td>
                <td><span className={member.active ? "lib-pill good" : "lib-pill bad"}>{member.active ? "Aktif" : "Nonaktif"}</span></td>
                <td><button className="lib-link" onClick={() => { setSearch(member.full_name); selectTab("peminjaman"); }}>Lihat riwayat</button></td>
              </tr>
            ))}</tbody>
          </table>
          {members.length === 0 && <div className="lib-empty">Belum ada anggota perpustakaan.</div>}
        </div>
      ) : tab === "peminjaman" && canManage ? (
        <div className="lib-table-wrap">
          <table className="lib-table"><thead><tr><th>Kode</th><th>Anggota</th><th>Buku</th><th>Pinjam</th><th>Jatuh tempo</th><th>Status</th><th>Aksi</th></tr></thead>
            <tbody>{filteredLoans.map((loan) => (
              <tr key={loan.id}>
                <td><b>{loan.loan_code}</b></td><td>{loan.library_members?.full_name ?? "—"}<small className="lib-subline">{loan.library_members?.member_no ?? ""}</small></td>
                <td>{loan.books?.title ?? "—"}</td><td>{loan.borrowed_at}</td><td>{loan.due_at}</td>
                <td><span className={`lib-pill ${loan.returned_at ? "good" : loan.due_at < today() ? "bad" : "warn"}`}>{loan.returned_at ? "Kembali" : loan.due_at < today() ? "Terlambat" : "Dipinjam"}</span></td>
                <td>{!loan.returned_at && <button className="lib-return" onClick={() => void returnLoan(loan)}><RotateCcw size={14} /> Kembalikan</button>}</td>
              </tr>
            ))}</tbody>
          </table>
          {filteredLoans.length === 0 && <div className="lib-empty">Belum ada transaksi.</div>}
        </div>
      ) : tab === "permintaan" && canManage ? (
        <div className="lib-overview">
          <section className="lib-panel">
            <h2><BookOpen size={19} /> Permintaan peminjaman fisik</h2>
            {pendingRequests.length === 0 && <div className="lib-empty">Tidak ada permintaan peminjaman yang menunggu.</div>}
            {pendingRequests.map((request) => (
              <div className="lib-request" key={request.id}>
                <div><b>{physicalBookById(request.book_id)?.title ?? "Buku tidak ditemukan"}</b><span>{request.student_name} · {request.class_name || request.student_username}</span><small>{displayDate(request.requested_at)}</small></div>
                <div className="lib-request-actions">
                  <button className="lib-primary" onClick={() => void reviewPhysicalLoan(request, "approved")}>Serahkan & setujui</button>
                  <button className="lib-secondary" onClick={() => void reviewPhysicalLoan(request, "rejected")}>Tolak</button>
                </div>
              </div>
            ))}
          </section>
          <section className="lib-panel">
            <h2><BookMarked size={19} /> Permintaan akses digital</h2>
            {pendingDigitalAccess.length === 0 && <div className="lib-empty">Tidak ada permintaan akses digital yang menunggu.</div>}
            {pendingDigitalAccess.map((access) => (
              <div className="lib-request" key={access.id}>
                <div><b>{digitalBookById(access.digital_book_id)?.title ?? "Buku tidak ditemukan"}</b><span>{access.student_name} · {access.class_name || access.student_username}</span><small>{displayDate(access.requested_at)}</small></div>
                <div className="lib-request-actions">
                  <button className="lib-primary" onClick={() => void reviewDigitalAccess(access, "approved")}>Setujui {settings.digital_access_minutes} menit</button>
                  <button className="lib-secondary" onClick={() => void reviewDigitalAccess(access, "rejected")}>Tolak</button>
                </div>
              </div>
            ))}
          </section>
        </div>
      ) : tab === "kunjungan" && (canManage || isStudent) ? (
        isStudent ? (
          <section className="lib-panel">
            <h2><CalendarDays size={19} /> Kunjungan saya</h2>
            <form className="lib-inline-form" onSubmit={(event) => void recordVisit(event)}>
              <label>Tujuan kunjungan<input value={studentVisit.purpose} onChange={(event) => setStudentVisit({ purpose: event.target.value })} maxLength={300} /></label>
              <button className="lib-primary"><Plus size={16} /> Catat kunjungan hari ini</button>
            </form>
            {visits.map((visit) => <div className="lib-recent" key={visit.id}><span className="lib-dot" /><div><b>{visit.purpose || "Kunjungan perpustakaan"}</b><span>{visit.visit_date}</span></div></div>)}
            {visits.length === 0 && <div className="lib-empty">Belum ada riwayat kunjungan.</div>}
          </section>
        ) : (
          <div className="lib-table-wrap">
            <table className="lib-table"><thead><tr><th>Tanggal</th><th>Nama pengunjung</th><th>Jenis</th><th>Tujuan</th><th>Akun</th></tr></thead>
              <tbody>{visits.filter((visit) => `${visit.visitor_name} ${visit.visitor_type} ${visit.purpose ?? ""}`.toLowerCase().includes(search.toLowerCase())).map((visit) => (
                <tr key={visit.id}><td>{visit.visit_date}</td><td>{visit.visitor_name}</td><td>{visit.visitor_type}</td><td>{visit.purpose ?? "—"}</td><td>{visit.profile_id ?? "—"}</td></tr>
              ))}</tbody>
            </table>
            {visits.length === 0 && <div className="lib-empty">Belum ada data kunjungan.</div>}
          </div>
        )
      ) : tab === "riwayat" && isStudent ? (
        <div className="lib-overview">
          <section className="lib-panel">
            <h2><BookMarked size={19} /> Riwayat peminjaman</h2>
            {loans.map((loan) => (
              <div className="lib-recent" key={loan.id}>
                <span className="lib-dot" />
                <div><b>{loan.books?.title ?? "Buku"}</b><span>{loan.borrowed_at} · jatuh tempo {loan.due_at}</span></div>
                <small>{loan.returned_at ? `Dikembalikan ${loan.returned_at}` : loan.due_at < today() ? "Terlambat" : "Dipinjam"}</small>
              </div>
            ))}
            {loanRequests.map((request) => (
              <div className="lib-recent" key={request.id}>
                <span className="lib-dot" />
                <div><b>{physicalBookById(request.book_id)?.title ?? "Buku"}</b><span>Permintaan {displayDate(request.requested_at)}</span></div>
                <small>{request.status === "pending" ? "Menunggu" : request.status === "approved" ? `Disetujui · jatuh tempo ${request.due_at ?? "—"}` : "Ditolak"}</small>
              </div>
            ))}
            {loans.length === 0 && loanRequests.length === 0 && <div className="lib-empty">Belum ada riwayat peminjaman.</div>}
          </section>
          <section className="lib-panel">
            <h2><CalendarDays size={19} /> Riwayat kunjungan</h2>
            {visits.map((visit) => <div className="lib-recent" key={visit.id}><span className="lib-dot" /><div><b>{visit.purpose || "Kunjungan perpustakaan"}</b><span>{visit.visit_date}</span></div></div>)}
            {visits.length === 0 && <div className="lib-empty">Belum ada riwayat kunjungan.</div>}
          </section>
        </div>
      ) : tab === "pengaturan" && canManage ? (
        <section className="lib-panel lib-settings-panel">
          <h2><Settings2 size={19} /> Pengaturan layanan</h2>
          <p className="lib-muted">Masa pinjam dan durasi akses digital diterapkan saat transaksi atau persetujuan baru.</p>
          <form className="lib-settings-form" onSubmit={(event) => void saveSettings(event)}>
            <label>Masa pinjam fisik (hari)<input name="physical_loan_days" type="number" min="1" max="90" value={settings.physical_loan_days} onChange={(event) => setSettings({ ...settings, physical_loan_days: Number(event.target.value) })} required /></label>
            <label>Akses PDF setelah disetujui (menit)<input name="digital_access_minutes" type="number" min="1" max="1440" value={settings.digital_access_minutes} onChange={(event) => setSettings({ ...settings, digital_access_minutes: Number(event.target.value) })} required /></label>
            <button className="lib-primary">Simpan pengaturan</button>
          </form>
        </section>
      ) : tab === "penanggung-jawab" && canManage && isSuperAdmin ? (
        <section className="lib-panel">
          <h2><ShieldCheck size={19} /> Penanggung jawab Perpustakaan</h2>
          <p className="lib-muted">Penugasan ini tidak mengubah role utama. Hanya guru aktif yang dapat ditetapkan.</p>
          <div className="lib-table-wrap">
            <table className="lib-table"><thead><tr><th>Nama</th><th>Username</th><th>Role utama</th><th>Penugasan</th><th>Aksi</th></tr></thead>
              <tbody>{managedUsers.map((user) => {
                const assigned = assignments.includes(user.id);
                const eligible = user.role === "guru";
                return (
                  <tr key={user.id}>
                    <td>{user.full_name}</td><td>{user.username}</td><td>{user.role}</td>
                    <td><span className={`lib-pill ${assigned ? "good" : "warn"}`}>{assigned ? "Kepala Perpustakaan" : "Guru"}</span></td>
                    <td><button className={assigned ? "lib-secondary" : "lib-primary"} disabled={!assigned && !eligible} onClick={() => void assignLibrarian(user.id, assigned)}>
                      {assigned ? "Cabut penugasan" : eligible ? "Tetapkan" : "Khusus guru"}
                    </button></td>
                  </tr>
                );
              })}</tbody>
            </table>
            {managedUsers.length === 0 && <div className="lib-empty">Tidak ada akun guru aktif yang tersedia.</div>}
          </div>
        </section>
      ) : (
        <div className="lib-empty"><BookOpen /> Pilih menu Perpustakaan yang tersedia untuk akun Anda.</div>
      )}

      {showBook && canManage && (
        <div className="lib-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowBook(false); }}>
          <form className="lib-modal" onSubmit={(event) => void saveBook(event)}>
            <div className="lib-modal-head"><div><span>KOLEKSI FISIK</span><h2>Tambah buku</h2></div><button type="button" onClick={() => setShowBook(false)}><X /></button></div>
            <div className="lib-form-grid">
              <label>Kode buku *<input required value={bookForm.code} onChange={(event) => setBookForm({ ...bookForm, code: event.target.value })} /></label>
              <label>Judul buku *<input required value={bookForm.title} onChange={(event) => setBookForm({ ...bookForm, title: event.target.value })} /></label>
              <label>Penulis *<input required value={bookForm.author} onChange={(event) => setBookForm({ ...bookForm, author: event.target.value })} /></label>
              <label>Kategori<input value={bookForm.category} onChange={(event) => setBookForm({ ...bookForm, category: event.target.value })} /></label>
              <label>Penerbit<input value={bookForm.publisher} onChange={(event) => setBookForm({ ...bookForm, publisher: event.target.value })} /></label>
              <label>Tahun terbit<input type="number" min="1000" max="2100" value={bookForm.publish_year} onChange={(event) => setBookForm({ ...bookForm, publish_year: event.target.value })} /></label>
              <label>ISBN<input value={bookForm.isbn} onChange={(event) => setBookForm({ ...bookForm, isbn: event.target.value })} /></label>
              <label>Jumlah eksemplar *<input required type="number" min="0" value={bookForm.stock_total} onChange={(event) => setBookForm({ ...bookForm, stock_total: event.target.value })} /></label>
              <label>Lokasi rak<input value={bookForm.shelf} onChange={(event) => setBookForm({ ...bookForm, shelf: event.target.value })} /></label>
            </div>
            <button className="lib-primary lib-submit">Simpan buku</button>
          </form>
        </div>
      )}

      {showDigitalBook && canManage && (
        <div className="lib-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowDigitalBook(false); }}>
          <form className="lib-modal" onSubmit={(event) => void saveDigitalBook(event)}>
            <div className="lib-modal-head"><div><span>KOLEKSI DIGITAL PRIVAT</span><h2>Unggah buku PDF</h2></div><button type="button" onClick={() => setShowDigitalBook(false)}><X /></button></div>
            <div className="lib-form-grid">
              <label>Judul buku *<input name="title" required maxLength={180} /></label>
              <label>Penulis *<input name="author" required maxLength={150} /></label>
              <label className="full-span">Deskripsi<input name="description" maxLength={500} /></label>
              <label className="full-span">Berkas PDF (maks. 30 MB) *<input type="file" accept="application/pdf,.pdf" required onChange={(event: ChangeEvent<HTMLInputElement>) => setBookFile(event.target.files?.[0] ?? null)} /></label>
            </div>
            <button className="lib-primary lib-submit">Simpan buku digital</button>
          </form>
        </div>
      )}

      {showMember && canManage && (
        <div className="lib-modal-backdrop">
          <form className="lib-modal" onSubmit={(event) => void saveMember(event)}>
            <div className="lib-modal-head"><div><span>KEANGGOTAAN</span><h2>Tambah anggota</h2></div><button type="button" onClick={() => setShowMember(false)}><X /></button></div>
            <div className="lib-form-grid">
              <label className="full-span">Pilih dari Data Induk<PersonPicker
                value={memberPerson}
                onChange={(person) => {
                  setMemberPerson(person);
                  if (!person) return;
                  const prefix = person.type === "student" ? "S" : "G";
                  setMemberForm({
                    ...memberForm,
                    member_no: `${prefix}-${person.identifier}`,
                    full_name: person.full_name,
                    member_type: person.type === "student" ? "siswa" : "guru",
                    class_name: person.class_name ?? "",
                    identifier: person.identifier,
                  });
                }}
              /></label>
              <label>Nomor anggota *<input required value={memberForm.member_no} onChange={(event) => setMemberForm({ ...memberForm, member_no: event.target.value })} /></label>
              <label>Nama lengkap *<input required value={memberForm.full_name} onChange={(event) => setMemberForm({ ...memberForm, full_name: event.target.value })} /></label>
              <label>Jenis anggota<select value={memberForm.member_type} onChange={(event) => setMemberForm({ ...memberForm, member_type: event.target.value })}><option value="siswa">Siswa</option><option value="guru">Guru</option><option value="tendik">Tenaga Kependidikan</option><option value="umum">Umum</option></select></label>
              <label>Kelas<input value={memberForm.class_name} onChange={(event) => setMemberForm({ ...memberForm, class_name: event.target.value })} /></label>
              <label>NISN / NIP<input value={memberForm.identifier} onChange={(event) => setMemberForm({ ...memberForm, identifier: event.target.value })} /></label>
              <label>No. telepon<input value={memberForm.phone} onChange={(event) => setMemberForm({ ...memberForm, phone: event.target.value })} /></label>
            </div>
            <button className="lib-primary lib-submit">Simpan anggota</button>
          </form>
        </div>
      )}

      {showLoan && canManage && (
        <div className="lib-modal-backdrop">
          <form className="lib-modal" onSubmit={(event) => void saveLoan(event)}>
            <div className="lib-modal-head"><div><span>SIRKULASI KOLEKSI</span><h2>Catat peminjaman</h2></div><button type="button" onClick={() => setShowLoan(false)}><X /></button></div>
            <div className="lib-form-grid">
              <label>Anggota *<select required value={loanForm.member_id} onChange={(event) => setLoanForm({ ...loanForm, member_id: event.target.value })}><option value="">Pilih anggota</option>{members.filter((member) => member.active).map((member) => <option key={member.id} value={member.id}>{member.member_no} — {member.full_name}</option>)}</select></label>
              <label>Buku tersedia *<select required value={loanForm.book_id} onChange={(event) => setLoanForm({ ...loanForm, book_id: event.target.value })}><option value="">Pilih buku</option>{books.filter((book) => book.stock_available > 0).map((book) => <option key={book.id} value={book.id}>{book.code} — {book.title} (stok {book.stock_available})</option>)}</select></label>
              <label>Tanggal pinjam *<input type="date" required value={loanForm.borrowed_at} onChange={(event) => setLoanForm({ ...loanForm, borrowed_at: event.target.value })} /></label>
              <label>Jatuh tempo *<input type="date" required min={loanForm.borrowed_at} value={loanForm.due_at} onChange={(event) => setLoanForm({ ...loanForm, due_at: event.target.value })} /></label>
              <label className="full-span">Catatan<input value={loanForm.note} onChange={(event) => setLoanForm({ ...loanForm, note: event.target.value })} /></label>
            </div>
            <button className="lib-primary lib-submit">Catat peminjaman</button>
          </form>
        </div>
      )}

      {showVisit && canManage && (
        <div className="lib-modal-backdrop">
          <form className="lib-modal" onSubmit={(event) => void recordVisit(event)}>
            <div className="lib-modal-head"><div><span>BUKU TAMU</span><h2>Catat kunjungan</h2></div><button type="button" onClick={() => setShowVisit(false)}><X /></button></div>
            <div className="lib-form-grid">
              <label>Tanggal *<input type="date" required value={visitForm.visit_date} onChange={(event) => setVisitForm({ ...visitForm, visit_date: event.target.value })} /></label>
              <label>Nama pengunjung *<input required value={visitForm.visitor_name} onChange={(event) => setVisitForm({ ...visitForm, visitor_name: event.target.value })} /></label>
              <label>Jenis pengunjung<select value={visitForm.visitor_type} onChange={(event) => setVisitForm({ ...visitForm, visitor_type: event.target.value })}><option value="siswa">Siswa</option><option value="guru">Guru</option><option value="tendik">Tenaga Kependidikan</option><option value="umum">Umum</option></select></label>
              <label>Tujuan<input value={visitForm.purpose} onChange={(event) => setVisitForm({ ...visitForm, purpose: event.target.value })} /></label>
            </div>
            <button className="lib-primary lib-submit">Simpan kunjungan</button>
          </form>
        </div>
      )}
    </div>
  );
}
