import { useEffect, useMemo, useState } from "react";
import {
  createHomeVisitCollaboration,
  createHomeroomFollowup,
  createTeacherAppreciation,
  createTeacherReferral,
  listHomeVisitCollaborations,
  listHomeroomAkpdSummary,
  listHomeroomAttendanceSummary,
  listHomeroomFollowups,
  listHomeroomSchedules,
  listStudentSupportSchedules,
  listTeacherAppreciations,
  listTeacherReferrals,
  updateHomeVisitCollaboration,
  updateTeacherReferral,
  type HomeroomAkpdSummary,
  type HomeroomAttendanceSummary,
  type HomeroomFollowupRow,
  type HomeVisitCollaborationRow,
  type SafeSupportSchedule,
  type TeacherAppreciationRow,
  type TeacherReferralRow,
  type TeacherReferralStatus,
} from "../services/teacherBkService";
import { listConsultations, listHomeVisits } from "../services/bkWorkflowService";
import type { ConsultationRow, HomeVisitRow, StudentOption, UserRole } from "../types";

export type TeacherWorkspaceTab =
  | "Rujukan & Observasi Siswa"
  | "Apresiasi & Perilaku Positif"
  | "Pemantauan Kelas Perwalian"
  | "Catatan Pembinaan Wali Kelas"
  | "Jadwal & Kunjungan"
  | "Ringkasan AKPD Kelas"
  | "Rujukan Masuk"
  | "Jadwal & Tindak Lanjut Saya";

type Props = {
  tab: TeacherWorkspaceTab;
  role: UserRole;
  students: StudentOption[];
  homeroomClassIds: string[];
  onOpenProfile: (student: StudentOption) => void;
  onOpenParentLetter?: (student: StudentOption, context: string) => void;
  onPendingReferralCountChange?: (count: number) => void;
};

const REFERRAL_STATUSES: TeacherReferralStatus[] = [
  "Menunggu Tinjauan",
  "Diproses BK",
  "Jadwal Konsultasi Dibuat",
  "Selesai",
];
const CATEGORIES = ["Akademik", "Kehadiran", "Perilaku/Kedisiplinan", "Sosial-Emosional"];
const PRIORITIES = ["Rendah", "Sedang", "Tinggi"];
const APPRECIATION_CATEGORIES = ["Kedisiplinan", "Empati", "Keaktifan", "Prestasi Sikap"];

function formatDate(value: string | null | undefined) {
  if (!value) return "Belum dijadwalkan";
  const parsed = new Date(`${value.slice(0, 10)}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString("id-ID");
}

function StudentPicker({
  students,
  value,
  onChange,
  label = "Cari siswa",
}: {
  students: StudentOption[];
  value: string;
  onChange: (studentId: string) => void;
  label?: string;
}) {
  const [search, setSearch] = useState("");
  const visibleStudents = students.filter(student =>
    `${student.full_name} ${student.nisn} ${student.class_name}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()),
  );
  const selected = students.find(student => student.id === value);
  return <div className="kb-teacher-student-picker">
    <label>{label}
      <input
        value={search || (selected ? `${selected.full_name} · ${selected.nisn} · ${selected.class_name}` : "")}
        onChange={event => {
          setSearch(event.target.value);
          if (value) onChange("");
        }}
        placeholder="Nama, NISN, atau kelas"
      />
    </label>
    {!value && search.trim() && <label>Pilih hasil
      <select value="" onChange={event => {
        onChange(event.target.value);
        setSearch("");
      }}>
        <option value="">Pilih siswa...</option>
        {visibleStudents.slice(0, 30).map(student => <option key={student.id} value={student.id}>
          {student.full_name} · {student.nisn} · {student.class_name || "Belum ada kelas"}
        </option>)}
      </select>
    </label>}
  </div>;
}

