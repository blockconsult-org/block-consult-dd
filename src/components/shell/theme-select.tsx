"use client";

import * as React from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { Select } from "@/components/ui/field";
import { cn } from "@/lib/utils";
import { applyStoredTheme, saveTheme, THEME_CHANGE_EVENT, THEME_COOKIE_NAME, THEME_STORAGE_KEY, type ThemePreference } from "./theme";

export function ThemeSelect({ id, label = "Appearance", className, compact = false }: { id?: string; label?: string; className?: string; compact?: boolean }) {
  const [preference, setPreference] = React.useState<ThemePreference>("system");

  React.useEffect(() => {
    const sync = () => setPreference(applyStoredTheme(THEME_STORAGE_KEY, THEME_COOKIE_NAME));
    sync();
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onStorage = (event: StorageEvent) => { if (event.key === THEME_STORAGE_KEY) sync(); };
    const onTheme = (event: Event) => {
      if (event instanceof CustomEvent && (event.detail === "light" || event.detail === "dark" || event.detail === "system")) setPreference(event.detail);
    };
    media.addEventListener("change", sync);
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", sync);
    window.addEventListener(THEME_CHANGE_EVENT, onTheme);
    return () => {
      media.removeEventListener("change", sync);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", sync);
      window.removeEventListener(THEME_CHANGE_EVENT, onTheme);
    };
  }, []);

  const Icon = preference === "system" ? Monitor : preference === "dark" ? Moon : Sun;
  return (
    <div className={cn("relative w-36 shrink-0", compact && "w-11 sm:w-36", className)}>
      <Icon aria-hidden className={cn("pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-muted", compact && "left-3.5 sm:left-3")} />
      <Select
        id={id}
        aria-label={label}
        title={`Appearance: ${preference}`}
        value={preference}
        onChange={(event) => {
          const next = event.target.value as ThemePreference;
          setPreference(next);
          saveTheme(next);
        }}
        className={cn("pl-9", compact && "px-0 [&>span:first-child]:invisible [&>svg]:hidden sm:pl-9 sm:pr-10 sm:[&>span:first-child]:visible sm:[&>svg]:block")}
      >
        <option className="bg-surface text-fg" value="system">System</option>
        <option className="bg-surface text-fg" value="light">Light</option>
        <option className="bg-surface text-fg" value="dark">Dark</option>
      </Select>
    </div>
  );
}
