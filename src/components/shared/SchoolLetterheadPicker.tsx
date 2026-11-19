import type { SyntheticEvent } from "react";
import type { SchoolLetterhead, LetterheadSlot } from "../../services/masterDataService";
import "./SchoolLetterheadPicker.css";

export function SchoolLetterheadPicker({
  value,
  onChange,
}: {
  value: LetterheadSlot;
  onChange: (value: LetterheadSlot) => void;
}) {
  return (
    <label className="school-letterhead-picker">
      <span>Kop surat untuk dokumen</span>
      <select
        aria-label="Pilih kop surat untuk dokumen"
        value={value}
        onChange={event => onChange(event.target.value === "2" ? "2" : "1")}
      >
        <option value="1">Kop Surat 1 · Utama</option>
        <option value="2">Kop Surat 2 · Alternatif</option>
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
  const logoError = (fallback: string) => (event: SyntheticEvent<HTMLImageElement>) => {
    const image = event.currentTarget;
    if (image.dataset.fallbackApplied) {
      image.hidden = true;
      return;
    }
    image.dataset.fallbackApplied = "true";
    image.src = fallback;
  };

  return (
    <div
      className={`school-letterhead-preview kop-${letterhead.layout}${compact ? " compact" : ""}`}
      role="group"
      aria-label={`Pratinjau Kop Surat ${letterhead.layout}`}
    >
      <div className="school-letterhead-body">
        <img
          className="school-letterhead-province-logo"
          src={letterhead.province_logo_url}
          alt=""
          onError={logoError("/logo-provinsi-sulsel.svg")}
        />
        <div className="school-letterhead-copy">
          <p className="school-letterhead-government">PEMERINTAH PROVINSI SULAWESI SELATAN</p>
          <p className="school-letterhead-department">DINAS PENDIDIKAN</p>
          <h2>{letterhead.school_name || "UPT SMA NEGERI 7 MAROS"}</h2>
          <p className="school-letterhead-address">{letterhead.letterhead}</p>
        </div>
        {letterhead.layout === "2" && (
          <img
            className="school-letterhead-school-logo"
            src={letterhead.school_logo_url}
            alt=""
            onError={logoError("/logo-sekolah.png")}
          />
        )}
      </div>
      <span className="school-letterhead-rules" aria-hidden="true" />
    </div>
  );
}

export type { LetterheadSlot };
