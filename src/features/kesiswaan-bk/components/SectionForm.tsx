import type { Dispatch, FormEvent, SetStateAction } from "react";
import type { AcademicYearOption, ClassOption, FieldDefinition, SectionConfig, SectionFormValue, StudentOption } from "../types";

type Props = {
  config: SectionConfig;
  form: SectionFormValue;
  students: StudentOption[];
  classes: ClassOption[];
  academicYears: AcademicYearOption[];
  academicYearId: string;
  semester: string;
  editing: boolean;
  busy: boolean;
  error: string;
  onFormChange: Dispatch<SetStateAction<SectionFormValue>>;
  onAcademicYearChange: (value: string) => void;
  onSemesterChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onReset: () => void;
};

function studentLabel(student: StudentOption) {
  return `${student.full_name} · ${student.nisn}${student.class_name ? ` · ${student.class_name}` : ""}`;
}

function StudentField({
  field,
  form,
  students,
  required,
  onChange,
}: {
  field: FieldDefinition;
  form: SectionFormValue;
  students: StudentOption[];
  required: boolean;
  onChange: (key: string, value: string) => void;
}) {
  const student = students.find(item => item.id === form[field.key]);
  const searchKey = `${field.key}_search`;
  const options = students.filter(item => item.status.toLowerCase() === "active");
  return (
    <>
      <input
        list="kb-student-options"
        required={required}
        value={form[searchKey] ?? (student ? studentLabel(student) : "")}
        onChange={event => {
          const value = event.target.value;
          const selected = options.find(item => studentLabel(item) === value);
          onChange(searchKey, value);
          onChange(field.key, selected?.id ?? "");
        }}
        placeholder="Cari nama atau NISN siswa..."
      />
      <datalist id="kb-student-options">
        {options.map(item => <option key={item.id} value={studentLabel(item)} />)}
      </datalist>
    </>
  );
}

export default function SectionForm({
  config,
  form,
  students,
  classes,
  academicYears,
  academicYearId,
  semester,
  editing,
  busy,
  error,
  onFormChange,
  onAcademicYearChange,
  onSemesterChange,
  onSubmit,
  onReset,
}: Props) {
  function updateField(key: string, value: string) {
    onFormChange(current => ({ ...current, [key]: value }));
  }

  return (
    <section className="kb-panel">
      <div className="kb-panel-heading">
        <div><span className="kb-eyebrow">MANAJEMEN DATA</span><h2>{editing ? "Ubah data" : `Tambah ${config.key}`}</h2></div>
        <span className="kb-pill">{config.key}</span>
      </div>
      {error && <div className="kb-alert" role="alert">{error}</div>}
      <form onSubmit={onSubmit} className="kb-form">
        {config.fields.filter(field => {
          if (field.key === "student_id" && config.key === "Catatan BK") return !form.target_type || form.target_type === "Siswa";
          if (field.key === "class_id" && config.key === "Catatan BK") return form.target_type === "Kelas";
          return true;
        }).map(field => {
          const required = field.required
            || (config.key === "Catatan BK" && field.key === "student_id" && form.target_type === "Siswa")
            || (config.key === "Catatan BK" && field.key === "class_id" && form.target_type === "Kelas");
          return (
          <label key={field.key}>
            <span className="kb-label-caption">{field.label}{required && <b className="kb-required-mark" aria-hidden="true">*</b>}</span>
            {field.kind === "student" ? (
              <StudentField field={field} form={form} students={students} required={required} onChange={updateField} />
            ) : field.kind === "class" ? (
              <select required={required} value={form[field.key] ?? ""} onChange={event => updateField(field.key, event.target.value)}>
                <option value="">Pilih kelas...</option>
                {classes.map(classOption => (
                  <option key={classOption.id} value={classOption.id}>{classOption.name}</option>
                ))}
              </select>
            ) : field.kind === "select" ? (
              <select required={field.required} value={form[field.key] ?? ""} onChange={event => {
                if (field.key === "target_type") {
                  onFormChange(current => ({
                    ...current,
                    target_type: event.target.value,
                    student_id: "",
                    student_id_search: "",
                    class_id: "",
                  }));
                } else {
                  updateField(field.key, event.target.value);
                }
              }}>
                <option value="">Pilih {field.label.toLowerCase()}...</option>
                {field.options?.map(option => <option key={option} value={option}>{option}</option>)}
              </select>
            ) : field.kind === "textarea" ? (
              <textarea required={field.required} rows={3} value={form[field.key] ?? ""} onChange={event => updateField(field.key, event.target.value)} />
            ) : (
              <>
              <input
                type={field.kind === "date" ? "date" : field.kind === "time" ? "time" : "text"}
                required={field.required}
                value={form[field.key] ?? ""}
                onChange={event => updateField(field.key, event.target.value)}
              />
              {field.kind === "date" && form[field.key] && (
                <small className="kb-date-weekday">
                  {new Date(`${form[field.key]}T00:00:00`).toLocaleDateString("id-ID", { weekday: "long" })}
                </small>
              )}
              </>
            )}
          </label>
          );
        })}
        <div className="kb-form-filters">
          <label>Tahun ajaran
            <select value={academicYearId} onChange={event => onAcademicYearChange(event.target.value)}>
              <option value="">Semua tahun ajaran</option>
              {academicYears.map(year => <option key={year.id} value={year.id}>{year.name}{year.is_active ? " · Aktif" : ""}</option>)}
            </select>
          </label>
          <label>Semester
            <select value={semester} onChange={event => onSemesterChange(event.target.value)}>
              <option value="">Semua semester</option><option value="1">Semester 1</option><option value="2">Semester 2</option>
            </select>
          </label>
        </div>
        <div className="kb-actions">
          <button className="kb-primary" type="submit" disabled={busy}>{busy ? "Menyimpan..." : editing ? "Simpan perubahan" : "＋ Simpan data"}</button>
          <button className="kb-secondary" type="button" onClick={onReset} disabled={busy}>Reset</button>
        </div>
      </form>
    </section>
  );
}
