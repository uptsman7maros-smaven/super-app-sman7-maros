import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { CalendarDays, MapPin, RefreshCw, Save, School, Trash2 } from "lucide-react";
import {
  deleteSchoolHoliday,
  loadDataIndukSchoolPanelData,
  saveSchoolHoliday,
  updateSchoolProfile,
} from "./services/masterDataService";
import type {
  SchoolHoliday,
  SchoolHolidayInput,
  SchoolPanelSettings,
  SchoolProfileUpdate,
  SchoolSyncSummary,
} from "./services/masterDataService";
import "./DataIndukSekolahPanel.css";

type Props = { userRole: string };
type HolidayForm = {
  holiday_date: string;
  title: string;
  category: string;
  is_non_kbm: boolean;
};
type ProfileForm = {
  principal_name: string;
  principal_nip: string;
  latitude: string;
  longitude: string;
  geofence_radius_meters: string;
};

const emptyHoliday: HolidayForm = {
  holiday_date: new Date().toISOString().slice(0, 10),
  title: "",
  category: "Sekolah",
  is_non_kbm: true,
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function profileFormFrom(settings: SchoolPanelSettings | null): ProfileForm {
  return {
    principal_name: settings?.principal_name ?? "",
    principal_nip: settings?.principal_nip ?? "",
    latitude: settings?.latitude === null || settings?.latitude === undefined ? "" : String(settings.latitude),
    longitude: settings?.longitude === null || settings?.longitude === undefined ? "" : String(settings.longitude),
    geofence_radius_meters: String(settings?.geofence_radius_meters ?? 150),
  };
}

function Metric({ label, value, detail }: { label: string; value: number; detail?: string }) {
  return (
    <article className="di-school-metric">
      <span>{label}</span>
      <strong>{value.toLocaleString("id-ID")}</strong>
      {detail && <small>{detail}</small>}
    </article>
  );
}

function dateLabel(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default function DataIndukSekolahPanel({ userRole }: Props) {
  const canManage = userRole === "super_admin" || userRole === "operator";
  const [settings, setSettings] = useState<SchoolPanelSettings | null>(null);
  const [summary, setSummary] = useState<SchoolSyncSummary | null>(null);
  const [holidays, setHolidays] = useState<SchoolHoliday[]>([]);
  const [profileForm, setProfileForm] = useState<ProfileForm>(() => profileFormFrom(null));
  const [holidayForm, setHolidayForm] = useState<HolidayForm>(emptyHoliday);
  const [editingHolidayId, setEditingHolidayId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingHoliday, setSavingHoliday] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await loadDataIndukSchoolPanelData();
      setSettings(data.settings);
      setSummary(data.summary);
      setHolidays(data.holidays);
      setProfileForm(profileFormFrom(data.settings));
    } catch (loadError) {
      setError(`Gagal memuat Sekolah & Sinkron: ${errorMessage(loadError)}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const saveProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canManage || !settings) return;
    setError("");
    setNotice("");

    const latitude = profileForm.latitude.trim() ? Number(profileForm.latitude) : null;
    const longitude = profileForm.longitude.trim() ? Number(profileForm.longitude) : null;
    const radius = Number(profileForm.geofence_radius_meters);
    if ((latitude === null) !== (longitude === null)) {
      setError("Isi koordinat lintang dan bujur bersamaan, atau kosongkan keduanya.");
      return;
    }
    if (latitude !== null && (!Number.isFinite(latitude) || latitude < -90 || latitude > 90)) {
      setError("Lintang harus berupa angka antara -90 dan 90.");
      return;
    }
    if (longitude !== null && (!Number.isFinite(longitude) || longitude < -180 || longitude > 180)) {
      setError("Bujur harus berupa angka antara -180 dan 180.");
      return;
    }
    if (!Number.isInteger(radius) || radius <= 0) {
      setError("Radius geofence harus berupa bilangan bulat lebih besar dari 0 meter.");
      return;
    }

    const payload: SchoolProfileUpdate = {
      principal_name: profileForm.principal_name.trim() || null,
      principal_nip: profileForm.principal_nip.trim() || null,
      latitude,
      longitude,
      geofence_radius_meters: radius,
    };
    setSavingProfile(true);
    try {
      await updateSchoolProfile(settings.id, payload);
      await refresh();
      setNotice("Profil kepala sekolah dan lokasi geofence berhasil disimpan.");
    } catch (saveError) {
      setError(`Profil sekolah gagal disimpan: ${errorMessage(saveError)}`);
    } finally {
      setSavingProfile(false);
    }
  };

  const saveHoliday = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canManage) return;
    setError("");
    setNotice("");
    setSavingHoliday(true);
    const payload: SchoolHolidayInput = {
      ...holidayForm,
      title: holidayForm.title.trim(),
      category: holidayForm.category.trim() || "Sekolah",
    };
    try {
      await saveSchoolHoliday(payload, editingHolidayId ?? undefined);
      setHolidayForm(emptyHoliday);
      setEditingHolidayId(null);
      await refresh();
      setNotice(editingHolidayId ? "Agenda libur berhasil diperbarui." : "Agenda libur berhasil ditambahkan.");
    } catch (saveError) {
      setError(`Agenda libur gagal disimpan: ${errorMessage(saveError)}`);
    } finally {
      setSavingHoliday(false);
    }
  };

  const editHoliday = (holiday: SchoolHoliday) => {
    setEditingHolidayId(holiday.id);
    setHolidayForm({
      holiday_date: holiday.holiday_date,
      title: holiday.title,
      category: holiday.category,
      is_non_kbm: holiday.is_non_kbm,
    });
  };

  const removeHoliday = async (holiday: SchoolHoliday) => {
    if (!canManage || !window.confirm(`Hapus agenda "${holiday.title}"?`)) return;
    setError("");
    setNotice("");
    try {
      await deleteSchoolHoliday(holiday.id);
      await refresh();
      setNotice("Agenda libur berhasil dihapus.");
    } catch (deleteError) {
      setError(`Agenda libur gagal dihapus: ${errorMessage(deleteError)}`);
    }
  };

  return (
    <div className="di-school-panel">
      <div className="di-school-toolbar">
        <p>Profil sekolah, kalender non-KBM, dan keterhubungan data lintas modul.</p>
        <button type="button" className="di-school-button di-school-button-secondary" onClick={() => void refresh()} disabled={loading}>
          <RefreshCw size={15} aria-hidden="true" />
          {loading ? "Memuat..." : "Segarkan"}
        </button>
      </div>

      {error && <div className="di-school-alert is-error" role="alert">{error}</div>}
      {notice && <div className="di-school-alert is-success" role="status">{notice}</div>}

      <section className="di-school-section" aria-labelledby="di-school-sync-title">
        <div className="di-school-section-heading">
          <div className="di-school-section-icon"><RefreshCw size={18} aria-hidden="true" /></div>
          <div>
            <h4 id="di-school-sync-title">Monitor Sinkronisasi Satu Data</h4>
            <p>Ringkasan keterhubungan Data Induk, Akademik, dan Inventaris.</p>
          </div>
        </div>
        {loading && !summary ? (
          <p className="di-school-empty" role="status">Memuat ringkasan sinkronisasi...</p>
        ) : summary ? (
          <div className="di-school-sync-groups">
            <div className="di-school-sync-group">
              <h5>Data Induk</h5>
              <div className="di-school-metric-grid">
                <Metric label="Siswa" value={summary.students} />
                <Metric label="Guru & tendik" value={summary.teachers} />
                <Metric label="Kelas" value={summary.classes} />
              </div>
            </div>
            <div className="di-school-sync-group">
              <h5>Akademik</h5>
              <div className="di-school-metric-grid">
                <Metric label="Agenda / data" value={summary.academicRecords} />
                <Metric label="Penugasan mapel" value={summary.teacherSubjectAssignments} />
              </div>
            </div>
            <div className="di-school-sync-group">
              <h5>Inventaris</h5>
              <div className="di-school-metric-grid">
                <Metric label="Ruangan" value={summary.rooms} detail={`${summary.roomsLinkedToClasses} tertaut ke kelas`} />
                <Metric label="Aset" value={summary.assets} detail={`${summary.assetsLinkedToPlaces} tertaut ke ruangan`} />
                <Metric label="Peminjaman" value={summary.loans} />
              </div>
            </div>
          </div>
        ) : (
          <p className="di-school-empty">Ringkasan belum tersedia. Periksa pesan kesalahan di atas.</p>
        )}
      </section>

      <section className="di-school-section" aria-labelledby="di-school-profile-title">
        <div className="di-school-section-heading">
          <div className="di-school-section-icon"><School size={18} aria-hidden="true" /></div>
          <div>
            <h4 id="di-school-profile-title">Profil Sekolah & GPS Geofencing</h4>
            <p>Informasi sekolah menggunakan sumber kanonik <code>school_settings</code>.</p>
          </div>
        </div>
        {!settings ? (
          <p className="di-school-empty">Baris pengaturan sekolah belum tersedia. Profil belum dapat disimpan.</p>
        ) : (
          <form className="di-school-form" onSubmit={(event) => void saveProfile(event)}>
            <label>
              Nama sekolah
              <input value={settings.school_name} readOnly />
            </label>
            <label>
              NPSN
              <input value={settings.npsn} readOnly />
            </label>
            <label className="di-school-field-wide">
              Alamat
              <textarea value={settings.school_address ?? ""} readOnly rows={2} />
            </label>
            <label>
              Kepala sekolah
              <input value={profileForm.principal_name} onChange={(event) => setProfileForm({ ...profileForm, principal_name: event.target.value })} readOnly={!canManage} />
            </label>
            <label>
              NIP kepala sekolah
              <input value={profileForm.principal_nip} onChange={(event) => setProfileForm({ ...profileForm, principal_nip: event.target.value })} readOnly={!canManage} />
            </label>
            <label>
              Lintang (latitude)
              <input type="number" step="any" min="-90" max="90" value={profileForm.latitude} onChange={(event) => setProfileForm({ ...profileForm, latitude: event.target.value })} readOnly={!canManage} />
            </label>
            <label>
              Bujur (longitude)
              <input type="number" step="any" min="-180" max="180" value={profileForm.longitude} onChange={(event) => setProfileForm({ ...profileForm, longitude: event.target.value })} readOnly={!canManage} />
            </label>
            <label>
              Radius geofence (meter)
              <input type="number" min="1" step="1" value={profileForm.geofence_radius_meters} onChange={(event) => setProfileForm({ ...profileForm, geofence_radius_meters: event.target.value })} readOnly={!canManage} />
            </label>
            {canManage && (
              <div className="di-school-form-actions di-school-field-wide">
                <button className="di-school-button di-school-button-primary" type="submit" disabled={savingProfile || loading}>
                  <Save size={15} aria-hidden="true" />
                  {savingProfile ? "Menyimpan..." : "Simpan profil & GPS"}
                </button>
              </div>
            )}
          </form>
        )}
        {!canManage && <p className="di-school-hint"><MapPin size={14} aria-hidden="true" /> Profil dapat dilihat; hanya Super Admin dan Operator yang dapat mengubahnya.</p>}
      </section>

      <section className="di-school-section" aria-labelledby="di-school-holidays-title">
        <div className="di-school-section-heading">
          <div className="di-school-section-icon"><CalendarDays size={18} aria-hidden="true" /></div>
          <div>
            <h4 id="di-school-holidays-title">Kalender Libur & Agenda Non-KBM</h4>
            <p>Kalender bersama untuk acuan layanan sekolah dan kegiatan belajar mengajar.</p>
          </div>
        </div>
        {canManage && (
          <form className="di-school-holiday-form" onSubmit={(event) => void saveHoliday(event)}>
            <label>
              Tanggal
              <input type="date" required value={holidayForm.holiday_date} onChange={(event) => setHolidayForm({ ...holidayForm, holiday_date: event.target.value })} />
            </label>
            <label className="di-school-holiday-title">
              Nama hari libur / agenda
              <input required maxLength={160} value={holidayForm.title} onChange={(event) => setHolidayForm({ ...holidayForm, title: event.target.value })} placeholder="Contoh: Libur Hari Raya" />
            </label>
            <label>
              Kategori
              <input maxLength={80} value={holidayForm.category} onChange={(event) => setHolidayForm({ ...holidayForm, category: event.target.value })} />
            </label>
            <label className="di-school-checkbox">
              <input type="checkbox" checked={holidayForm.is_non_kbm} onChange={(event) => setHolidayForm({ ...holidayForm, is_non_kbm: event.target.checked })} />
              Non-KBM
            </label>
            <div className="di-school-form-actions">
              {editingHolidayId && (
                <button type="button" className="di-school-button di-school-button-secondary" onClick={() => { setEditingHolidayId(null); setHolidayForm(emptyHoliday); }}>
                  Batal edit
                </button>
              )}
              <button className="di-school-button di-school-button-primary" type="submit" disabled={savingHoliday}>
                <Save size={15} aria-hidden="true" />
                {savingHoliday ? "Menyimpan..." : editingHolidayId ? "Perbarui agenda" : "Tambah agenda"}
              </button>
            </div>
          </form>
        )}
        <div className="di-school-holiday-list">
          {holidays.length ? holidays.map((holiday) => (
            <article className="di-school-holiday-row" key={holiday.id}>
              <div className="di-school-holiday-date">{dateLabel(holiday.holiday_date)}</div>
              <div className="di-school-holiday-info">
                <strong>{holiday.title}</strong>
                <span>{holiday.category} · {holiday.is_non_kbm ? "Non-KBM" : "KBM tetap berjalan"}</span>
              </div>
              {canManage && (
                <div className="di-school-row-actions">
                  <button type="button" className="di-school-button di-school-button-secondary" onClick={() => editHoliday(holiday)}>Ubah</button>
                  <button type="button" className="di-school-icon-button" aria-label={`Hapus ${holiday.title}`} onClick={() => void removeHoliday(holiday)}>
                    <Trash2 size={16} aria-hidden="true" />
                  </button>
                </div>
              )}
            </article>
          )) : (
            <p className="di-school-empty">{loading ? "Memuat kalender..." : "Belum ada hari libur atau agenda non-KBM."}</p>
          )}
        </div>
        {!canManage && <p className="di-school-hint">Kalender hanya dapat diubah oleh Super Admin dan Operator.</p>}
      </section>
    </div>
  );
}
