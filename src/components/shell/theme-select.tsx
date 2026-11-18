"use client";

import * as React from "react";
import { ChevronDown, Monitor, Moon, Sun } from "lucide-react";
import { applyStoredTheme, saveTheme, THEME_COOKIE_NAME, THEME_STORAGE_KEY, type ThemePreference } from "./theme";

export function ThemeSelect() {
  const [preference, setPreference] = React.useState<ThemePreference>("system");

  React.useEffect(() => {
    const sync = () => setPreference(applyStoredTheme(THEME_STORAGE_KEY, THEME_COOKIE_NAME));
    sync();
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onStorage = (event: StorageEvent) => { if (event.key === THEME_STORAGE_KEY) sync(); };
    media.addEventListener("change", sync);
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", sync);
    return () => {
      media.removeEventListener("change", sync);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", sync);
    };
  }, []);

  const Icon = preference === "system" ? Monitor : preference === "dark" ? Moon : Sun;
  return (
    <div className="relative shrink-0">
      <Icon aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted sm:left-3" />
      <select
        aria-label="Appearance"
        title={`Appearance: ${preference}`}
        value={preference}
        onChange={(event) => {
          const next = event.target.value as ThemePreference;
          setPreference(next);
          saveTheme(next);
        }}
        className="h-11 w-11 cursor-pointer appearance-none rounded-md border border-line-strong bg-surface px-0 text-transparent transition-colors duration-160 ease-standard hover:border-control hover:bg-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-link focus-visible:ring-offset-2 focus-visible:ring-offset-bg sm:h-10 sm:w-28 sm:pl-9 sm:pr-7 sm:text-xs sm:text-muted"
      >
        <option className="bg-surface text-fg" value="system">System</option>
        <option className="bg-surface text-fg" value="light">Light</option>
        <option className="bg-surface text-fg" value="dark">Dark</option>
      </select>
      <ChevronDown aria-hidden className="pointer-events-none absolute right-2 top-1/2 hidden h-3 w-3 -translate-y-1/2 text-faint sm:block" />
    </div>
  );
}
