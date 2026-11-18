"use client";
import * as React from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/field";

/** Only same-site paths are allowed as the return target. */
function safeNext(value: string | null): string {
  return value && value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\") ? value : "/";
}

export function UnlockForm() {
  const params = useSearchParams();
  const [token, setToken] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/unlock", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      });
      if (!res.ok) {
        const data: unknown = await res.json().catch(() => null);
        const message = typeof data === "object" && data !== null && "error" in data && typeof data.error === "string" ? data.error : null;
        throw new Error(message ?? "The token was not accepted.");
      }
      window.location.assign(safeNext(params.get("next")));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="mt-6 space-y-3">
      <div>
        <Label htmlFor="access-token">Access token</Label>
        <Input
          id="access-token"
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          autoComplete="current-password"
          required
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "access-token-error" : undefined}
        />
      </div>
      {error && (
        <p id="access-token-error" role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
      <Button type="submit" disabled={busy || !token}>
        {busy ? "Checking…" : "Unlock"}
      </Button>
    </form>
  );
}
