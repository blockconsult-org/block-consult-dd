"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";

/** Loads the fictional example case (or opens it if already loaded). */
export function LoadExampleButton({ variant = "outline", size }: Pick<ButtonProps, "variant" | "size">) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function load() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/examples", { method: "POST" });
      const data: unknown = await res.json().catch(() => null);
      const id = typeof data === "object" && data !== null && "id" in data && typeof data.id === "string" ? data.id : null;
      if (!res.ok || !id) throw new Error("The example case could not be loaded.");
      router.push(`/cases/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The example case could not be loaded.");
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-1">
      <Button type="button" variant={variant} size={size} onClick={load} disabled={busy} aria-busy={busy}>
        {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
        {busy ? "Loading example…" : "Load example case"}
      </Button>
      {error && (
        <p role="alert" className="max-w-xs text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
