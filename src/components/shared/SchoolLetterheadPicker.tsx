import { useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent, SyntheticEvent } from "react";
import { Building2, Check, ChevronDown, Landmark } from "lucide-react";
import type { SchoolLetterhead, LetterheadSlot } from "../../services/masterDataService";
import "./SchoolLetterheadPicker.css";

export function SchoolLetterheadPicker({
  value,
  onChange,
}: {
  value: LetterheadSlot;
  onChange: (value: LetterheadSlot) => void;
}) {
  const [open, setOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const pickerId = useId();
  const labelId = `${pickerId}-label`;
  const menuId = `${pickerId}-menu`;
  const activeOption = value === "2" ? 1 : 0;
  const options = [
    {
      value: "1" as const,
      label: "Kop Surat 1",
      variant: "Utama",
      description: "Logo provinsi di atas nama sekolah",
      Icon: Landmark,
    },
    {
      value: "2" as const,
      label: "Kop Surat 2",
      variant: "Alternatif",
      description: "Logo provinsi dan sekolah di sisi kiri-kanan",
      Icon: Building2,
    },
  ];

  useEffect(() => {
    if (!open) return;

    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!pickerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    optionRefs.current[activeOption]?.focus();

    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, [activeOption, open]);

  const handleMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const currentIndex = optionRefs.current.findIndex(option => option === document.activeElement);
    let nextIndex: number | null = null;

    if (event.key === "ArrowDown") nextIndex = (currentIndex + 1) % options.length;
    if (event.key === "ArrowUp") nextIndex = (currentIndex - 1 + options.length) % options.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = options.length - 1;

    if (nextIndex !== null) {
      event.preventDefault();
      optionRefs.current[nextIndex]?.focus();
    } else if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    }
  };

  return (
    <div className="school-letterhead-picker" ref={pickerRef}>
      <span className="school-letterhead-picker-label" id={labelId}>Kop surat untuk dokumen</span>
      <button
        ref={triggerRef}
        type="button"
        className={`school-letterhead-trigger${open ? " is-open" : ""}`}
        aria-label={`Kop surat untuk dokumen: ${options[activeOption].label}, ${options[activeOption].variant}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen(current => !current)}
        onKeyDown={event => {
          if (event.key === "ArrowDown" && !open) {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        <span className="school-letterhead-trigger-icon" aria-hidden="true">
          {value === "2" ? <Building2 size={17} /> : <Landmark size={17} />}
        </span>
        <span className="school-letterhead-trigger-copy">
          <strong>{options[activeOption].label}</strong>
          <small>{options[activeOption].variant}</small>
        </span>
        <ChevronDown className="school-letterhead-trigger-chevron" size={16} aria-hidden="true" />
      </button>
      {open && (
        <div
          className="school-letterhead-menu"
          id={menuId}
          role="menu"
          aria-labelledby={labelId}
          onKeyDown={handleMenuKeyDown}
        >
          <span className="school-letterhead-menu-heading">PILIH FORMAT KOP SURAT</span>
          {options.map((option, index) => {
            const isSelected = option.value === value;
            const Icon = option.Icon;

            return (
              <button
                key={option.value}
                ref={element => { optionRefs.current[index] = element; }}
                type="button"
                className={`school-letterhead-option${isSelected ? " is-selected" : ""}`}
                role="menuitemradio"
                aria-checked={isSelected}
                tabIndex={-1}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                  triggerRef.current?.focus();
                }}
              >
                <span className="school-letterhead-option-icon" aria-hidden="true">
                  <Icon size={18} />
                </span>
                <span className="school-letterhead-option-copy">
                  <span className="school-letterhead-option-title">
                    <strong>{option.label}</strong>
                    <small>{option.variant}</small>
                  </span>
                  <small>{option.description}</small>
                </span>
                <Check className="school-letterhead-option-check" size={17} aria-hidden="true" />
              </button>
            );
          })}
        </div>
      )}
    </div>
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
