import { useEffect, useState } from "react";
import {
  getMaintenanceStatus,
  subscribeToMaintenanceStatus,
  type MaintenanceStatus,
} from "./services/maintenanceService";
import "./MaintenanceBanner.css";

export default function MaintenanceBanner() {
  const [status, setStatus] = useState<MaintenanceStatus | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [syncError, setSyncError] = useState(false);

  useEffect(() => {
    let active = true;

    void getMaintenanceStatus()
      .then((nextStatus) => {
        if (!active) return;
        setStatus(nextStatus);
        setLoadError(false);
      })
      .catch((error: unknown) => {
        console.error("Status pemeliharaan gagal dimuat:", error);
        if (active) setLoadError(true);
      });

    const unsubscribe = subscribeToMaintenanceStatus(
      (nextStatus) => {
        if (!active) return;
        setStatus(nextStatus);
        setLoadError(false);
        setSyncError(false);
      },
      (error) => {
        console.error("Sinkronisasi status pemeliharaan gagal:", error);
        if (active) setSyncError(true);
      },
    );

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  if (loadError) {
    return (
      <aside className="maintenance-banner maintenance-banner-error" role="alert">
        Informasi status pemeliharaan belum dapat dimuat. Silakan muat ulang atau hubungi administrator.
      </aside>
    );
  }

  if (!status?.is_active && !syncError) return null;

  return (
    <aside className="maintenance-banner" role="alert">
      <strong>{status?.is_active ? "Aplikasi sedang dalam perbaikan" : "Status aplikasi belum tersinkron"}</strong>
      <span>
        {status?.is_active
          ? status.message
          : "Muat ulang aplikasi untuk memastikan Anda melihat informasi pemeliharaan terbaru."}
      </span>
      {syncError && <small>Pembaruan status mungkin terlambat terlihat. Muat ulang aplikasi untuk menyegarkan.</small>}
    </aside>
  );
}