export default function TeacherBkWorkspace({
  tab,
  role,
  students,
  homeroomClassIds,
  onOpenProfile,
  onOpenParentLetter,
  onPendingReferralCountChange,
}: Props) {
  const isTeacher = role === "guru";
  const isCounselor = role === "guru_bk" || role === "super_admin";
  const isStudent = role === "siswa";
  const homeroomStudents = useMemo(
    () => students.filter(student => student.class_id && homeroomClassIds.includes(student.class_id)),
    [homeroomClassIds, students],
  );
  const studentById = useMemo(() => new Map(students.map(student => [student.id, student])), [students]);
  const [referrals, setReferrals] = useState<TeacherReferralRow[]>([]);
  const [appreciations, setAppreciations] = useState<TeacherAppreciationRow[]>([]);
  const [attendance, setAttendance] = useState<HomeroomAttendanceSummary[]>([]);
  const [followups, setFollowups] = useState<HomeroomFollowupRow[]>([]);
  const [schedules, setSchedules] = useState<SafeSupportSchedule[]>([]);
  const [akpdSummary, setAkpdSummary] = useState<HomeroomAkpdSummary[]>([]);
  const [collaborations, setCollaborations] = useState<HomeVisitCollaborationRow[]>([]);
  const [consultations, setConsultations] = useState<ConsultationRow[]>([]);
  const [homeVisits, setHomeVisits] = useState<HomeVisitRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [studentId, setStudentId] = useState("");
  const [referralCategory, setReferralCategory] = useState(CATEGORIES[0]);
  const [referralPriority, setReferralPriority] = useState("Sedang");
  const [referralDescription, setReferralDescription] = useState("");
  const [appreciationCategory, setAppreciationCategory] = useState(APPRECIATION_CATEGORIES[0]);
  const [appreciationNote, setAppreciationNote] = useState("");
  const [intervention, setIntervention] = useState("Teguran persuasif");
  const [followupNote, setFollowupNote] = useState("");
  const [followupCategory, setFollowupCategory] = useState("Kehadiran");
  const [followupPriority, setFollowupPriority] = useState("Sedang");
  const [escalate, setEscalate] = useState(false);
  const [visitDate, setVisitDate] = useState("");
  const [visitContext, setVisitContext] = useState("");
  const [drafts, setDrafts] = useState<Record<string, {
    status: TeacherReferralStatus;
    feedback: string;
    consultation_id: string;
    home_visit_id: string;
  }>>({});
  const [collaborationDrafts, setCollaborationDrafts] = useState<Record<string, {
    status: HomeVisitCollaborationRow["status"];
    response_note: string;
    home_visit_id: string;
  }>>({});

  async function reload() {
    setError("");
    setLoading(true);
    try {
      if (tab === "Rujukan & Observasi Siswa" || tab === "Rujukan Masuk") {
        const loaded = await listTeacherReferrals();
        setReferrals(loaded);
        if (tab === "Rujukan Masuk" && isCounselor) {
          onPendingReferralCountChange?.(loaded.filter(item => item.status === "Menunggu Tinjauan").length);
        }
        if (isCounselor) {
          const [loadedConsultations, loadedVisits, loadedCollaborations] = await Promise.all([
            listConsultations(),
            listHomeVisits(),
            listHomeVisitCollaborations(),
          ]);
          setConsultations(loadedConsultations);
          setHomeVisits(loadedVisits);
          setCollaborations(loadedCollaborations);
        }
      } else if (tab === "Apresiasi & Perilaku Positif") {
        setAppreciations(await listTeacherAppreciations(isStudent ? students.find(student => student.profile_id)?.id : undefined));
      } else if (tab === "Pemantauan Kelas Perwalian") {
        const [loadedAttendance, loadedFollowups] = await Promise.all([
          listHomeroomAttendanceSummary(),
          listHomeroomFollowups(),
        ]);
        setAttendance(loadedAttendance);
        setFollowups(loadedFollowups);
      } else if (tab === "Catatan Pembinaan Wali Kelas") {
        setFollowups(await listHomeroomFollowups());
      } else if (tab === "Jadwal & Kunjungan") {
        const [loadedSchedules, loadedCollaborations] = await Promise.all([
          listHomeroomSchedules(),
          listHomeVisitCollaborations(),
        ]);
        setSchedules(loadedSchedules);
        setCollaborations(loadedCollaborations);
      } else if (tab === "Ringkasan AKPD Kelas") {
        setAkpdSummary(await listHomeroomAkpdSummary());
      } else if (tab === "Jadwal & Tindak Lanjut Saya") {
        const [loadedSchedules, loadedAppreciations] = await Promise.all([
          listStudentSupportSchedules(),
          listTeacherAppreciations(students.find(student => student.profile_id)?.id),
        ]);
        setSchedules(loadedSchedules);
        setAppreciations(loadedAppreciations);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Data BK gagal dimuat.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timerId = window.setTimeout(() => { void reload(); }, 0);
    return () => window.clearTimeout(timerId);
  // The selected workspace tab determines which role-scoped data is loaded.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, tab, students]);

  async function runSave(action: () => Promise<void>, successMessage: string) {
    setError("");
    setNotice("");
    setSaving(true);
    try {
      await action();
      setNotice(successMessage);
      await reload();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Perubahan gagal disimpan.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <section className="kb-panel"><div className="kb-empty" role="status">Memuat layanan BK...</div></section>;

  if (tab === "Rujukan & Observasi Siswa" && isTeacher) {
    return <section className="kb-panel kb-teacher-workspace">
      <header className="kb-panel-heading"><div><span className="kb-eyebrow">RUJUKAN NON-RAHASIA</span><h2>Rujukan & Observasi Siswa</h2></div><span className="kb-pill">{referrals.length} rujukan saya</span></header>
      {error && <div className="kb-alert" role="alert">{error}</div>}{notice && <div className="kb-success" role="status">{notice}</div>}
      <form className="kb-teacher-form" onSubmit={event => {
        event.preventDefault();
        if (!studentId) { setError("Pilih siswa terlebih dahulu."); return; }
        if (!students.find(student => student.id === studentId)?.counselor_profile_id) {
          setError("Guru BK pengampu belum ditugaskan untuk siswa ini. Hubungi administrator sebelum mengirim rujukan.");
          return;
        }
        void runSave(async () => {
          await createTeacherReferral({
            studentId,
            category: referralCategory,
            priority: referralPriority,
            description: referralDescription,
          });
          setReferralDescription("");
        }, "Rujukan terkirim kepada Guru BK pengampu.");
      }}>
        <StudentPicker students={students} value={studentId} onChange={setStudentId} />
        <label>Kategori observasi<select value={referralCategory} onChange={event => setReferralCategory(event.target.value)}>
          {CATEGORIES.map(category => <option key={category}>{category}</option>)}
        </select></label>
        <label>Prioritas<select value={referralPriority} onChange={event => setReferralPriority(event.target.value)}>
          {PRIORITIES.map(priority => <option key={priority}>{priority}</option>)}
        </select></label>
        <label className="kb-teacher-form-wide">Deskripsi objektif kejadian / observasi
          <textarea required minLength={10} maxLength={4000} rows={4} value={referralDescription} onChange={event => setReferralDescription(event.target.value)} />
          <small>Gunakan fakta yang diamati, tanpa memasukkan isi curhat atau informasi privat.</small>
        </label>
        <button className="kb-primary" disabled={saving}>{saving ? "Mengirim..." : "Kirim Rujukan ke Guru BK"}</button>
      </form>
      <div className="kb-teacher-card-list">{referrals.map(referral => {
        const student = studentById.get(referral.student_id);
        return <article className="kb-teacher-card" key={referral.id}>
          <div className="kb-teacher-card-head">
            <div><strong>{student?.full_name ?? "Siswa"}</strong><small>{student?.class_name ?? "Kelas tidak tersedia"} · {referral.category} · Prioritas {referral.priority}</small></div>
            <span className="kb-teacher-status">{referral.status}</span>
          </div>
          <p>{referral.description}</p>
          <div className="kb-teacher-feedback"><strong>Umpan balik Guru BK</strong><p>{referral.non_confidential_feedback || "Belum ada umpan balik."}</p></div>
        </article>;
      })}{!referrals.length && <div className="kb-empty">Belum ada rujukan yang dikirim.</div>}</div>
    </section>;
  }

  if (tab === "Apresiasi & Perilaku Positif") {
    return <section className="kb-panel kb-teacher-workspace">
      <header className="kb-panel-heading"><div><span className="kb-eyebrow">KEKUATAN SISWA</span><h2>Apresiasi & Perilaku Positif</h2></div></header>
      {error && <div className="kb-alert" role="alert">{error}</div>}{notice && <div className="kb-success" role="status">{notice}</div>}
      {isTeacher && <form className="kb-teacher-form" onSubmit={event => {
        event.preventDefault();
        if (!studentId) { setError("Pilih siswa terlebih dahulu."); return; }
        void runSave(async () => {
          await createTeacherAppreciation({ studentId, category: appreciationCategory, note: appreciationNote });
          setAppreciationNote("");
        }, "Apresiasi tersimpan dan dapat dilihat siswa, Wali Kelas, serta Guru BK.");
      }}>
        <StudentPicker students={students} value={studentId} onChange={setStudentId} />
        <label>Kategori apresiasi<select value={appreciationCategory} onChange={event => setAppreciationCategory(event.target.value)}>
          {APPRECIATION_CATEGORIES.map(category => <option key={category}>{category}</option>)}
        </select></label>
        <label className="kb-teacher-form-wide">Catatan positif<textarea required minLength={5} maxLength={1500} rows={3} value={appreciationNote} onChange={event => setAppreciationNote(event.target.value)} /></label>
        <button className="kb-primary" disabled={saving}>{saving ? "Menyimpan..." : "Simpan Apresiasi"}</button>
      </form>}
      <div className="kb-teacher-card-list">{appreciations.map(item => {
        const student = studentById.get(item.student_id);
        return <article className="kb-teacher-card" key={item.id}>
          <div className="kb-teacher-card-head"><div><strong>{isStudent ? item.category : student?.full_name ?? "Siswa"}</strong><small>{item.category} · {formatDate(item.created_at)}</small></div></div>
          <p>{item.note}</p>
        </article>;
      })}{!appreciations.length && <div className="kb-empty">Belum ada catatan apresiasi.</div>}</div>
    </section>;
  }

  if (tab === "Pemantauan Kelas Perwalian" && isTeacher) {
    return <section className="kb-panel kb-teacher-workspace">
      <header className="kb-panel-heading"><div><span className="kb-eyebrow">EARLY WARNING</span><h2>Pemantauan Kelas Perwalian</h2></div><span className="kb-pill">{homeroomStudents.length} siswa</span></header>
      {error && <div className="kb-alert" role="alert">{error}</div>}{notice && <div className="kb-success" role="status">{notice}</div>}
      <div className="kb-table-wrap"><table className="kb-table"><thead><tr>
        <th>Siswa</th><th>Sakit</th><th>Izin</th><th>Alpa</th><th>Terlambat</th><th>Peringatan dini</th><th>Tindak lanjut BK</th><th>Aksi</th>
      </tr></thead><tbody>{attendance.map(row => {
        const student = studentById.get(row.student_id);
        const summaryStudent = student ?? {
          id: row.student_id, nisn: row.nisn, full_name: row.full_name, status: "Active",
          birth_date: null, gender: null, class_id: row.class_id, class_name: row.class_name,
          homeroom_teacher_name: null, academic_year_id: null, academic_year: null,
          counselor_profile_id: null, counselor_name: null,
        } satisfies StudentOption;
        const existingFollowup = followups.find(item => item.student_id === row.student_id);
        return <tr key={row.student_id}>
          <td><button className="kb-link-button" type="button" onClick={() => onOpenProfile(summaryStudent)}>{row.full_name}</button><small>{row.class_name} · {row.nisn}</small></td>
          <td>{row.sakit_count}</td><td>{row.izin_count}</td><td>{row.alpa_count}</td><td>{row.terlambat_count}</td>
          <td><span className={`kb-teacher-status${row.early_warning !== "Stabil" ? " warning" : ""}`}>{row.early_warning}</span></td>
          <td>{row.latest_referral_status ?? "Belum dirujuk"}</td>
          <td className="kb-teacher-actions">
            <button className="kb-mini" type="button" onClick={() => onOpenProfile(summaryStudent)}>Profil</button>
            <button className="kb-mini" type="button" onClick={() => {
              const context = existingFollowup
                ? `${existingFollowup.intervention}: ${existingFollowup.note}`
                : "Eskalasi awal wali kelas dari pemantauan kelas perwalian.";
              void runSave(async () => {
                await createHomeroomFollowup({
                  studentId: row.student_id,
                  intervention: existingFollowup?.intervention ?? "Eskalasi dari pemantauan kelas",
                  note: context,
                  category: "Kehadiran",
                  priority: "Sedang",
                  escalate: true,
                });
              }, "Konteks pembinaan dan ringkasan absensi diteruskan ke Guru BK.");
            }} disabled={saving || !student?.counselor_profile_id}>Rujuk ke Guru BK</button>
            {onOpenParentLetter && <button className="kb-mini" type="button" onClick={() => onOpenParentLetter(summaryStudent, `Surat panggilan/pembinaan orang tua untuk ${row.full_name}.`)}>Surat Panggilan</button>}
          </td>
        </tr>;
      })}{!attendance.length && <tr><td colSpan={8} className="kb-empty">Tidak ada siswa pada kelas perwalian Anda.</td></tr>}</tbody></table></div>
    </section>;
  }

  if (tab === "Catatan Pembinaan Wali Kelas" && isTeacher) {
    return <section className="kb-panel kb-teacher-workspace">
      <header className="kb-panel-heading"><div><span className="kb-eyebrow">TINDAK LANJUT AWAL</span><h2>Catatan Pembinaan Wali Kelas & Eskalasi ke BK</h2></div></header>
      {error && <div className="kb-alert" role="alert">{error}</div>}{notice && <div className="kb-success" role="status">{notice}</div>}
      <form className="kb-teacher-form" onSubmit={event => {
        event.preventDefault();
        if (!studentId) { setError("Pilih siswa terlebih dahulu."); return; }
        if (escalate && !homeroomStudents.find(student => student.id === studentId)?.counselor_profile_id) {
          setError("Guru BK pengampu belum ditugaskan untuk siswa ini. Pembinaan dapat disimpan tanpa eskalasi.");
          return;
        }
        void runSave(async () => {
          await createHomeroomFollowup({
            studentId,
            intervention,
            note: followupNote,
            category: followupCategory,
            priority: followupPriority,
            escalate,
          });
          setFollowupNote("");
          setEscalate(false);
        }, escalate ? "Catatan dan ringkasan absensi diteruskan kepada Guru BK." : "Catatan pembinaan wali kelas tersimpan.");
      }}>
        <StudentPicker students={homeroomStudents} value={studentId} onChange={setStudentId} />
        <label>Jenis pembinaan<select value={intervention} onChange={event => setIntervention(event.target.value)}>
          <option>Teguran persuasif</option><option>Komunikasi awal dengan orang tua/wali</option><option>Diskusi individual</option><option>Dukungan akademik</option><option>Lainnya</option>
        </select></label>
        <label>Kategori rujukan bila dieskalasi<select value={followupCategory} onChange={event => setFollowupCategory(event.target.value)}>
          {CATEGORIES.map(category => <option key={category}>{category}</option>)}
        </select></label>
        <label>Prioritas rujukan<select value={followupPriority} onChange={event => setFollowupPriority(event.target.value)}>
          {PRIORITIES.map(priority => <option key={priority}>{priority}</option>)}
        </select></label>
        <label className="kb-teacher-form-wide">Catatan pembinaan<textarea required minLength={5} maxLength={3000} rows={4} value={followupNote} onChange={event => setFollowupNote(event.target.value)} /></label>
        <label className="kb-checkbox-label kb-teacher-toggle">
          <input type="checkbox" checked={escalate} onChange={event => setEscalate(event.target.checked)} />
          <span><strong>Rujuk ke Guru BK</strong><small>Sertakan ringkasan agregat kehadiran 30 hari terakhir. Isi privat tidak disertakan.</small></span>
        </label>
        <button className="kb-primary" disabled={saving}>{saving ? "Menyimpan..." : escalate ? "Simpan & Rujuk ke Guru BK" : "Simpan Pembinaan"}</button>
      </form>
      <div className="kb-teacher-card-list">{followups.map(item => <article className="kb-teacher-card" key={item.id}>
        <div className="kb-teacher-card-head"><div><strong>{studentById.get(item.student_id)?.full_name ?? "Siswa"}</strong><small>{item.intervention} · {formatDate(item.created_at)}</small></div><span className="kb-teacher-status">{item.outcome}</span></div>
        <p>{item.note}</p>
      </article>)}{!followups.length && <div className="kb-empty">Belum ada catatan pembinaan tersimpan.</div>}</div>
    </section>;
  }

  if (tab === "Jadwal & Kunjungan" && isTeacher) {
    return <section className="kb-panel kb-teacher-workspace">
      <header className="kb-panel-heading"><div><span className="kb-eyebrow">KOLABORASI AMAN</span><h2>Sinkronisasi Jadwal & Kunjungan Rumah</h2></div></header>
      {error && <div className="kb-alert" role="alert">{error}</div>}{notice && <div className="kb-success" role="status">{notice}</div>}
      <form className="kb-teacher-form" onSubmit={event => {
        event.preventDefault();
        if (!studentId) { setError("Pilih siswa terlebih dahulu."); return; }
        if (!homeroomStudents.find(student => student.id === studentId)?.counselor_profile_id) {
          setError("Guru BK pengampu belum ditugaskan untuk siswa ini. Hubungi administrator sebelum mengajukan kolaborasi.");
          return;
        }
        void runSave(async () => {
          await createHomeVisitCollaboration({ studentId, requestedDate: visitDate || null, context: visitContext });
          setVisitContext("");
        }, "Usulan kolaborasi kunjungan rumah terkirim kepada Guru BK.");
      }}>
        <StudentPicker students={homeroomStudents} value={studentId} onChange={setStudentId} />
        <label>Usulan tanggal (opsional)<input type="date" value={visitDate} onChange={event => setVisitDate(event.target.value)} /></label>
        <label className="kb-teacher-form-wide">Konteks kolaborasi<textarea required minLength={5} maxLength={2000} rows={3} value={visitContext} onChange={event => setVisitContext(event.target.value)} /></label>
        <button className="kb-primary" disabled={saving}>Ajukan Kolaborasi Kunjungan Rumah</button>
      </form>
      <div className="kb-teacher-section"><h3>Jadwal aman kelas perwalian</h3>
        <div className="kb-teacher-card-list">{schedules.map((schedule, index) => <article className="kb-teacher-card" key={`${schedule.student_id}-${schedule.event_type}-${schedule.event_date}-${index}`}>
          <div className="kb-teacher-card-head"><div><strong>{schedule.student_name}</strong><small>{schedule.class_name} · {schedule.event_type}</small></div><span className="kb-teacher-status">{schedule.status}</span></div>
          <p>{formatDate(schedule.event_date)}{schedule.event_time ? ` · ${schedule.event_time}` : ""}</p>
        </article>)}{!schedules.length && <div className="kb-empty">Belum ada jadwal atau usulan kolaborasi yang disetujui.</div>}</div>
      </div>
      <div className="kb-teacher-section"><h3>Status usulan kunjungan rumah</h3>
        <div className="kb-teacher-card-list">{collaborations.map(item => <article className="kb-teacher-card" key={item.id}>
          <div className="kb-teacher-card-head"><div><strong>{studentById.get(item.student_id)?.full_name ?? "Siswa"}</strong><small>{item.requested_date ? formatDate(item.requested_date) : "Tanggal fleksibel"}</small></div><span className="kb-teacher-status">{item.status}</span></div>
          <p>{item.context}</p><small>{item.response_note || "Menunggu tanggapan Guru BK."}</small>
        </article>)}{!collaborations.length && <div className="kb-empty">Belum ada usulan yang dikirim.</div>}</div>
      </div>
    </section>;
  }

  if (tab === "Ringkasan AKPD Kelas" && isTeacher) {
    return <section className="kb-panel kb-teacher-workspace">
      <header className="kb-panel-heading"><div><span className="kb-eyebrow">AGREGAT TANPA IDENTITAS</span><h2>Ringkasan Kebutuhan Kelas (AKPD)</h2></div></header>
      <p className="kb-teacher-privacy">Hanya persentase dan jumlah agregat yang ditampilkan. Jawaban individu siswa tidak tersedia di akun Wali Kelas.</p>
      {error && <div className="kb-alert" role="alert">{error}</div>}
      <div className="kb-teacher-summary-grid">{akpdSummary.map(item => <article className="kb-teacher-summary" key={item.area}>
        <small>{item.area}</small><strong>{item.percentage ?? 0}%</strong>
        <span>{item.need_count} dari {item.answered_count} jawaban · {item.respondent_count} responden</span>
      </article>)}</div>
      {!akpdSummary.length && <div className="kb-empty">Belum ada jawaban agregat untuk kelas perwalian.</div>}
    </section>;
  }

  if (tab === "Rujukan Masuk" && isCounselor) {
    return <section className="kb-panel kb-teacher-workspace">
      <header className="kb-panel-heading"><div><span className="kb-eyebrow">TINJAUAN GURU BK</span><h2>Rujukan & Observasi Masuk</h2></div><span className="kb-pill">{referrals.filter(item => item.status === "Menunggu Tinjauan").length} baru</span></header>
      {error && <div className="kb-alert" role="alert">{error}</div>}{notice && <div className="kb-success" role="status">{notice}</div>}
      <div className="kb-teacher-card-list">{referrals.map(referral => {
        const student = studentById.get(referral.student_id);
        const draft = drafts[referral.id] ?? {
          status: referral.status,
          feedback: referral.non_confidential_feedback,
          consultation_id: referral.consultation_id ?? "",
          home_visit_id: referral.home_visit_id ?? "",
        };
        const studentConsultations = consultations.filter(item => item.student_id === referral.student_id);
        const studentVisits = homeVisits.filter(item => item.student_id === referral.student_id);
        return <article className="kb-teacher-card" key={referral.id}>
          <div className="kb-teacher-card-head"><div><strong>{student?.full_name ?? "Siswa"}</strong><small>{student?.class_name ?? "Kelas tidak tersedia"} · {referral.category} · Prioritas {referral.priority}</small></div>
            <span className="kb-teacher-status">{referral.status}</span></div>
          <p>{referral.description}</p>
          <label>Status progres<select value={draft.status} onChange={event => setDrafts(current => ({
            ...current,
            [referral.id]: { ...draft, status: event.target.value as TeacherReferralStatus },
          }))}>{REFERRAL_STATUSES.map(status => <option key={status}>{status}</option>)}</select></label>
          <label>Umpan balik non-rahasia / strategi di kelas<textarea rows={3} maxLength={4000} value={draft.feedback} onChange={event => setDrafts(current => ({
            ...current,
            [referral.id]: { ...draft, feedback: event.target.value },
          }))} /></label>
          <div className="kb-teacher-form-row">
            <label>Tautkan jadwal konsultasi<select value={draft.consultation_id} onChange={event => setDrafts(current => ({
              ...current, [referral.id]: { ...draft, consultation_id: event.target.value, status: event.target.value ? "Jadwal Konsultasi Dibuat" : draft.status },
            }))}>
              <option value="">Belum ditautkan</option>{studentConsultations.map(item => <option key={item.id} value={item.id}>
                {formatDate(item.scheduled_date)}{item.start_time ? ` · ${item.start_time}` : ""} · {item.status}
              </option>)}
            </select></label>
            <label>Tautkan kunjungan rumah<select value={draft.home_visit_id} onChange={event => setDrafts(current => ({
              ...current, [referral.id]: { ...draft, home_visit_id: event.target.value },
            }))}>
              <option value="">Belum ditautkan</option>{studentVisits.map(item => <option key={item.id} value={item.id}>
                {formatDate(item.visit_date)}{item.visit_time ? ` · ${item.visit_time}` : ""}
              </option>)}
            </select></label>
          </div>
          <div className="kb-actions">
            <button className="kb-mini" type="button" onClick={() => student && onOpenProfile(student)}>Buka profil</button>
            <button className="kb-primary" type="button" disabled={saving} onClick={() => void runSave(async () => {
              await updateTeacherReferral(referral.id, {
                status: draft.status,
                non_confidential_feedback: draft.feedback,
                consultation_id: draft.consultation_id || null,
                home_visit_id: draft.home_visit_id || null,
              });
              setDrafts(current => { const next = { ...current }; delete next[referral.id]; return next; });
            }, "Status dan umpan balik rujukan diperbarui.")}>Simpan Tindak Lanjut</button>
          </div>
        </article>;
      })}{!referrals.length && <div className="kb-empty">Belum ada rujukan dari Guru atau Wali Kelas.</div>}</div>
      <div className="kb-teacher-section"><h3>Usulan kolaborasi kunjungan rumah</h3>
        <div className="kb-teacher-card-list">{collaborations.map(item => {
          const draft = collaborationDrafts[item.id] ?? {
            status: item.status,
            response_note: item.response_note,
            home_visit_id: item.home_visit_id ?? "",
          };
          const studentVisits = homeVisits.filter(visit => visit.student_id === item.student_id);
          return <article className="kb-teacher-card" key={item.id}>
            <div className="kb-teacher-card-head"><div><strong>{studentById.get(item.student_id)?.full_name ?? "Siswa"}</strong><small>{item.requested_date ? formatDate(item.requested_date) : "Tanggal fleksibel"}</small></div><span className="kb-teacher-status">{item.status}</span></div>
            <p>{item.context}</p>
            <div className="kb-teacher-form-row">
              <label>Status<select value={draft.status} onChange={event => setCollaborationDrafts(current => ({
                ...current, [item.id]: { ...draft, status: event.target.value as HomeVisitCollaborationRow["status"] },
              }))}><option>Menunggu BK</option><option>Disetujui</option><option>Ditolak</option></select></label>
              <label>Tautkan jadwal kunjungan<select value={draft.home_visit_id} onChange={event => setCollaborationDrafts(current => ({
                ...current, [item.id]: { ...draft, home_visit_id: event.target.value },
              }))}><option value="">Belum ditautkan</option>{studentVisits.map(visit => <option key={visit.id} value={visit.id}>{formatDate(visit.visit_date)}{visit.visit_time ? ` · ${visit.visit_time}` : ""}</option>)}</select></label>
            </div>
            <label>Umpan balik aman untuk Wali Kelas<textarea rows={2} maxLength={1000} value={draft.response_note} onChange={event => setCollaborationDrafts(current => ({
              ...current, [item.id]: { ...draft, response_note: event.target.value },
            }))} /></label>
            <button className="kb-primary" type="button" disabled={saving} onClick={() => void runSave(async () => {
              await updateHomeVisitCollaboration(item.id, {
                status: draft.status,
                response_note: draft.response_note,
                home_visit_id: draft.home_visit_id || null,
              });
              setCollaborationDrafts(current => { const next = { ...current }; delete next[item.id]; return next; });
            }, "Usulan kolaborasi diperbarui.")}>Simpan Kolaborasi</button>
          </article>;
        })}{!collaborations.length && <div className="kb-empty">Tidak ada usulan kunjungan rumah untuk ditinjau.</div>}</div>
      </div>
    </section>;
  }

  if (tab === "Jadwal & Tindak Lanjut Saya" && isStudent) {
    return <section className="kb-panel kb-teacher-workspace">
      <header className="kb-panel-heading"><div><span className="kb-eyebrow">DUKUNGAN UNTUK ANDA</span><h2>Jadwal & Tindak Lanjut Saya</h2></div></header>
      {error && <div className="kb-alert" role="alert">{error}</div>}
      <p className="kb-teacher-privacy">Jadwal ditampilkan tanpa isi curhat atau catatan konseling privat.</p>
      <div className="kb-teacher-card-list">{schedules.map((schedule, index) => <article className="kb-teacher-card" key={`${schedule.event_type}-${schedule.event_date}-${index}`}>
        <div className="kb-teacher-card-head"><div><strong>{schedule.event_type}</strong><small>{formatDate(schedule.event_date)}{schedule.event_time ? ` · ${schedule.event_time}` : ""}</small></div><span className="kb-teacher-status">{schedule.status}</span></div>
      </article>)}{!schedules.length && <div className="kb-empty">Belum ada jadwal tindak lanjut.</div>}</div>
      <div className="kb-teacher-section"><h3>Apresiasi untuk Anda</h3>
        <div className="kb-teacher-card-list">{appreciations.map(item => <article className="kb-teacher-card" key={item.id}>
          <div className="kb-teacher-card-head"><strong>{item.category}</strong><small>{formatDate(item.created_at)}</small></div><p>{item.note}</p>
        </article>)}{!appreciations.length && <div className="kb-empty">Belum ada catatan apresiasi.</div>}</div>
      </div>
    </section>;
  }

  return <section className="kb-panel"><div className="kb-empty">Bagian layanan ini tidak tersedia untuk peran akun tersebut.</div></section>;
}
