import { useState } from "react";
import { supabase } from "./lib/supabase";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { loginThemes, persistLoginTheme, type LoginTheme } from "./loginThemes";
import "./LoginTemp.css";

type LoginProps = {
  moduleName?: string;
  allowedRoles?: string[];
  loginTheme: LoginTheme;
  onThemeChange: (theme: LoginTheme) => void;
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
  onLoginSuccess,
}: LoginProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
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
        <span className="login-pattern-corner login-pattern-corner-left" />
        <span className="login-pattern-corner login-pattern-corner-right" />
      </div>
      <div className="login-card-watermark" aria-hidden="true">
        <img src="/login-school-photo.jpg" alt="" />
      </div>
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

      <section className="login-showcase" aria-label="Portal SMAN 7 Maros">
        <div className="login-showcase-backdrop" aria-hidden="true" />
        <div className="login-showcase-content">
          <div className="login-school-seal">
            <span className="login-seal-ring" aria-hidden="true" />
            <img src="/logo-sekolah.png" alt="Logo SMAN 7 Maros" />
          </div>
          <p className="login-eyebrow">PORTAL DIGITAL SEKOLAH</p>
          <h1>SMAN 7 Maros</h1>
          <p className="login-tagline">Berprestasi dalam karya, berakhlak dalam budaya.</p>
          <div className="login-identity" aria-hidden="true">
            <span />
            <strong>MAROS</strong>
            <span />
          </div>
        </div>
        <div className="login-batik login-batik-bottom" aria-hidden="true" />
        <div className="login-floating-shape login-floating-shape-one" aria-hidden="true" />
        <div className="login-floating-shape login-floating-shape-two" aria-hidden="true" />
      </section>

      <section className="login-card">
        <div className="login-card-mobile-brand">
          <img src="/logo-sekolah.png" alt="" />
          <span>SMAN 7 MAROS</span>
        </div>
        <p className="login-card-eyebrow">Selamat datang kembali</p>
        <h2>Masuk ke Super App</h2>
        <p className="login-card-subtitle">
          Login {moduleName} untuk mengakses layanan digital sekolah.
        </p>

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
      </section>
    </main>
  );
}
