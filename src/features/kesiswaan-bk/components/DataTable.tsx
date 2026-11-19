import { PAGE_SIZE } from "../constants";
import { SchoolLetterheadPreview } from "../../../components/shared/SchoolLetterheadPicker";
import type { AcademicYearOption, ClassOption, KbRow, QueryFilters, SchoolHeader, SectionConfig, StudentOption } from "../types";
import ReportActions from "./ReportActions";

type Props = {
  config: SectionConfig;
  rows: KbRow[];
  students: StudentOption[];
  classes: ClassOption[];
  academicYears: AcademicYearOption[];
  schoolHeader: SchoolHeader;
  filters: QueryFilters;
  count: number;
  page: number;
  loading: boolean;
  onFiltersChange: (filters: Partial<QueryFilters>) => void;
  onPageChange: (page: number) => void;
  onEdit: (row: KbRow) => void;
  onDelete: (row: KbRow) => void;
  onFollowUp: (row: KbRow, kind: "note" | "consultation") => void;
  onCreateParentLetter: (student: StudentOption, context: string) => void;
  canCreateParentLetter: boolean;
  onOpenProfile: (student: StudentOption) => void;
  onExport: () => void;
  onExportExcel: () => void;
  onPrint: () => void;
};

function displayValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}

export default function DataTable({
  config,
  rows,
  students,
  classes,
  academicYears,
  schoolHeader,
  filters,
  count,
  page,
  loading,
  onFiltersChange,
  onPageChange,
  onEdit,
  onDelete,
  onFollowUp,
  onCreateParentLetter,
  canCreateParentLetter,
  onOpenProfile,
  onExport,
  onExportExcel,
  onPrint,
}: Props) {
  const studentById = new Map(students.map(student => [student.id, student]));

  function linkedStudent(row: KbRow) {
    if (typeof row.student_id === "string") return studentById.get(row.student_id);
    const legacyName = String(row.nama_siswa ?? "");
    const matches = students.filter(student => student.full_name.toLowerCase() === legacyName.toLowerCase());
    return matches.length === 1 ? matches[0] : undefined;
  }

  return (
    <section className="kb-panel kb-data-panel">
      <header className="kb-print-header">
        <SchoolLetterheadPreview letterhead={schoolHeader} />
        <h2>{config.key === "Catatan BK" ? "Agenda Harian Bimbingan dan Konseling" : `Laporan ${config.key}`}</h2>
      </header>
      <div className="kb-panel-heading">
        <div><span className="kb-eyebrow">DAFTAR TERCATAT</span><h2>Data {config.key}</h2></div>
        <input
          className="kb-search"
          value={filters.search}
          onChange={event => onFiltersChange({ search: event.target.value })}
          placeholder="Cari data..."
          aria-label={`Cari data ${config.key}`}
        />
      </div>
      <div className="kb-query-filters">
        <label>Tahun ajaran
          <select value={filters.academicYearId} onChange={event => onFiltersChange({ academicYearId: event.target.value })}>
            <option value="">Semua tahun</option>
            {academicYears.map(year => <option key={year.id} value={year.id}>{year.name}</option>)}
          </select>
        </label>
        <label>Semester
          <select value={filters.semester} onChange={event => onFiltersChange({ semester: event.target.value })}>
            <option value="">Semua semester</option><option value="1">Semester 1</option><option value="2">Semester 2</option>
          </select>
        </label>
        {config.fields.some(field => field.key === "student_id") && (
          <label>Kelas
            <select value={filters.classId} onChange={event => onFiltersChange({ classId: event.target.value })}>
              <option value="">Semua kelas</option>
              {classes.map(classOption => <option key={classOption.id} value={classOption.id}>{classOption.name}</option>)}
            </select>
          </label>
        )}
        {config.dateField && <>
          <label>Dari tanggal<input type="date" value={filters.dateFrom} onChange={event => onFiltersChange({ dateFrom: event.target.value })} /></label>
          <label>Sampai tanggal<input type="date" value={filters.dateTo} onChange={event => onFiltersChange({ dateTo: event.target.value })} /></label>
        </>}
        <ReportActions onExportCsv={onExport} onExportExcel={onExportExcel} onPrint={onPrint} disabled={loading} />
      </div>
      {loading ? <p className="kb-loading">Memuat data...</p> : rows.length === 0 ? (
        <div className="kb-empty">Belum ada data atau tidak ditemukan.</div>
      ) : (
        <div className="kb-table-wrap">
          <table className="kb-table">
            <thead><tr>{config.fields.map(field => <th key={field.key}>{field.label}</th>)}<th className="kb-action-head">Aksi</th></tr></thead>
            <tbody>{rows.map((row, index) => {
              const student = linkedStudent(row);
              const isReferral = config.key === "Rujukan BK";
              const hasFollowUp = Boolean(student && (
                (config.key === "Catatan BK" && String(row.tindak_lanjut ?? "").trim() && row.status_kasus !== "Selesai")
                || (isReferral && row.status !== "Selesai")
              ));
              return (
                <tr key={row.id} style={{ animationDelay: `${Math.min(index * 35, 280)}ms` }}>
                  {config.fields.map(field => {
                    if (field.key === "student_id") {
                      return <td key={field.key} data-label={field.label}>
                        {student
                          ? <><button className="kb-student-link" type="button" onClick={() => onOpenProfile(student)}>{student.full_name}</button>{student.class_name && <small className="kb-student-class">{student.class_name}</small>}</>
                          : displayValue(row.nama_siswa)}
                      </td>;
                    }
                    const value = field.key === "class_id"
                      ? classes.find(item => item.id === row.class_id)?.name ?? ""
                      : row[field.key];
                    return <td key={field.key} data-label={field.label}>{displayValue(value)}</td>;
                  })}
                  <td className="kb-action-cell">
                    <details className="kb-row-actions">
                      <summary>Aksi</summary>
                      <div>
                        {hasFollowUp && <button className="kb-mini" type="button" onClick={() => onFollowUp(row, isReferral ? "note" : "consultation")}>
                          {isReferral ? "Catat tindak lanjut" : "Jadwalkan konsultasi"}
                        </button>}
                        {student && canCreateParentLetter && (config.key === "Catatan BK" || isReferral) && <button className="kb-mini" type="button" onClick={() => onCreateParentLetter(
                          student,
                          "Undangan pertemuan dengan orang tua/wali untuk tindak lanjut layanan BK.",
                        )}>Buat surat panggilan</button>}
                        <button className="kb-mini" type="button" onClick={() => onEdit(row)}>Ubah</button>
                        <button className="kb-mini danger" type="button" onClick={() => onDelete(row)}>Hapus</button>
                      </div>
                    </details>
                  </td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
      )}
      <div className="kb-pagination">
        <span>Halaman {page + 1} · {count} rekaman</span>
        <div>
          <button className="kb-secondary" type="button" disabled={page === 0 || loading} onClick={() => onPageChange(page - 1)}>Sebelumnya</button>
          <button className="kb-secondary" type="button" disabled={(page + 1) * PAGE_SIZE >= count || loading} onClick={() => onPageChange(page + 1)}>Berikutnya</button>
        </div>
      </div>
      <div className="kb-signatures document-signature-block">
        <p>Mengetahui,<br />Kepala Sekolah</p><p>Guru Bimbingan dan Konseling</p>
        <div /><div /><span>(........................................)</span><span>(........................................)</span>
      </div>
    </section>
  );
}
