import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Megaphone, X } from "lucide-react";
import { supabase } from "./lib/supabase";
import "./OfficialAnnouncementModal.css";

type Announcement = {
  id: string;
  title: string;
  body: string;
  audience: string;
  published_at: string;
};
const announcementPageSize = 500;

const audienceMatchesRole = (audience: string, role: string) => {
  switch (audience.trim().toLocaleLowerCase("id-ID")) {
    case "semua pengguna":
      return true;
    case "guru":
      return role === "guru" || role === "guru_bk";
    case "siswa":
      return role === "siswa";
    case "tenaga kependidikan":
      return ["tendik", "staff_tata_usaha", "kepala_tata_usaha"].includes(role);
    case "operator":
      return role === "operator";
    case "kepala sekolah":
      return role === "kepala_sekolah";
    default:
      return false;
  }
};

export default function OfficialAnnouncementModal({
  userId,
  role,
  loginSessionId,
}: {
  userId: string;
  role: string;
  loginSessionId: string;
}) {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [loadError, setLoadError] = useState("");
  const loadRequestRef = useRef(0);
  const announcementShownKey = `super-app:announcement-shown:${userId}:${loginSessionId}`;

  const loadAnnouncements = useCallback(async (forceOpen = false) => {
    const requestId = ++loadRequestRef.current;
    const loaded: Announcement[] = [];
    let offset = 0;
    while (true) {
      const { data, error } = await supabase
        .from("school_announcements")
        .select("id,title,body,audience,published_at")
        .eq("is_published", true)
        .order("published_at", { ascending: false })
        .range(offset, offset + announcementPageSize - 1);

      if (requestId !== loadRequestRef.current) return;
      if (error) {
        setLoadError(`Pengumuman resmi gagal dimuat: ${error.message}`);
        console.error("Pengumuman resmi gagal dimuat:", error);
        return;
      }

      const page = (data ?? []) as Announcement[];
      loaded.push(...page);
      if (page.length < announcementPageSize) break;
      offset += announcementPageSize;
    }

    const matching = loaded.filter((announcement) =>
      audienceMatchesRole(announcement.audience, role),
    );
    setAnnouncements(matching);
    setActiveIndex((index) => forceOpen ? 0 : Math.min(index, Math.max(0, matching.length - 1)));
    setLoadError("");
    if (!matching.length) {
      setIsOpen(false);
      return;
    }

    if (forceOpen) {
      try {
        window.sessionStorage.setItem(announcementShownKey, "true");
      } catch (storageError) {
        console.error("Status tampilan pengumuman sesi tidak dapat disimpan:", storageError);
      }
      setIsOpen(true);
      return;
    }

    try {
      if (!window.sessionStorage.getItem(announcementShownKey)) {
        window.sessionStorage.setItem(announcementShownKey, "true");
        setIsOpen(true);
      }
    } catch (storageError) {
      console.error("Status tampilan pengumuman sesi tidak dapat disimpan:", storageError);
      setIsOpen(true);
    }
  }, [announcementShownKey, role]);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void loadAnnouncements(), 0);

    const channel = supabase
      .channel(`official-announcements-${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "school_announcements" },
        () => void loadAnnouncements(),
      )
      .subscribe((status, error) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.error(
            "Pembaruan pengumuman realtime gagal:",
            error?.message ?? "Kanal realtime tidak tersedia.",
          );
        }
      });

    const refresh = window.setInterval(() => {
      if (document.visibilityState === "visible") void loadAnnouncements();
    }, 60_000);
    return () => {
      loadRequestRef.current += 1;
      window.clearTimeout(initialLoad);
      window.clearInterval(refresh);
      void supabase.removeChannel(channel);
    };
  }, [loadAnnouncements, userId]);

  useEffect(() => {
    const reopen = () => void loadAnnouncements(true);
    window.addEventListener("super-app:reopen-announcements", reopen);
    return () => window.removeEventListener("super-app:reopen-announcements", reopen);
  }, [loadAnnouncements]);

  const current = announcements[activeIndex];
  const publishedLabel = useMemo(() => current
    ? new Intl.DateTimeFormat("id-ID", {
      dateStyle: "long",
      timeStyle: "short",
      timeZone: "Asia/Makassar",
    }).format(new Date(current.published_at))
    : "", [current]);

  if (!isOpen || !current) {
    if (!loadError) return null;
    return (
      <div className="official-announcement-error" role="status">
        <span>{loadError}</span>
        <button type="button" onClick={() => void loadAnnouncements()}>Coba lagi</button>
      </div>
    );
  }

  return (
    <div className="official-announcement-backdrop" role="presentation">
      <section
        className="official-announcement-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="official-announcement-title"
        aria-describedby="official-announcement-body"
      >
        <button
          type="button"
          className="official-announcement-close-icon"
          onClick={() => setIsOpen(false)}
          aria-label="Tutup pengumuman"
        >
          <X size={20} />
        </button>
        <div className="official-announcement-heading">
          <span className="official-announcement-icon"><Megaphone size={22} /></span>
          <div>
            <span className="official-announcement-eyebrow">INFORMASI RESMI SEKOLAH</span>
            <h2 id="official-announcement-title">{current.title}</h2>
          </div>
        </div>
        <div className="official-announcement-meta">
          <span>{current.audience}</span>
          <time>{publishedLabel}</time>
        </div>
        <div className="official-announcement-body" id="official-announcement-body">
          {current.body}
        </div>
        <footer className="official-announcement-actions">
          <span className="official-announcement-count">
            Pengumuman {activeIndex + 1} dari {announcements.length}
          </span>
          <div className="official-announcement-navigation">
            <button
              type="button"
              onClick={() => setActiveIndex((index) => Math.max(0, index - 1))}
              disabled={activeIndex === 0}
            >
              <ChevronLeft size={17} /> Sebelumnya
            </button>
            {activeIndex < announcements.length - 1 ? (
              <button
                type="button"
                className="is-primary"
                onClick={() => setActiveIndex((index) => Math.min(announcements.length - 1, index + 1))}
              >
                Selanjutnya <ChevronRight size={17} />
              </button>
            ) : (
              <button
                type="button"
                className="is-primary"
                onClick={() => setIsOpen(false)}
              >
                Keluar
              </button>
            )}
          </div>
        </footer>
      </section>
    </div>
  );
}
