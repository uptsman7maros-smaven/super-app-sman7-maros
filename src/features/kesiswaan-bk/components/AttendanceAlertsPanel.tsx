import type { AttendanceBkAlert, StudentOption } from "../types";

type Props = {
  alerts: AttendanceBkAlert[];
  students: StudentOption[];
  loading: boolean;
  error: string;
  onMarkRead: (alert: AttendanceBkAlert) => void;
  onFollowUp: (alert: AttendanceBkAlert, kind: "note" | "schedule") => void;
  onOpenProfile: (student: StudentOption) => void;
};

export default function AttendanceAlertsPanel({
  alerts,
  students,
  loading,
  error,
  onMarkRead,
  onFollowUp,
  onOpenProfile,
}: Props) {
  const studentById = new Map(students.map(student => [student.id, student]));
  return (
    <section className="kb-panel">
      <div className="kb-panel-heading">
        <div><span className="kb-eyebrow">PEMANTAUAN HARIAN</span><h2>Peringatan absensi siswa</h2></div>
      </div>
      <p className="kb-attendance-alert-intro">
        Peringatan absensi disandingkan dengan perizinan pada tanggal yang sama. Data izin tetap perlu diverifikasi oleh Guru BK.
      </p>
      {error && <div className="kb-alert" role="alert">{error}</div>}
      {loading ? <p className="kb-loading">Memuat peringatan...</p> : alerts.length === 0 ? (
        <div className="kb-empty">Belum ada peringatan absensi untuk akun ini.</div>
      ) : (
        <div className="kb-attendance-alert-list">
          {alerts.map(alert => {
            const student = studentById.get(alert.student_id);
            return (
              <article className={`kb-attendance-alert${alert.is_read ? " is-read" : ""}`} key={alert.id}>
                <div className="kb-attendance-alert-copy">
                  <span>{new Date(`${alert.attendance_date}T00:00:00`).toLocaleDateString("id-ID", {
                    weekday: "long", day: "2-digit", month: "long", year: "numeric",
                  })}</span>
                  <h3>{student
                    ? <button className="kb-student-link" type="button" onClick={() => onOpenProfile(student)}>{alert.student_name}</button>
                    : alert.student_name}</h3>
                  <small>{alert.student_identifier}{alert.class_name ? ` · Kelas ${alert.class_name}` : ""}</small>
                  <p>{alert.body}</p>
                  {alert.has_permission && <span className="kb-permission-badge">Sudah Ada Izin · perlu verifikasi</span>}
                </div>
                <div className="kb-alert-actions">
                  <details className="kb-row-actions kb-alert-follow-up">
                    <summary>Tindak lanjut</summary>
                    <div>
                      <button className="kb-mini" type="button" onClick={() => onFollowUp(alert, "note")}>Catat ke Agenda BK</button>
                      <button className="kb-mini" type="button" onClick={() => onFollowUp(alert, "schedule")}>Jadwalkan konsultasi</button>
                    </div>
                  </details>
                  {alert.is_read
                    ? <span className="kb-alert-read">Sudah dibaca</span>
                    : <button className="kb-mini" type="button" onClick={() => onMarkRead(alert)}>Tandai dibaca</button>}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
