import { useEffect, useState } from "react";
import { searchClasses, type ClassOption } from "../../services/masterDataService";

type ClassPickerProps = {
  value: string;
  onChange: (classId: string, selected: ClassOption | null) => void;
  options?: ClassOption[];
  className?: string;
  disabled?: boolean;
  required?: boolean;
};

export default function ClassPicker({
  value,
  onChange,
  options,
  className,
  disabled = false,
  required = false,
}: ClassPickerProps) {
  const [remoteOptions, setRemoteOptions] = useState<ClassOption[]>([]);
  const [error, setError] = useState("");
  const loadedOptions = options ?? remoteOptions;

  useEffect(() => {
    if (options) return;

    let active = true;
    void searchClasses()
      .then((result) => {
        if (active) setRemoteOptions(result);
      })
      .catch((loadError: unknown) => {
        if (!active) return;
        setError(loadError instanceof Error
          ? loadError.message
          : "Daftar kelas gagal dimuat.");
      });

    return () => {
      active = false;
    };
  }, [options]);

  return (
    <>
      <select
        className={className}
        value={value}
        disabled={disabled}
        required={required}
        onChange={(event) => {
          const classId = event.target.value;
          onChange(
            classId,
            loadedOptions.find((item) => item.id === classId) ?? null,
          );
        }}
      >
        {!required && <option value="">Pilih kelas</option>}
        {loadedOptions.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name}
          </option>
        ))}
      </select>
      {error && <span role="alert">{error}</span>}
    </>
  );
}
