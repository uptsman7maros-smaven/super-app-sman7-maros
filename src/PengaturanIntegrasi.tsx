import React, { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "./lib/supabase";
import { useSchoolContext } from "./context/useSchoolContext";
import { logAppActivity } from "./services/activityLogService";
import type { AppModuleRegistryEntry } from "./services/moduleRegistry";
import { DEFAULT_SCHOOL_LETTERHEAD_ADDRESS, getSchoolLetterhead } from "./services/masterDataService";
import { SchoolLetterheadPreview } from "./components/shared/SchoolLetterheadPicker";
import {
  getMaintenanceStatus,
  subscribeToMaintenanceStatus,
} from "./services/maintenanceService";
import type { ModuleSetting, SchoolSettings } from "./services/masterDataService";
import "./PengaturanIntegrasi.css";

type SchoolSettingsForm = Omit<SchoolSettings, "id"> & { id?: number };
type ServiceItem = { id: string; service_name: string; service_url: string; status: string; notes: string };
type ActivityItem = {
  id?: string;
  created_at?: string;
  actor_label?: string;
  actor_id?: string;
  action?: string;
  module_key?: string;
  details?: string;
};

const initialSettings: SchoolSettingsForm = {
  school_name: "SMAN 7 Maros",
  npsn: "40308320",
  academic_year: "2026/2027",
  logo_url: "",
  letterhead: DEFAULT_SCHOOL_LETTERHEAD_ADDRESS,
  logo_url_2: "",
  letterhead_2: DEFAULT_SCHOOL_LETTERHEAD_ADDRESS,
  province_logo_url: "",
};

export default function PengaturanIntegrasi({
  onModulesUpdated,
  moduleCatalog = [],
}: {
  onModulesUpdated?: () => void;
  moduleCatalog?: readonly AppModuleRegistryEntry[];
}) {
  const {
    currentUser,
    schoolSettings,
    activeAcademicYear,
    moduleSettings,
    contextError,
    contextLoading,
    refreshSchoolContext,
  } = useSchoolContext();
  const [tab, setTab] = useState("identitas");
  const [settingsDraft, setSettingsDraft] = useState<SchoolSettingsForm | null>(null);
  const settings = settingsDraft ?? (schoolSettings
    ? {
      ...schoolSettings,
      letterhead: schoolSettings.letterhead || DEFAULT_SCHOOL_LETTERHEAD_ADDRESS,
      letterhead_2: schoolSettings.letterhead_2 || DEFAULT_SCHOOL_LETTERHEAD_ADDRESS,
      province_logo_url: schoolSettings.province_logo_url || "",
      academic_year: activeAcademicYear?.name ?? schoolSettings.academic_year,
    }
    : initialSettings);
  const modules = useMemo<ModuleSetting[]>(() => {
    const normalize = (value: string) => value.toLocaleLowerCase("id-ID").replace(/[^a-z0-9]/g, "");
    const registered = moduleCatalog.map((entry) => {
      const setting = moduleSettings.find((item) =>
        [item.module_key, item.label, item.route_key].some((value) => normalize(value) === normalize(entry.route_key))
      );
      return setting ?? {
        id: "",
        module_key: entry.module_key,
        label: entry.label,
        route_key: entry.route_key,
        is_enabled: true,
      };
    });
    return registered;
  }, [moduleCatalog, moduleSettings]);
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [moduleSyncLoading, setModuleSyncLoading] = useState(false);
  const [logoUploading, setLogoUploading] = useState<"province" | "school" | null>(null);
  const [message, setMessage] = useState("");
  const [newService, setNewService] = useState({ service_name: "", service_url: "", notes: "" });
  const [maintenanceEnabled, setMaintenanceEnabled] = useState(false);
  const [maintenanceMessage, setMaintenanceMessage] = useState("");
  const [maintenanceLoading, setMaintenanceLoading] = useState(false);
  const [maintenanceSaving, setMaintenanceSaving] = useState(false);
  const [maintenanceError, setMaintenanceError] = useState("");
  const isSuperAdmin = currentUser?.role === "super_admin";

  const notify = (s: string) => { setMessage(s); window.setTimeout(() => setMessage(""), 3500); };
  const syncMissingModules = useCallback(async () => {
    if (!isSuperAdmin || contextLoading || contextError) return;
    const normalize = (value: string) => value.toLocaleLowerCase("id-ID").replace(/[^a-z0-9]/g, "");
    const missing = moduleCatalog.filter((entry) => !moduleSettings.some((item) =>
      [item.module_key, item.label, item.route_key].some((value) => normalize(value) === normalize(entry.route_key))
    ));
    if (!missing.length) return;
    setModuleSyncLoading(true);
    try {
      const { error } = await supabase.from("app_module_settings").insert(missing.map(entry => ({
        ...entry,
        is_enabled: true,
        updated_by: currentUser?.id ?? null,
      })));
      if (error) throw error;
      await refreshSchoolContext();
    } catch (error) {
      notify(error instanceof Error
        ? `Sinkronisasi katalog modul gagal: ${error.message}`
        : "Sinkronisasi katalog modul gagal.");
    } finally {
      setModuleSyncLoading(false);
    }
  }, [contextError, contextLoading, currentUser?.id, isSuperAdmin, moduleCatalog, moduleSettings, refreshSchoolContext]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void syncMissingModules(); }, 0);
    return () => window.clearTimeout(timer);
  }, [syncMissingModules]);

  const auditSettings = async (action: string, details: string): Promise<string> => {
    try {
      await logAppActivity({
        actorId: currentUser?.id,
        actorLabel: currentUser?.full_name || currentUser?.username,
        action,
        moduleKey: "Pengaturan",
        details,
      });
      return "";
    } catch (error) {
      return `Perubahan tersimpan, tetapi audit aktivitas gagal: ${error instanceof Error ? error.message : String(error)}`;
    }
  };

  const loadAll = useCallback(async () => {
    setBusy(true);
    try {
      const [sv, a] = await Promise.all([
        supabase.from("app_service_registry").select("*").order("service_name"),
        supabase.from("app_activity_logs").select("*").order("created_at", { ascending: false }).limit(50)
      ]);
      if (sv.data) setServices(sv.data as ServiceItem[]);
      if (a.data) setActivity(a.data as ActivityItem[]);
      const errors = [sv.error, a.error].filter(Boolean);
      if (errors.length) notify(`Sebagian data belum dapat dimuat. Pastikan tabel tersedia dan akses sesuai. ${errors[0]!.message}`);
    } catch (error) {
      notify(error instanceof Error ? `Data pengaturan gagal dimuat: ${error.message}` : "Data pengaturan gagal dimuat.");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadAll(); }, 0);
    return () => window.clearTimeout(timer);
  }, [loadAll]);

  useEffect(() => {
    if (!isSuperAdmin) return;
    let active = true;
    const timer = window.setTimeout(() => {
      setMaintenanceLoading(true);
      setMaintenanceError("");
      void getMaintenanceStatus()
        .then((status) => {
          if (!active) return;
          setMaintenanceEnabled(status.is_active);
          setMaintenanceMessage(status.message);
        })
        .catch((error: unknown) => {
          if (!active) return;
          setMaintenanceError(error instanceof Error ? error.message : String(error));
        })
        .finally(() => {
          if (active) setMaintenanceLoading(false);
        });
    }, 0);
    const unsubscribe = subscribeToMaintenanceStatus(
      (status) => {
        if (!active) return;
        setMaintenanceEnabled(status.is_active);
        setMaintenanceMessage(status.message);
        setMaintenanceError("");
      },
      (error) => {
        if (active) setMaintenanceError(error.message);
      },
    );

    return () => {
      active = false;
      window.clearTimeout(timer);
      unsubscribe();
    };
  }, [currentUser?.id, isSuperAdmin]);

  async function uploadSchoolLogo(target: "province" | "school", event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    if (!isSuperAdmin || !currentUser) {
      notify("Hanya Super Admin yang dapat mengunggah logo kop surat.");
      return;
    }
    if (!["image/png", "image/jpeg"].includes(file.type) || file.size > 8 * 1024 * 1024) {
      notify("Pilih berkas PNG/JPEG dengan ukuran maksimal 8 MB.");
      return;
    }

    setLogoUploading(target);
    try {
      const bitmap = await createImageBitmap(file);
      const highResolution = bitmap.width >= 300 && bitmap.height >= 300;
      bitmap.close();
      if (!highResolution) throw new Error("Gunakan logo berukuran minimal 300 × 300 piksel agar tetap tajam saat dicetak.");
      const extension = file.type === "image/png" ? "png" : "jpg";
      const path = `${currentUser.id}/letterhead-${target}/logo-${Date.now()}.${extension}`;
      const { error } = await supabase.storage.from("school-letterheads").upload(path, file, {
        contentType: file.type,
        upsert: false,
      });
      if (error) throw error;
      const { data } = supabase.storage.from("school-letterheads").getPublicUrl(path);
      setSettingsDraft({
        ...settings,
        [target === "province" ? "province_logo_url" : "logo_url_2"]: data.publicUrl,
      });
      notify(`${target === "province" ? "Lambang Provinsi Sulawesi Selatan" : "Logo sekolah"} diunggah. Simpan perubahan identitas untuk menerapkannya.`);
    } catch (error) {
      notify(error instanceof Error ? `Logo gagal diunggah: ${error.message}` : "Logo gagal diunggah.");
    } finally {
      setLogoUploading(null);
    }
  }

  async function saveSettings(e: React.FormEvent) {
    e.preventDefault(); setBusy(true);
    try {
      const { error } = await supabase.from("school_settings").upsert({
        ...settings, updated_at: new Date().toISOString()
      });
      if (error) throw error;
      const auditWarning = await auditSettings("Identitas sekolah diperbarui", `Nama sekolah: ${settings.school_name}`);
      notify(auditWarning || "Identitas sekolah berhasil disimpan.");
      await refreshSchoolContext();
      setSettingsDraft(null);
      await loadAll();
    } catch (error) {
      notify(error instanceof Error ? `Gagal menyimpan: ${error.message}` : "Identitas sekolah gagal disimpan.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleModule(item: ModuleSetting) {
    try {
      const nextEnabled = !item.is_enabled;
      const { error } = await supabase.rpc("set_app_module_status", {
        p_module_id: item.id,
        p_is_enabled: nextEnabled,
      });
      if (error) throw error;
      const auditWarning = await auditSettings(
        item.is_enabled ? "Modul dinonaktifkan" : "Modul diaktifkan",
        item.label,
      );
      if (onModulesUpdated) {
        await onModulesUpdated();
      } else {
        await refreshSchoolContext();
      }
      await loadAll();
      notify(auditWarning || `${item.label} diperbarui.`);
    } catch (error) {
      notify(error instanceof Error ? `Gagal mengubah modul: ${error.message}` : "Modul gagal diperbarui.");
    }
  }

  async function addService(e: React.FormEvent) {
    e.preventDefault();
    try {
      const { error } = await supabase.from("app_service_registry").insert({ ...newService, status: "Belum diverifikasi" });
      if (error) throw error;
      const auditWarning = await auditSettings("Layanan integrasi ditambahkan", newService.service_name);
      setNewService({ service_name: "", service_url: "", notes: "" });
      await loadAll();
      notify(auditWarning || "Layanan ditambahkan.");
    } catch (error) {
      notify(error instanceof Error ? `Gagal menambahkan layanan: ${error.message}` : "Layanan gagal ditambahkan.");
    }
  }

  async function removeService(id: string) {
    if (!window.confirm("Hapus entri layanan ini?")) return;
    try {
      const { error } = await supabase.from("app_service_registry").delete().eq("id", id);
      if (error) throw error;
      const auditWarning = await auditSettings("Layanan integrasi dihapus", `ID layanan ${id}`);
      await loadAll();
      notify(auditWarning || "Layanan dihapus.");
    } catch (error) {
      notify(error instanceof Error ? `Gagal menghapus: ${error.message}` : "Layanan gagal dihapus.");
    }
  }

  async function saveMaintenanceSettings(enabledOverride?: boolean) {
    if (!isSuperAdmin || !currentUser) {
      setMaintenanceError("Hanya Super Admin yang dapat mengubah status pemeliharaan.");
      return;
    }

    const trimmedMessage = maintenanceMessage.trim();
    if (!trimmedMessage) {
      setMaintenanceError("Isi pesan pemeliharaan sebelum menyimpan.");
      return;
    }

    setMaintenanceSaving(true);
    setMaintenanceError("");
    try {
      const { data, error } = await supabase
        .from("app_maintenance_status")
        .update({
          is_active: enabledOverride ?? maintenanceEnabled,
          message: trimmedMessage,
          updated_at: new Date().toISOString(),
          updated_by: currentUser.id,
        })
        .eq("id", 1)
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Status pemeliharaan tidak berubah. Periksa izin akun dan migrasi database.");

      const savedStatus = await getMaintenanceStatus();
      setMaintenanceEnabled(savedStatus.is_active);
      setMaintenanceMessage(savedStatus.message);
      const auditWarning = await auditSettings(
        "Status pemeliharaan aplikasi diperbarui",
        savedStatus.is_active ? "Pemberitahuan pemeliharaan ditampilkan" : "Pemberitahuan pemeliharaan dinonaktifkan",
      );
      notify(auditWarning || (savedStatus.is_active
        ? "Pemberitahuan pemeliharaan ditampilkan untuk seluruh pengguna."
        : "Pemberitahuan pemeliharaan dinonaktifkan."));
    } catch (error) {
      setMaintenanceError(error instanceof Error ? error.message : String(error));
    } finally {
      setMaintenanceSaving(false);
    }
  }

  async function createBackupManifest() {
    const payload = {
      generated_at: new Date().toISOString(),
      note: "Manifest metadata saja. Backup penuh database harus dibuat dari Supabase Dashboard.",
      school_settings: settings, modules, services
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `manifest-backup-superapp-${new Date().toISOString().slice(0,10)}.json`; a.click();
    URL.revokeObjectURL(url);
    notify("Manifest metadata diunduh. Ini bukan backup penuh database.");
  }

  const tabs = [
    ["identitas", "Identitas sekolah"], ["modul", "Modul & menu"], ["integrasi", "Pusat integrasi"],
    ["aktivitas", "Log aktivitas"], ["backup", "Backup & sistem"]
  ];

  return <div className="pi-wrap">
    <header className="pi-hero">
      <div className="pi-orb pi-orb-one" /><div className="pi-orb pi-orb-two" />
      <div className="pi-hero-content">
        <span className="pi-eyebrow">PUSAT KENDALI SUPER APP</span>
        <h1>Pengaturan & Integrasi</h1>
        <p>Kelola identitas sekolah, modul, layanan, dan pemantauan sistem dalam satu tempat.</p>
        <div className="pi-hero-pills"><span>● Supabase</span><span>● Modular</span><span>● SMAN 7 Maros</span></div>
      </div>
      <div className="pi-hero-icon">⚙️</div>
    </header>

    <div className="pi-stat-grid">
      <div className="pi-stat purple"><span>Modul aktif</span><strong>{modules.filter(x => x.is_enabled).length}</strong><small>Dari {modules.length} terdaftar</small></div>
      <div className="pi-stat blue"><span>Layanan tercatat</span><strong>{services.length}</strong><small>Di pusat integrasi</small></div>
      <div className="pi-stat green"><span>Nama sekolah</span><strong className="pi-school-stat">{settings.school_name || "Belum diatur"}</strong><small>NPSN {settings.npsn || "—"}</small></div>
    </div>

    <nav className="pi-tabs">{tabs.map(([id, label]) => <button key={id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}>{label}</button>)}</nav>
    {message && <div className="pi-toast" role="status">{message}</div>}
    {contextError && <div className="pi-toast" role="alert">{contextError}</div>}
    {(busy || contextLoading) && <div className="pi-loading"><span /> Memuat atau menyimpan data…</div>}

    {tab === "identitas" && <section className="pi-panel pi-animate">
      <div className="pi-section-title"><div><span className="pi-kicker">PROFIL SEKOLAH</span><h2>Identitas & kop surat</h2></div><span className="pi-icon-chip">🏫</span></div>
      <form onSubmit={saveSettings} className="pi-form">
        <label>Nama sekolah<input value={settings.school_name} onChange={e => setSettingsDraft({...settings, school_name:e.target.value})} required /></label>
        <label>NPSN<input value={settings.npsn} onChange={e => setSettingsDraft({...settings, npsn:e.target.value})} /></label>
        <label>Tahun ajaran<input value={settings.academic_year} onChange={e => setSettingsDraft({...settings, academic_year:e.target.value})} placeholder="2026/2027" /></label>
        <div className="pi-letterhead-grid pi-wide">
          <fieldset className="pi-letterhead-card">
            <legend>Kop Surat 1 · Utama</legend>
            <label>{logoUploading === "province" ? "Mengunggah lambang provinsi..." : "Lambang Provinsi Sulawesi Selatan (PNG/JPEG, min. 300 × 300 px, maks. 8 MB)"}
              <input type="file" accept="image/png,image/jpeg" onChange={event => void uploadSchoolLogo("province", event)} disabled={logoUploading !== null} />
            </label>
            <label>Alamat surat<textarea rows={3} value={settings.letterhead} onChange={e => setSettingsDraft({...settings, letterhead:e.target.value})} /></label>
            <SchoolLetterheadPreview letterhead={getSchoolLetterhead(settings, "1")} />
          </fieldset>
          <fieldset className="pi-letterhead-card">
            <legend>Kop Surat 2 · Alternatif</legend>
            <label>{logoUploading === "school" ? "Mengunggah logo sekolah..." : "Logo SMAN 7 Maros di sisi kanan (PNG/JPEG, min. 300 × 300 px, maks. 8 MB)"}
              <input type="file" accept="image/png,image/jpeg" onChange={event => void uploadSchoolLogo("school", event)} disabled={logoUploading !== null} />
            </label>
            <label>Alamat surat<textarea rows={3} value={settings.letterhead_2} onChange={e => setSettingsDraft({...settings, letterhead_2:e.target.value})} /></label>
            <SchoolLetterheadPreview letterhead={getSchoolLetterhead(settings, "2")} />
          </fieldset>
          <p className="pi-letterhead-help">Kop 1 memakai lambang Sulawesi Selatan di tengah; Kop 2 memakai lambang provinsi di kiri dan logo sekolah di kanan. Lambang provinsi bawaan dan logo sekolah dapat diganti di sini. Alamat mengikuti data sekolah dan otomatis dipakai pada dokumen.</p>
        </div>
        <div className="pi-wide pi-actions"><button className="pi-primary" disabled={busy || logoUploading !== null}>Simpan identitas</button><button type="button" className="pi-secondary" onClick={() => window.print()}>Cetak pratinjau</button></div>
      </form>
    </section>}

    {tab === "modul" && <section className="pi-panel pi-animate">
      <div className="pi-section-title"><div><span className="pi-kicker">KONFIGURASI APLIKASI</span><h2>Modul & menu aktif</h2><p>Katalog diselaraskan dengan modul di menu dan routing. Modul nonaktif disembunyikan dari pengguna lain dan akses langsungnya ditolak.</p></div><span className="pi-icon-chip">🧩</span></div>
      {modules.length === 0 ? <div className="pi-empty">Belum ada modul terdaftar atau akses tabel belum tersedia.</div> : <div className="pi-module-grid">{modules.map(m => <div className="pi-module" key={m.id || m.module_key}><div className="pi-module-top"><span className="pi-module-dot">{m.is_enabled ? "✓" : "–"}</span><span className={m.is_enabled ? "pi-status on" : "pi-status off"}>{m.id ? (m.is_enabled ? "Aktif" : "Nonaktif") : "Menunggu sinkronisasi"}</span></div><h3>{m.label}</h3><p>Kunci: <code>{m.module_key}</code></p><button className={m.is_enabled ? "pi-toggle enabled" : "pi-toggle"} disabled={!m.id || moduleSyncLoading || busy} onClick={() => void toggleModule(m)}>{m.is_enabled ? "Nonaktifkan" : "Aktifkan"}</button></div>)}</div>}
      {moduleSyncLoading && <p className="pi-loading" role="status">Menyinkronkan katalog modul yang belum terdaftar…</p>}
    </section>}

    {tab === "integrasi" && <section className="pi-panel pi-animate">
      <div className="pi-section-title"><div><span className="pi-kicker">REGISTRY LAYANAN</span><h2>Pusat integrasi</h2><p>Daftarkan URL layanan dan modul eksternal. Status layanan belum diperiksa otomatis.</p></div><span className="pi-icon-chip">🔗</span></div>
      <form className="pi-form pi-service-form" onSubmit={addService}>
        <label>Nama layanan<input required value={newService.service_name} onChange={e => setNewService({...newService,service_name:e.target.value})} placeholder="Contoh: LMS Sekolah" /></label>
        <label>URL layanan<input required type="url" value={newService.service_url} onChange={e => setNewService({...newService,service_url:e.target.value})} placeholder="https://..." /></label>
        <label className="pi-wide">Keterangan<input value={newService.notes} onChange={e => setNewService({...newService,notes:e.target.value})} placeholder="Kegunaan atau penanggung jawab" /></label>
        <div className="pi-wide"><button className="pi-primary">Tambah layanan</button></div>
      </form>
      <div className="pi-service-list">{services.map(s => <div className="pi-service" key={s.id}><div className="pi-service-symbol">↗</div><div className="pi-service-info"><strong>{s.service_name}</strong><a href={s.service_url} target="_blank" rel="noreferrer">{s.service_url}</a><small>{s.notes || "Tidak ada keterangan"} · {s.status}</small></div><button className="pi-danger" onClick={() => void removeService(s.id)}>Hapus</button></div>)}</div>
    </section>}

    {tab === "aktivitas" && <section className="pi-panel pi-animate">
      <div className="pi-section-title"><div><span className="pi-kicker">AUDIT & KEAMANAN</span><h2>Log aktivitas</h2><p>Menampilkan log yang sudah ditulis ke tabel audit. Log otomatis membutuhkan integrasi tambahan pada aksi-aksi modul.</p></div><span className="pi-icon-chip">🛡️</span></div>
      {activity.length === 0 ? <div className="pi-empty">Belum ada log aktivitas atau akses tabel belum tersedia.</div> : <div className="pi-table-scroll"><table className="pi-table"><thead><tr><th>Waktu</th><th>Pengguna</th><th>Aksi</th><th>Modul</th><th>Detail</th></tr></thead><tbody>{activity.map((a,i) => <tr key={a.id || i}><td>{a.created_at ? new Date(a.created_at).toLocaleString("id-ID") : "—"}</td><td>{a.actor_label || a.actor_id || "Sistem"}</td><td>{a.action}</td><td>{a.module_key || "—"}</td><td>{a.details || "—"}</td></tr>)}</tbody></table></div>}
    </section>}

    {tab === "backup" && <section className="pi-panel pi-animate">
      <div className="pi-section-title"><div><span className="pi-kicker">KEANDALAN SISTEM</span><h2>Backup & pemantauan</h2><p>Gunakan backup database resmi untuk pemulihan penuh. Ekspor di bawah hanya berisi metadata pengaturan dan registry.</p></div><span className="pi-icon-chip">💾</span></div>
      <div className="pi-backup-grid"><div className="pi-backup-card"><span>📦</span><h3>Ekspor metadata</h3><p>Unduh pengaturan sekolah, status modul, dan daftar layanan dalam format JSON.</p><button className="pi-primary" onClick={() => void createBackupManifest()}>Unduh manifest JSON</button></div><div className="pi-backup-card warning"><span>🔐</span><h3>Backup penuh database</h3><p>Buka dashboard Supabase dan gunakan fasilitas backup/ekspor database sesuai paket dan akses proyek Anda.</p><a className="pi-secondary link-button" href="https://supabase.com/dashboard" target="_blank" rel="noreferrer">Buka Supabase Dashboard ↗</a></div><div className="pi-backup-card"><span>🩺</span><h3>Status koneksi</h3><p>Memuat status dari keberhasilan akses tabel, bukan pemeriksaan uptime layanan eksternal.</p><button className="pi-secondary" onClick={() => void loadAll()}>Periksa koneksi database</button></div></div>
      <section className="maintenance-settings" aria-labelledby="maintenance-settings-title">
        <h3 id="maintenance-settings-title">Pemberitahuan pemeliharaan aplikasi</h3>
        <p>Aktifkan saat ada perbaikan atau pembaruan. Pengguna selain Super Admin akan terkunci dari aplikasi dan melihat pesan ini; Super Admin tetap dapat masuk untuk menonaktifkan mode pemeliharaan.</p>
        {isSuperAdmin ? (
          <form onSubmit={(e) => { e.preventDefault(); void saveMaintenanceSettings(); }}>
            <label className="maintenance-toggle">
              <input
                type="checkbox"
                checked={maintenanceEnabled}
                onChange={(e) => setMaintenanceEnabled(e.target.checked)}
                disabled={maintenanceLoading || maintenanceSaving}
              />
              Tampilkan pemberitahuan pemeliharaan
            </label>
            <label>
              Pesan untuk pengguna
              <textarea
                rows={3}
                value={maintenanceMessage}
                onChange={(e) => setMaintenanceMessage(e.target.value)}
                placeholder="Contoh: Aplikasi sedang dalam perbaikan atau pembaruan. Silakan cek kembali beberapa saat lagi."
                required
                disabled={maintenanceLoading || maintenanceSaving}
              />
            </label>
            {maintenanceError && <p className="maintenance-error" role="alert">{maintenanceError}</p>}
            <div className="maintenance-actions">
              <button className="pi-primary" disabled={maintenanceLoading || maintenanceSaving}>
                {maintenanceLoading ? "Memuat status..." : maintenanceSaving ? "Menyimpan..." : "Simpan status"}
              </button>
              {maintenanceEnabled && (
                <button
                  type="button"
                  className="pi-secondary maintenance-disable-button"
                  disabled={maintenanceLoading || maintenanceSaving}
                  onClick={() => void saveMaintenanceSettings(false)}
                >
                  {maintenanceSaving ? "Menonaktifkan..." : "Nonaktifkan pemeliharaan"}
                </button>
              )}
              <small>Perubahan hanya dapat dilakukan oleh Super Admin.</small>
            </div>
          </form>
        ) : (
          <p>Pengelolaan pemberitahuan ini hanya tersedia untuk Super Admin.</p>
        )}
      </section>
      <div className="pi-note"><strong>Catatan:</strong> manifest JSON bukan backup penuh. Jangan menyimpan service-role key atau kredensial rahasia di browser maupun file ekspor.</div>
    </section>}
    <footer className="pi-footer">Super App SMAN 7 Maros <span>•</span> Pusat Pengaturan & Integrasi</footer>
  </div>;
}
