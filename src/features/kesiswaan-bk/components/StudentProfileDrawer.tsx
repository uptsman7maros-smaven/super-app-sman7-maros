import { useEffect, useState } from "react";
import { loadStudentProfile } from "../services/kesiswaanBkService";
import type { StudentOption, StudentProfile, UserRole } from "../types";

type Props = {
  studentId: string | null;
  role: UserRole;
  scope: "kesiswaan" | "bimbingan-konseling";
  canCreateParentLetter?: boolean;
  onClose: () => void;
  onCreateNote: (student: StudentOption) => void;
  onScheduleConsultation: (student: StudentOption) => void;
  onCreateParentLetter: (student: StudentOption) => void;
};

function Rows({ title, rows, columns }: { title: string; rows: readonly object[]; columns: string[] }) {
  return (
    <section className="kb-profile-section">
      <h3>{title} <span>{rows.length}</span></h3>
      {rows.length === 0 ? <p className="kb-profile-empty">Belum ada data.</p> : rows.map((row, index) => {
        const record = row as Record<string, unknown>;
        return <article className="kb-profile-row" key={String(record.id ?? index)}>
          {columns.map(column => record[column] ? <p key={column}><strong>{column.replaceAll("_", " ")}:</strong> {String(record[column])}</p> : null)}
        </article>;
      })}
    </section>
  );
}

export default function StudentProfileDrawer({
  studentId,
  role,
  scope,
  canCreateParentLetter = false,
  onClose,
  onCreateNote,
  onScheduleConsultation,
  onCreateParentLetter,
}: Props) {
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!studentId) return;
    let active = true;
    void loadStudentProfile(studentId, role, scope).then(result => {
      if (active) setProfile(result);
    }).catch(loadError => {
      if (active) setError(loadError instanceof Error ? loadError.message : "Profil siswa gagal dimuat.");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [role, scope, studentId]);

  if (!studentId) return null;
  return (
    <div className="kb-drawer-backdrop" role="presentation" onMouseDown={event => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <aside className="kb-profile-drawer" role="dialog" aria-modal="true" aria-labelledby="kb-profile-title">
        <header className="kb-profile-header">
          <div><span className="kb-eyebrow">PROFIL TERPADU SISWA</span><h2 id="kb-profile-title">{profile?.student.full_name ?? "Profil siswa"}</h2></div>
          <button type="button" className="kb-secondary" onClick={onClose}>Tutup</button>
        </header>
        {loading && <p className="kb-loading">Memuat rekam jejak siswa...</p>}
        {error && <div className="kb-alert" role="alert">{error}</div>}
        {profile && <>
          <section className="kb-profile-identity">
            <p><strong>NISN</strong><span>{profile.student.nisn || "—"}</span></p>
            <p><strong>Kelas</strong><span>{profile.student.class_name || "—"}</span></p>
            <p><strong>Wali kelas</strong><span>{profile.student.homeroom_teacher_name || "Belum ditentukan"}</span></p>
            <p><strong>Guru BK</strong><span>{profile.counselorName || "Belum ditugaskan"}</span></p>
            <p><strong>Status</strong><span>{profile.student.status || "—"}</span></p>
            <p><strong>Jenis kelamin</strong><span>{profile.student.gender || "—"}</span></p>
            <p><strong>Tanggal lahir</strong><span>{profile.student.birth_date || "—"}</span></p>
          </section>
          {scope === "bimbingan-konseling" && (role === "guru_bk" || role === "super_admin") && (
            <div className="kb-profile-summary">
              <span>{profile.alerts.length} alert absensi</span>
              <span>{profile.attendance.length} rekaman kehadiran</span>
              <span>{profile.counselingNotes.length} catatan BK</span>
            </div>
          )}
          {scope === "bimbingan-konseling" && (role === "guru_bk" || role === "super_admin") && (
            <div className="kb-profile-actions">
              <details className="kb-row-actions">
                <summary>Tindak lanjut</summary>
                <div>
                  <button className="kb-mini" type="button" onClick={() => onCreateNote(profile.student)}>Catat layanan BK</button>
                  <button className="kb-mini" type="button" onClick={() => onScheduleConsultation(profile.student)}>Jadwalkan konsultasi</button>
                  <button className="kb-mini" type="button" onClick={() => onCreateParentLetter(profile.student)}>Buat surat panggilan</button>
                </div>
              </details>
            </div>
          )}
          {canCreateParentLetter && <div className="kb-profile-actions">
            <button className="kb-primary" type="button" onClick={() => onCreateParentLetter(profile.student)}>
              Buat Surat Panggilan / Pembinaan Orang Tua
            </button>
          </div>}
          {scope === "kesiswaan" ? <>
            <Rows title="Prestasi" rows={profile.achievements} columns={["nama_prestasi", "tingkat", "tanggal"]} />
            <Rows title="Ekstrakurikuler" rows={profile.extracurriculars} columns={["nama_ekskul", "jadwal", "lokasi"]} />
            <Rows title="OSIS & kegiatan" rows={profile.organizations} columns={["nama_kegiatan", "organisasi", "tanggal"]} />
            <Rows title="Perizinan" rows={profile.permissions} columns={["tanggal", "alasan", "status_tindak_lanjut"]} />
          </> : <>
            {profile.safeAttendanceSummary && <section className="kb-profile-section">
              <h3>Ringkasan kehadiran perwalian <span>30 hari</span></h3>
              <div className="kb-profile-summary">
                <span>Sakit {String(profile.safeAttendanceSummary.sakit_count ?? 0)}</span>
                <span>Izin {String(profile.safeAttendanceSummary.izin_count ?? 0)}</span>
                <span>Alpa {String(profile.safeAttendanceSummary.alpa_count ?? 0)}</span>
                <span>Terlambat {String(profile.safeAttendanceSummary.terlambat_count ?? 0)}</span>
                <span>{String(profile.safeAttendanceSummary.early_warning ?? "Stabil")}</span>
              </div>
            </section>}
            {(role === "guru_bk" || role === "super_admin") && <>
              <Rows title="Riwayat kehadiran" rows={profile.attendance} columns={["attendance_date", "session_type", "subject", "status"]} />
              <Rows title="Peringatan absensi" rows={profile.alerts} columns={["attendance_date", "title", "body"]} />
              <Rows title="Rujukan asesmen" rows={profile.referrals} columns={["referral_type", "subject_name", "summary", "status"]} />
              <Rows title="Rencana karir / studi" rows={profile.careerPlans} columns={["post_graduation_plan", "study_major", "interests", "notes"]} />
              <Rows title="Histori catatan BK (rahasia)" rows={profile.counselingNotes} columns={["tanggal", "bidang_layanan", "jenis_layanan", "prioritas", "status_kasus", "ringkasan", "tindak_lanjut"]} />
            </>}
            <Rows title="Rujukan non-rahasia" rows={profile.teacherReferrals} columns={["category", "status", "non_confidential_feedback"]} />
            <Rows title="Apresiasi & perilaku positif" rows={profile.appreciations} columns={["category", "note", "created_at"]} />
          </>}
        </>}
      </aside>
    </div>
  );
}
