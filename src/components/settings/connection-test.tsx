"use client";

import * as React from "react";
import type { ConnectionCheck, ProviderId } from "@/ai/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { errorText, sendJson } from "./request";

export function ConnectionTest({ provider, fingerprint, dirty, disabled, onBusyChange }: {
  provider: ProviderId;
  fingerprint: string;
  dirty: boolean;
  disabled: boolean;
  onBusyChange: (busy: boolean) => void;
}) {
  const [busy, setBusy] = React.useState<"check" | "prompt" | null>(null);
  const [result, setResult] = React.useState<{ check: ConnectionCheck; fingerprint: string; at: string; mode: "check" | "prompt" } | null>(null);
  const inFlight = React.useRef(false);
  const currentResult = !dirty && result?.fingerprint === fingerprint ? result : null;
  const cli = provider === "codex" || provider === "claude-code";

  async function run(mode: "check" | "prompt") {
    if (inFlight.current || dirty || disabled) return;
    inFlight.current = true;
    setBusy(mode);
    onBusyChange(true);
    setResult(null);
    try {
      const check = (await sendJson("POST", "/api/settings/ai/test", { provider, mode })) as ConnectionCheck;
      setResult({ check, fingerprint, at: new Date().toLocaleTimeString(), mode });
      window.dispatchEvent(new Event("bc:ai-usage"));
    } catch (error) {
      setResult({ check: { ok: false, message: errorText(error) }, fingerprint, at: new Date().toLocaleTimeString(), mode });
    } finally {
      inFlight.current = false;
      setBusy(null);
      onBusyChange(false);
    }
  }

  return (
    <section aria-label="Connection test" className="space-y-3 border-t border-line pt-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-medium text-fg">{cli ? "CLI availability & sign-in" : "Connection test"}</h3>
        <span role="status" className={cn("text-xs", currentResult?.check.ok ? "text-success" : "text-muted")}>
          {busy ? "Test in progress…" : currentResult ? `${currentResult.mode === "prompt" ? "Prompt" : "Connection"} ${currentResult.check.ok ? "passed" : "failed"} at ${currentResult.at}` : "Not tested for these settings"}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant="outline" onClick={() => void run("check")} disabled={busy !== null || disabled || dirty}>{busy === "check" ? "Testing…" : "Test connection"}</Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => void run("prompt")} disabled={busy !== null || disabled || dirty}>{busy === "prompt" ? "Waiting for the model…" : "Send a test prompt"}</Button>
      </div>
      <p className="text-xs leading-5 text-muted">{dirty ? "Save or discard your connection and key drafts before testing. " : ""}{cli ? "The connection test checks the installed CLI and sign-in." : "The connection test checks credentials and model access without generating tokens."} A test prompt makes one AI request and may incur charges or use plan quota.</p>
      {disabled && !busy && !dirty && <p className="text-xs text-muted">Save a readable API key before testing this connection.</p>}
      {currentResult && <div role={currentResult.check.ok ? "status" : "alert"} className={cn("rounded-lg border px-4 py-3", currentResult.check.ok ? "border-success/30 bg-success/5" : "border-danger/30 bg-danger/5")}>
        <p className="text-sm text-fg">{currentResult.check.message}</p>
        {currentResult.check.detail && <p className="mt-1 break-words text-xs leading-5 text-muted">{currentResult.check.detail}</p>}
        {!currentResult.check.ok && <p className="mt-2 text-xs text-muted">Check the connection details, save any corrections and test again.</p>}
      </div>}
    </section>
  );
}
