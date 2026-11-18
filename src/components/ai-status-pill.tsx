"use client";
import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

interface Status {
  shortLabel: string | null;
  model: string | null;
}

function isStatus(value: unknown): value is Status {
  return typeof value === "object" && value !== null && "shortLabel" in value && "model" in value
    && (typeof value.shortLabel === "string" || value.shortLabel === null)
    && (typeof value.model === "string" || value.model === null);
}

/** Shows the selected provider, not a live connection test. */
export function AiStatusPill() {
  const pathname = usePathname();
  const [status, setStatus] = React.useState<Status | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    let request = 0;
    function refresh() {
      const current = ++request;
      fetch("/api/settings/ai/status", { cache: "no-store" })
        .then((res) => (res.ok ? res.json() : null))
        .then((data: unknown) => {
          if (!cancelled && request === current) setStatus(isStatus(data) ? data : null);
        })
        .catch(() => {
          if (!cancelled && request === current) setStatus(null);
        });
    }
    refresh();
    window.addEventListener("bc:ai-settings", refresh);
    return () => {
      cancelled = true;
      window.removeEventListener("bc:ai-settings", refresh);
    };
  }, [pathname]);

  if (!status) return null;
  const configured = Boolean(status.shortLabel);
  return (
    <Link
      href="/settings"
      title={configured ? `Selected AI provider: ${status.shortLabel}${status.model ? ` · ${status.model}` : ""}` : "AI is off. Open settings to select a provider."}
      className="hidden items-center gap-1.5 rounded-full border border-line px-3 py-1 text-xs text-muted transition-colors duration-150 ease-out hover:border-line-strong hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 md:inline-flex"
    >
      <span aria-hidden className={cn("h-1.5 w-1.5 rounded-full", configured ? "bg-info" : "bg-faint")} />
      {configured ? status.shortLabel : "AI off"}
    </Link>
  );
}
