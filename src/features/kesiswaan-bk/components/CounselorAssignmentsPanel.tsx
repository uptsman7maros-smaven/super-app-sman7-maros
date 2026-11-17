import { useMemo, useState } from "react";
import type { AssignmentStudent, CounselorOption, StudentOption } from "../types";

type Props = {
  students: AssignmentStudent[];
  counselors: CounselorOption[];
  loading: boolean;
  savingStudentId: string | null;
  error: string;
  notice: string;
  onSave: (studentId: string, counselorId: string) => void;
  onOpenProfile: (student: StudentOption) => void;
};

export default function CounselorAssignmentsPanel({
  students,
  counselors,
  loading,
  savingStudentId,
  error,
  notice,
  onSave,
  onOpenProfile,
}: Props) {
  const [search, setSearch] = useState("");
  const [choices, setChoices] = useState<Record<string, string>>({});
  const filteredStudents = useMemo(() => students.filter(student =>
    `${student.full_name} ${student.nisn} ${student.class_name}`.toLowerCase().includes(search.toLowerCase()),
  ), [search, students]);

  return (
    <section className="kb-panel">
      <div className="kb-panel-heading">
        <div><span className="kb-eyebrow">PENANGGUNG JAWAB SISWA</span><h2>Penugasan Guru BK</h2></div>
        <input className="kb-search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Cari nama, NISN, kelas..." />
      </div>
      <p className="kb-attendance-alert-intro">Setiap siswa memiliki Guru BK penanggung jawab untuk antrean alert dan akses catatan sesuai penugasan.</p>
      {error && <div className="kb-alert" role="alert">{error}</div>}
      {notice && <div className="kb-success" role="status">{notice}</div>}
      {counselors.length === 0 && !loading && <div className="kb-alert">Belum ada akun Guru BK aktif.</div>}
      {loading ? <p className="kb-loading">Memuat siswa dan penugasan...</p> : (
        <div className="kb-table-wrap">
          <table className="kb-table kb-assignment-table">
            <thead><tr><th>Siswa</th><th>Kelas</th><th>Guru BK</th><th>Aksi</th></tr></thead>
            <tbody>
              {filteredStudents.map(student => {
                const choice = choices[student.id] ?? student.counselor_profile_id ?? "";
                return (
                  <tr key={student.id}>
                    <td data-label="Siswa">
                      <button className="kb-student-link" type="button" onClick={() => onOpenProfile(student)}>{student.full_name}</button>
                      <small>{student.nisn}</small>
                    </td>
                    <td data-label="Kelas">{student.class_name || "—"}</td>
                    <td data-label="Guru BK">
                      <select value={choice} onChange={event => setChoices(current => ({ ...current, [student.id]: event.target.value }))}>
                        <option value="">Belum ditugaskan</option>
                        {counselors.map(counselor => <option key={counselor.id} value={counselor.id}>{counselor.name}</option>)}
                      </select>
                    </td>
                    <td className="kb-action-cell" data-label="Aksi"><div>
                      <button
                        className="kb-mini"
                        type="button"
                        disabled={savingStudentId === student.id || choice === (student.counselor_profile_id ?? "")}
                        onClick={() => onSave(student.id, choice)}
                      >{savingStudentId === student.id ? "Menyimpan..." : "Simpan"}</button>
                    </div></td>
                  </tr>
                );
              })}
              {filteredStudents.length === 0 && <tr><td colSpan={4} className="kb-empty">Siswa tidak ditemukan.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
