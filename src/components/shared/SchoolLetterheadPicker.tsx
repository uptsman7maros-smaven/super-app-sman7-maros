import type { SchoolLetterhead, SchoolSettings, LetterheadSlot } from "../../services/masterDataService";
import { hasAlternateSchoolLetterhead } from "../../services/masterDataService";
import "./SchoolLetterheadPicker.css";

type SettingsForLetterhead = Pick<
  SchoolSettings,
  "school_name" | "npsn" | "logo_url" | "letterhead" | "logo_url_2" | "letterhead_2"
>;

export function SchoolLetterheadPicker({
  settings,
  value,
  onChange,
}: {
  settings: SettingsForLetterhead | null;
  value: LetterheadSlot;
  onChange: (value: LetterheadSlot) => void;
}) {
  const alternateAvailable = hasAlternateSchoolLetterhead(settings);
  return (
    <label className="school-letterhead-picker">
      <span>Kop surat untuk dokumen</span>
      <select
        aria-label="Pilih kop surat untuk dokumen"
        value={value}
        onChange={event => onChange(event.target.value === "2" ? "2" : "1")}
      >
        <option value="1">Kop Surat 1 · Utama</option>
        <option value="2" disabled={!alternateAvailable}>
          {alternateAvailable ? "Kop Surat 2 · Alternatif" : "Kop Surat 2 · Belum diatur"}
        </option>
      </select>
    </label>
  );
}

export function SchoolLetterheadPreview({
  letterhead,
  compact = false,
}: {
  letterhead: SchoolLetterhead;
  compact?: boolean;
}) {
  return (
    <div className={`school-letterhead-preview${compact ? " compact" : ""}${letterhead.logo_url ? "" : " no-logo"}`}>
      {letterhead.logo_url && <img src={letterhead.logo_url} alt="" onError={event => { event.currentTarget.hidden = true; }} />}
      <div className="school-letterhead-copy">
        <h2>{letterhead.school_name || "SMAN 7 Maros"}</h2>
        {letterhead.letterhead && <p>{letterhead.letterhead}</p>}
        {letterhead.npsn && <small>NPSN {letterhead.npsn}</small>}
      </div>
      <span className="school-letterhead-rules" aria-hidden="true" />
    </div>
  );
}

export type { LetterheadSlot };
