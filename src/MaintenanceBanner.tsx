import { useEffect, useState } from "react";
import { CircleAlert } from "lucide-react";
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

  const showUpdateNotice = loadError || syncError;
  if (!status?.is_active && !showUpdateNotice) return null;

  return (
    <>
      {status?.is_active && (
        <aside className="maintenance-banner" role="alert">
          <strong>Aplikasi sedang dalam perbaikan</strong>
          <span>{status.message}</span>
        </aside>
      )}
      {showUpdateNotice && (
        <aside
          className="maintenance-update-toast"
          key={loadError ? "load-error" : "sync-error"}
          role={loadError ? "alert" : "status"}
        >
          <CircleAlert size={20} aria-hidden="true" />
          <div>
            <strong>{loadError ? "Status pembaruan gagal dimuat" : "Status pembaruan belum tersinkron"}</strong>
            <span>
              {loadError
                ? "Informasi status pemeliharaan belum dapat dimuat. Silakan muat ulang atau hubungi administrator."
                : "Pembaruan status mungkin terlambat terlihat. Muat ulang aplikasi untuk menyegarkan."}
            </span>
          </div>
        </aside>
      )}
    </>
  );
}
