import { useEffect, useState } from "react";
import { BellRing, BookOpen, KeyRound, UserRound } from "lucide-react";
import type { SchoolUser } from "./context/school-context";
import { supabase } from "./lib/supabase";
import "./AccountSettings.css";

type AccountSettingsProps = {
  currentUser: SchoolUser;
  onReopenAnnouncements: () => void;
};

type TeacherAssignment = {
  subject: string;
  class_name: string;
};

const roleLabels: Record<string, string> = {
  super_admin: "Super Admin",
  operator: "Operator",
  kepala_sekolah: "Kepala Sekolah",
  kepala_tata_usaha: "Kepala Tata Usaha",
  staff_tata_usaha: "Staff Tata Usaha",
  guru: "Guru",
  guru_bk: "Guru BK",
  tendik: "Tenaga Kependidikan",
  bendahara: "Bendahara",
  siswa: "Siswa",
};

export default function AccountSettings({
  currentUser,
  onReopenAnnouncements,
}: AccountSettingsProps) {
  const [homeroomClasses, setHomeroomClasses] = useState<string[]>([]);
  const [subjects, setSubjects] = useState<TeacherAssignment[]>([]);
  const [identityError, setIdentityError] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState("");

  useEffect(() => {
    if (!currentUser.teacher_id) return;
    let active = true;

    const loadTeacherLinks = async () => {
      try {
        const [homeroomResult, assignmentResult] = await Promise.all([
          supabase
            .from("classes")
            .select("name")
            .eq("homeroom_teacher_id", currentUser.id),
          currentUser.role === "guru"
            ? supabase.rpc("get_my_attendance_subject_assignments")
            : Promise.resolve({ data: [], error: null }),
        ]);
        if (homeroomResult.error) throw homeroomResult.error;
        if (assignmentResult.error) throw assignmentResult.error;
        if (!active) return;

        setHomeroomClasses((homeroomResult.data ?? []).map((row) => row.name));
        const rows: unknown = assignmentResult.data;
        if (Array.isArray(rows)) {
          setSubjects(rows.flatMap((row): TeacherAssignment[] => {
            if (!row || typeof row !== "object") return [];
            const assignment = row as Record<string, unknown>;
            return typeof assignment.subject === "string" && typeof assignment.class_name === "string"
              ? [{ subject: assignment.subject, class_name: assignment.class_name }]
              : [];
          }));
        }
      } catch (error) {
        console.error("Tautan Data Induk untuk pengaturan akun gagal dimuat:", error);
        if (active) {
          setIdentityError(error instanceof Error
            ? error.message
            : "Informasi Data Induk belum dapat dimuat.");
        }
      }
    };

    void loadTeacherLinks();
    return () => {
      active = false;
    };
  }, [currentUser.id, currentUser.role, currentUser.teacher_id]);

  const updatePassword = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPasswordMessage("");
    if (newPassword.length < 12) {
      setPasswordMessage("Kata sandi harus memiliki minimal 12 karakter.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordMessage("Konfirmasi kata sandi belum sama.");
      return;
    }

    setPasswordBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setNewPassword("");
      setConfirmPassword("");
      setPasswordMessage("Kata sandi berhasil diperbarui.");
    } catch (error) {
      console.error("Pembaruan kata sandi akun gagal:", error);
      setPasswordMessage(error instanceof Error
        ? `Kata sandi gagal diperbarui: ${error.message}`
        : "Kata sandi gagal diperbarui.");
    } finally {
      setPasswordBusy(false);
    }
  };

  const identityRows = [
    { label: "Nama lengkap", value: currentUser.full_name || currentUser.username },
    { label: "Username", value: currentUser.username },
    { label: "NIP / NISN", value: currentUser.nip_or_nisn || "Belum tertaut" },
    { label: "Role aktif", value: roleLabels[currentUser.role] ?? currentUser.role },
    ...(currentUser.class_name ? [{ label: "Kelas", value: currentUser.class_name }] : []),
    ...(homeroomClasses.length
      ? [{ label: "Kelas perwalian", value: homeroomClasses.join(", ") }]
      : []),
    ...(subjects.length
      ? [{ label: "Mata pelajaran", value: [...new Set(subjects.map(({ subject }) => subject))].join(", ") }]
      : []),
  ];

  return (
    <section className="account-settings-page">
      <header className="account-settings-header">
        <span className="account-settings-kicker">PREFERENSI PENGGUNA</span>
        <h1>Pengaturan Akun Saya</h1>
        <p>Kelola keamanan akun dan periksa tautan data pribadi di Data Induk.</p>
      </header>

      <div className="account-settings-grid">
        <section className="account-settings-card">
          <div className="account-settings-card-title">
            <span><UserRound size={18} /></span>
            <div><h2>Identitas & Data Induk</h2><p>Informasi ini hanya dapat diperbarui oleh operator.</p></div>
          </div>
          <dl className="account-identity-list">
            {identityRows.map((row) => (
              <div key={row.label}>
                <dt>{row.label}</dt>
                <dd>{row.value}</dd>
              </div>
            ))}
          </dl>
          {currentUser.role === "siswa" && !currentUser.class_name && (
            <p className="account-settings-note">Informasi kelas belum tertaut pada Data Induk.</p>
          )}
          {currentUser.teacher_id && subjects.length > 0 && (
            <div className="account-subject-list">
              <BookOpen size={15} />
              {subjects.map(({ subject, class_name }) => (
                <span key={`${subject}-${class_name}`}>{subject} · {class_name}</span>
              ))}
            </div>
          )}
          {identityError && <p className="account-settings-error" role="status">{identityError}</p>}
        </section>

        <section className="account-settings-card">
          <div className="account-settings-card-title">
            <span><KeyRound size={18} /></span>
            <div><h2>Ubah Kata Sandi</h2><p>Gunakan minimal 12 karakter dan jangan gunakan sandi akun lain.</p></div>
          </div>
          <form className="account-password-form" onSubmit={(event) => void updatePassword(event)}>
            <label>
              Kata sandi baru
              <input
                type="password"
                autoComplete="new-password"
                minLength={12}
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                required
              />
            </label>
            <label>
              Konfirmasi kata sandi baru
              <input
                type="password"
                autoComplete="new-password"
                minLength={12}
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                required
              />
            </label>
            <button type="submit" disabled={passwordBusy}>
              {passwordBusy ? "Menyimpan..." : "Simpan kata sandi"}
            </button>
            {passwordMessage && <p role="status">{passwordMessage}</p>}
          </form>
        </section>

        <section className="account-settings-card account-preferences-card">
          <div className="account-settings-card-title">
            <span><BellRing size={18} /></span>
            <div><h2>Preferensi & Sesi</h2><p>Pengumuman aktif tampil sekali setiap login.</p></div>
          </div>
          <button type="button" className="account-announcement-button" onClick={onReopenAnnouncements}>
            Lihat ulang pengumuman aktif
          </button>
          <p className="account-settings-note">
            Sesi otomatis keluar setelah aplikasi tidak terlihat selama 2 menit. Saat aplikasi aktif,
            batas ini tidak berjalan.
          </p>
          <p className="account-settings-note">
            Perlu memperbarui data induk? Hubungi operator sekolah melalui Tata Usaha.
          </p>
        </section>
      </div>
    </section>
  );
}
