export const loginThemes = [
  { id: "maros", label: "Hijau Maros", color: "#0b6951" },
  { id: "biru", label: "Biru Akademik", color: "#315da8" },
  { id: "ungu", label: "Ungu Elegan", color: "#7357a5" },
  { id: "merah", label: "Merah Semangat", color: "#a84444" },
  { id: "emas", label: "Emas Tradisional", color: "#9a702d" },
] as const;

export type LoginTheme = (typeof loginThemes)[number]["id"];

const loginThemeStorageKey = "sman7-login-theme";

export function getInitialLoginTheme(): LoginTheme {
  const savedTheme = window.localStorage.getItem(loginThemeStorageKey);
  return loginThemes.some((theme) => theme.id === savedTheme)
    ? savedTheme as LoginTheme
    : "maros";
}

export function persistLoginTheme(theme: LoginTheme) {
  window.localStorage.setItem(loginThemeStorageKey, theme);
}
