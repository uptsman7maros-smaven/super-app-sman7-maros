import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { ReactNode } from "react";
import {
  loadSchoolContextData,
  type SchoolAccount,
  type SchoolContextData,
} from "../services/masterDataService";
import {
  EMPTY_IDENTITY,
  SchoolContext,
  type SchoolContextValue,
} from "./school-context";

export function SchoolProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<SchoolAccount | null>(null);
  const [loadedContext, setLoadedContext] = useState<{
    key: string;
    data: SchoolContextData;
  } | null>(null);
  const [loadingRefresh, setLoadingRefresh] = useState(false);
  const [loadError, setLoadError] = useState<{ key: string; message: string } | null>(null);
  const accountKey = account
    ? JSON.stringify([account.id, account.username, account.role])
    : "";

  const refreshSchoolContext = useCallback(async () => {
    if (!account) {
      return;
    }

    const key = JSON.stringify([account.id, account.username, account.role]);
    setLoadingRefresh(true);
    setLoadError(null);
    try {
      const data = await loadSchoolContextData(account, { force: true });
      setLoadedContext({ key, data });
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : "Data konteks sekolah gagal dimuat.";
      setLoadError({ key, message });
      throw error;
    } finally {
      setLoadingRefresh(false);
    }
  }, [account]);

  useEffect(() => {
    if (!account) {
      return;
    }

    let active = true;
    const key = JSON.stringify([account.id, account.username, account.role]);
    void loadSchoolContextData(account)
      .then((data) => {
        if (!active) return;
        setLoadedContext({ key, data });
      })
      .catch((error: unknown) => {
        if (!active) return;
        setLoadError({
          key,
          message: error instanceof Error
            ? error.message
            : "Data konteks sekolah gagal dimuat.",
        });
      });

    return () => {
      active = false;
    };
  }, [account]);

  const value = useMemo<SchoolContextValue>(() => {
    const data = loadedContext?.key === accountKey ? loadedContext.data : null;
    return {
      currentUser: account
        ? { ...account, ...(data?.identity ?? EMPTY_IDENTITY) }
        : null,
      userRole: account?.role ?? null,
      schoolSettings: data?.schoolSettings ?? null,
      activeAcademicYear: data?.activeAcademicYear ?? null,
      moduleSettings: data?.moduleSettings ?? [],
      contextLoading: (Boolean(account) && !data) || loadingRefresh,
      contextError: loadError?.key === accountKey ? loadError.message : "",
      setCurrentUser: setAccount,
      refreshSchoolContext,
    };
  }, [account, accountKey, loadedContext, loadError, loadingRefresh, refreshSchoolContext]);

  return <SchoolContext.Provider value={value}>{children}</SchoolContext.Provider>;
}
