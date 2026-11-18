import { useState } from "react";

type Props = {
  onExportCsv: () => void;
  onExportExcel: () => void;
  onPrint: () => void;
  disabled?: boolean;
};

export default function ReportActions({ onExportCsv, onExportExcel, onPrint, disabled = false }: Props) {
  const [format, setFormat] = useState<"xlsx" | "csv">("xlsx");

  return (
    <div className="kb-export-actions">
      <label className="kb-export-format">
        <span className="kb-sr-only">Format unduhan</span>
        <select value={format} onChange={event => setFormat(event.target.value as "xlsx" | "csv")} aria-label="Format unduhan">
          <option value="xlsx">Excel (.xlsx)</option>
          <option value="csv">CSV</option>
        </select>
      </label>
      <button className="kb-secondary" type="button" onClick={format === "xlsx" ? onExportExcel : onExportCsv} disabled={disabled}>
        Unduh laporan
      </button>
      <button className="kb-secondary" type="button" onClick={onPrint}>
        Cetak / PDF
      </button>
    </div>
  );
}
