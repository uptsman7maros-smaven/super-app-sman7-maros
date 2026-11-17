import { useEffect, useId, useState } from "react";
import {
  searchStudents,
  searchTeachers,
  type PersonOption,
} from "../../services/masterDataService";

type PersonPickerProps = {
  value: PersonOption | null;
  onChange: (person: PersonOption | null) => void;
  personType?: "student" | "teacher" | "any";
  className?: string;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
};

function optionLabel(person: PersonOption) {
  const className = person.class_name ? ` · ${person.class_name}` : "";
  return `${person.full_name} · ${person.identifier}${className}`;
}

export default function PersonPicker({
  value,
  onChange,
  personType = "any",
  className,
  placeholder = "Cari nama atau nomor identitas",
  disabled = false,
  required = false,
}: PersonPickerProps) {
  const listId = useId();
  const [draft, setDraft] = useState<{ selectedId: string | null; query: string }>({
    selectedId: null,
    query: "",
  });
  const [options, setOptions] = useState<PersonOption[]>([]);
  const [error, setError] = useState("");
  const selectedId = value?.id ?? null;
  const inputValue = draft.selectedId === selectedId
    ? draft.query
    : value
      ? optionLabel(value)
      : "";

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(async () => {
      setError("");
      try {
        const results = personType === "student"
          ? await searchStudents(inputValue)
          : personType === "teacher"
            ? await searchTeachers(inputValue)
            : (await Promise.all([
              searchStudents(inputValue),
              searchTeachers(inputValue),
            ])).flat();
        if (active) setOptions(results);
      } catch (loadError) {
        if (!active) return;
        setOptions([]);
        setError(loadError instanceof Error
          ? loadError.message
          : "Daftar warga sekolah gagal dimuat.");
      }
    }, 180);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [inputValue, personType]);

  function updateValue(nextValue: string, input: HTMLInputElement) {
    setDraft({ selectedId, query: nextValue });
    const selected = options.find((person) => optionLabel(person) === nextValue);
    if (selected) {
      input.setCustomValidity("");
      onChange(selected);
    } else if (nextValue === "") {
      input.setCustomValidity("");
      onChange(null);
    } else {
      input.setCustomValidity("Pilih warga sekolah dari daftar hasil pencarian.");
    }
  }

  return (
    <>
      <input
        className={className}
        type="search"
        list={listId}
        value={inputValue}
        placeholder={placeholder}
        disabled={disabled}
        required={required}
        onChange={(event) => updateValue(event.target.value, event.target)}
        aria-describedby={error ? `${listId}-error` : undefined}
        autoComplete="off"
      />
      <datalist id={listId}>
        {options.map((person) => (
          <option key={`${person.type}:${person.id}`} value={optionLabel(person)} />
        ))}
      </datalist>
      {error && <span id={`${listId}-error`} role="alert">{error}</span>}
    </>
  );
}
