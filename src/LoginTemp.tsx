import { useEffect, useState } from "react";
import { supabase } from "./lib/supabase";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { loginThemes, persistLoginTheme, type LoginTheme } from "./loginThemes";
import "./LoginTemp.css";

const FALLBACK_SCHOOL_PHOTO = "/login-school-photo.jpg";

const SCHOOL_PHOTOS = [
  { src: FALLBACK_SCHOOL_PHOTO, caption: "Lingkungan Sekolah" },
];

type LoginProps = {
  moduleName?: string;
  allowedRoles?: string[];
  loginTheme: LoginTheme;
  onThemeChange: (theme: LoginTheme) => void;
  maintenanceActive: boolean;
  maintenanceMessage: string;
  onLoginSuccess: (user: {
    id: string;
    username: string;
    role: string;
  }) => void;
};

export default function Login({
  moduleName = "Super App",
  allowedRoles = [],
  loginTheme,
  onThemeChange,
  maintenanceActive,
  maintenanceMessage,
  onLoginSuccess,
}: LoginProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [photoIndexes, setPhotoIndexes] = useState({
    active: 0,
    previous: 0,
  });

  useEffect(() => {
    if (
      SCHOOL_PHOTOS.length < 2 ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }

    const intervalId = window.setInterval(() => {
      setPhotoIndexes(({ active }) => ({
        previous: active,
        active: (active + 1) % SCHOOL_PHOTOS.length,
      }));
    }, 5500);

    return () => window.clearInterval(intervalId);
  }, []);

  function selectSchoolPhoto(index: number) {
    setPhotoIndexes((current) => ({
      previous: current.active,
      active: index,
    }));
  }

  function handleSchoolPhotoError(
    event: React.SyntheticEvent<HTMLImageElement>,
  ) {
    const image = event.currentTarget;
    if (image.dataset.fallbackApplied !== "true" && image.getAttribute("src") !== FALLBACK_SCHOOL_PHOTO) {
      image.dataset.fallbackApplied = "true";
      image.src = FALLBACK_SCHOOL_PHOTO;
      return;
    }

    image.hidden = true;
  }

  function selectLoginTheme(theme: LoginTheme) {
    onThemeChange(theme);
    persistLoginTheme(theme);
  }

  const identifierLabel = allowedRoles.includes("siswa")
    ? "NISN"
    : allowedRoles.length > 0
      ? "NIP"
      : "Username";

  async function handleLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrorMessage("");

    const cleanUsername = username.trim();

    if (!cleanUsername || !password) {
      setErrorMessage(`${identifierLabel} dan password wajib diisi.`);
      return;
    }

    setLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke(
        "login-username",
        {
          body: {
            username: cleanUsername,
            password,
          },
        },
      );

      if (error) {
  console.error("Login function error:", error);

  if (error instanceof FunctionsHttpError) {
    const responseBody = await error.context.json().catch(() => null);

    throw new Error(
      responseBody?.error ||
      `Permintaan login gagal (HTTP ${error.context.status}).`
    );
  }

  throw new Error(
    "Fungsi login tidak dapat dihubungi. Periksa koneksi dan konfigurasi Supabase."
  );
}

      if (
        !data?.session?.access_token ||
        !data?.session?.refresh_token ||
        !data?.user?.id ||
        !data?.user?.role
      ) {
        throw new Error(data?.error || "Respons login tidak lengkap.");
      }

      const { data: sessionData, error: sessionError } =
        await supabase.auth.setSession({
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
        });

      if (sessionError || !sessionData.session) {
        throw new Error("Sesi login gagal disimpan. Silakan coba kembali.");
      }

      if (sessionData.session.user.id !== data.user.id) {
        await supabase.auth.signOut({ scope: "local" });
        throw new Error("Identitas akun tidak cocok. Login dibatalkan.");
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("id, role, status")
        .eq("id", sessionData.session.user.id)
        .maybeSingle();

      if (profileError) {
        console.error("Profil akun gagal diverifikasi:", profileError);
        throw new Error(
          `Profil akun belum dapat diverifikasi: ${profileError.message}. Sesi tidak dihapus; coba lagi.`,
        );
      }

      if (!profile || profile.status !== "active" || profile.role === "pending") {
        await supabase.auth.signOut({ scope: "local" });
        throw new Error("Akun belum aktif atau profil pengguna tidak tersedia.");
      }

      if (profile.role !== data.user.role) {
        await supabase.auth.signOut({ scope: "local" });
        throw new Error("Role akun tidak sesuai dengan profil aktif.");
      }

      if (allowedRoles.length > 0 && !allowedRoles.includes(data.user.role)) {
        await supabase.auth.signOut({ scope: "local" });
        throw new Error("Akun ini tidak memiliki akses untuk portal login yang dipilih.");
      }

      if (maintenanceActive && profile.role !== "super_admin") {
        const { error: signOutError } = await supabase.auth.signOut({ scope: "local" });
        if (signOutError) throw signOutError;
        setErrorMessage(maintenanceMessage);
        return;
      }

      onLoginSuccess({
        id: data.user.id,
        username: data.user.username,
        role: data.user.role,
      });
    } catch (error) {
      console.error("Login gagal:", error);
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Terjadi kesalahan. Silakan coba kembali.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className={`login-page login-theme-${loginTheme}`}>
      <div className="login-pattern" aria-hidden="true">
        <svg className="login-pattern-kawung" viewBox="0 0 180 180">
          <g fill="none" stroke="currentColor" strokeWidth="1">
            <ellipse cx="90" cy="48" rx="18" ry="34" />
            <ellipse cx="90" cy="132" rx="18" ry="34" />
            <ellipse cx="48" cy="90" rx="34" ry="18" />
            <ellipse cx="132" cy="90" rx="34" ry="18" />
            <path d="M90 64v52M64 90h52M73 73l34 34m0-34L73 107" />
          </g>
        </svg>
        <span className="login-pattern-corner login-pattern-corner-left" />
        <span className="login-pattern-corner login-pattern-corner-right" />
      </div>
      <div className="login-card-watermark" aria-hidden="true">
        <img
          src={FALLBACK_SCHOOL_PHOTO}
          alt=""
          onError={handleSchoolPhotoError}
        />
      </div>
      <section className="login-showcase" aria-label="Portal SMAN 7 MAROS">
        <div className="login-showcase-slideshow" aria-hidden="true">
          {SCHOOL_PHOTOS.map((photo, index) => (
            <img
              key={photo.src}
              src={photo.src}
              alt=""
              className={`login-showcase-photo${photoIndexes.active === index ? " is-active" : ""}${photoIndexes.previous === index && photoIndexes.active !== index ? " is-previous" : ""}`}
              onError={handleSchoolPhotoError}
            />
          ))}
        </div>
        <div className="login-showcase-backdrop" aria-hidden="true" />
        <svg
          className="login-kawung-ornament"
          viewBox="0 0 180 180"
          aria-hidden="true"
        >
          <g fill="none" stroke="currentColor" strokeWidth="1">
            <ellipse cx="90" cy="48" rx="18" ry="34" />
            <ellipse cx="90" cy="132" rx="18" ry="34" />
            <ellipse cx="48" cy="90" rx="34" ry="18" />
            <ellipse cx="132" cy="90" rx="34" ry="18" />
            <path d="M90 64v52M64 90h52M73 73l34 34m0-34L73 107" />
            <path d="M90 26v12m0 104v12M26 90h12m104 0h12" />
          </g>
        </svg>
        <div className="login-showcase-content">
          <div className="login-school-seal">
            <span className="login-seal-ring" aria-hidden="true" />
            <img src="/logo-sekolah.png" alt="Logo SMAN 7 MAROS" />
          </div>
          <p className="login-eyebrow">PORTAL DIGITAL SEKOLAH</p>
          <h1>SMAN 7 MAROS</h1>
          <p className="login-tagline">Berprestasi dalam karya, berakhlak dalam budaya.</p>
          <div className="login-identity" aria-hidden="true">
            <span />
            <strong>MAROS</strong>
            <span />
          </div>
          <div className="login-photo-gallery" role="group" aria-label="Galeri foto sekolah">
            {SCHOOL_PHOTOS.map((photo, index) => (
              <button
                key={photo.src}
                type="button"
                className={`login-photo-thumb${photoIndexes.active === index ? " active" : ""}`}
                onClick={() => selectSchoolPhoto(index)}
                aria-label={`Tampilkan foto: ${photo.caption}`}
                aria-pressed={photoIndexes.active === index}
              >
                <img
                  src={photo.src}
                  alt=""
                  onError={handleSchoolPhotoError}
                />
                <span className="login-photo-caption">{photo.caption}</span>
                <span className="login-photo-progress" aria-hidden="true" />
              </button>
            ))}
          </div>
        </div>
        <div className="login-batik login-batik-bottom" aria-hidden="true">
          <svg viewBox="0 0 640 100" preserveAspectRatio="xMidYMax meet">
            <g fill="none" stroke="currentColor" strokeWidth="1">
              <path d="M0 50h640M0 64h640M0 78h640" />
              <path d="M32 50 50 20l18 30-18 30zm36 0 18-30 18 30-18 30zm36 0 18-30 18 30-18 30zm36 0 18-30 18 30-18 30zm36 0 18-30 18 30-18 30zm36 0 18-30 18 30-18 30zm36 0 18-30 18 30-18 30zm36 0 18-30 18 30-18 30zm36 0 18-30 18 30-18 30zm36 0 18-30 18 30-18 30zm36 0 18-30 18 30-18 30zm36 0 18-30 18 30-18 30zm36 0 18-30 18 30-18 30zm36 0 18-30 18 30-18 30zm36 0 18-30 18 30-18 30zm36 0 18-30 18 30-18 30z" />
              <path d="M32 50c0-15 18-15 18 0s18 15 18 0m0 0c0-15 18-15 18 0s18 15 18 0m0 0c0-15 18-15 18 0s18 15 18 0m0 0c0-15 18-15 18 0s18 15 18 0m0 0c0-15 18-15 18 0s18 15 18 0m0 0c0-15 18-15 18 0s18 15 18 0m0 0c0-15 18-15 18 0s18 15 18 0m0 0c0-15 18-15 18 0s18 15 18 0m0 0c0-15 18-15 18 0s18 15 18 0m0 0c0-15 18-15 18 0s18 15 18 0m0 0c0-15 18-15 18 0s18 15 18 0m0 0c0-15 18-15 18 0s18 15 18 0m0 0c0-15 18-15 18 0s18 15 18 0m0 0c0-15 18-15 18 0s18 15 18 0m0 0c0-15 18-15 18 0s18 15 18 0m0 0c0-15 18-15 18 0s18 15 18 0" />
            </g>
          </svg>
        </div>
        <div className="login-floating-shape login-floating-shape-one" aria-hidden="true" />
        <div className="login-floating-shape login-floating-shape-two" aria-hidden="true" />
      </section>

      <section className="login-card">
        {["top-left", "top-right", "bottom-left", "bottom-right"].map((corner) => (
          <span className={`login-card-corner login-card-corner-${corner}`} key={corner} aria-hidden="true">
            <svg viewBox="0 0 56 56">
              <path d="M4 28V4h24M4 15h13M15 4v13M9 9l8 8m-8 0 8-8" />
              <circle cx="4" cy="4" r="2" />
            </svg>
          </span>
        ))}
        <div className="login-card-mobile-brand">
          <img src="/logo-sekolah.png" alt="Logo SMAN 7 MAROS" />
          <span>SMAN 7 MAROS</span>
        </div>
        <p className="login-card-eyebrow">Selamat datang kembali</p>
        <h2>Masuk ke Super App</h2>
        <p className="login-card-subtitle">
          Login {moduleName} untuk mengakses layanan digital sekolah.
        </p>
        {maintenanceActive && (
          <div className="login-maintenance-notice" role="status">
            <strong>Mode pemeliharaan aktif</strong>
            <span>
              Super Admin dapat masuk melalui portal Super App untuk mengelola
              pemeliharaan. Akses pengguna lain sementara dibatasi.
            </span>
          </div>
        )}

        <form onSubmit={handleLogin} className="login-form">
          <label htmlFor="username">{identifierLabel}</label>
          <input
            id="username"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder={`Masukkan ${identifierLabel}`}
            maxLength={100}
            required
            disabled={loading}
          />

          <label htmlFor="password">
            Password
          </label>
          <div className="login-password-wrap">
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Masukkan password"
              maxLength={256}
              required
              disabled={loading}
            />
            <button
              type="button"
              aria-label={showPassword ? "Sembunyikan password" : "Lihat password"}
              aria-pressed={showPassword}
              onClick={() => setShowPassword((value) => !value)}
              disabled={loading}
            >
              {showPassword ? "Sembunyikan" : "Lihat"}
            </button>
          </div>

          {errorMessage && (
            <div role="alert" className="login-error">
              {errorMessage}
            </div>
          )}

          <button type="submit" disabled={loading} className="login-submit">
            {loading ? "Memeriksa akun..." : `Masuk ke ${moduleName}`}
          </button>
        </form>

        <p className="login-footer">
          Akses hanya untuk akun sekolah yang telah diaktifkan administrator.
        </p>
        <div className="login-theme-picker" aria-label="Pilih warna halaman login">
          <span>Warna tema</span>
          <div className="login-theme-options">
            {loginThemes.map((theme) => (
              <button
                key={theme.id}
                type="button"
                className={loginTheme === theme.id ? "active" : ""}
                style={{ "--theme-preview": theme.color } as React.CSSProperties}
                onClick={() => selectLoginTheme(theme.id)}
                aria-label={`Gunakan tema ${theme.label}`}
                aria-pressed={loginTheme === theme.id}
                title={theme.label}
              />
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
