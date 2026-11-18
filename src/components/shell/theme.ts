export type ThemePreference = "system" | "light" | "dark";

export const THEME_STORAGE_KEY = "bc-dd-theme";
export const THEME_COOKIE_NAME = "bc_dd_theme";

/** Self-contained so the same logic can run before paint and after hydration. */
export function applyStoredTheme(storageKey: string, cookieName: string): ThemePreference {
  let saved: string | null | undefined;
  try {
    saved = document.cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
  } catch { /* A blocked cookie must not prevent system appearance. */ }
  if (saved !== "light" && saved !== "dark" && saved !== "system") {
    try { saved = window.localStorage.getItem(storageKey); } catch { /* Storage may be unavailable. */ }
  }
  const preference = saved === "light" || saved === "dark" ? saved : "system";
  const theme = preference === "system"
    ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
    : preference;
  document.documentElement.dataset.theme = theme;
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#08090a" : "#f7f8fa");
  return preference;
}

export const themeBootstrap = `(${applyStoredTheme.toString()})(${JSON.stringify(THEME_STORAGE_KEY)},${JSON.stringify(THEME_COOKIE_NAME)});`;

export function saveTheme(preference: ThemePreference) {
  // Host cookies survive the desktop app's changing localhost port between launches.
  try {
    document.cookie = `${THEME_COOKIE_NAME}=${preference}; Path=/; Max-Age=31536000; SameSite=Strict${window.location.protocol === "https:" ? "; Secure" : ""}`;
  } catch { /* localStorage remains a fallback. */ }
  try { window.localStorage.setItem(THEME_STORAGE_KEY, preference); } catch { /* Cookie or system appearance remains available. */ }
  // Apply the selected choice even when both persistence methods are blocked.
  const theme = preference === "system"
    ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
    : preference;
  document.documentElement.dataset.theme = theme;
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#08090a" : "#f7f8fa");
}
