"use client";

import * as React from "react";
import type { KeyProvider } from "@/ai/settings-view";
import type { SecretStatus } from "@/lib/secrets";
import { ConfirmRemoveButton } from "@/components/case/confirm-remove-button";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { errorText } from "./request";

const KEY_HELP = {
  anthropic: { placeholder: "sk-ant-…", href: "https://console.anthropic.com/settings/keys", site: "console.anthropic.com", label: "Claude API" },
  openai: { placeholder: "sk-…", href: "https://platform.openai.com/api-keys", site: "platform.openai.com", label: "OpenAI API" },
};

export interface KeyChangeResult { warning?: string }

export function KeyField({ provider, status, storageLabel, activatesProvider, active, disabled, onChange, onBusyChange, onDraftChange }: {
  provider: KeyProvider;
  status: SecretStatus;
  storageLabel: string;
  activatesProvider: boolean;
  active: boolean;
  disabled: boolean;
  onChange: (provider: KeyProvider, key: string | null) => Promise<KeyChangeResult>;
  onBusyChange: (busy: boolean) => void;
  onDraftChange: (dirty: boolean) => void;
}) {
  const [value, setValue] = React.useState("");
  const [editing, setEditing] = React.useState(!status.present);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);
  const help = KEY_HELP[provider];
  React.useEffect(() => onDraftChange(Boolean(value)), [value, onDraftChange]);

  async function change(key: string | null): Promise<boolean> {
    setBusy(true);
    onBusyChange(true);
    setError(null);
    setMessage(null);
    try {
      const result = await onChange(provider, key);
      setValue("");
      setEditing(key === null);
      setMessage(key === null ? "Key removed." : "Key saved securely.");
      setError(result.warning ?? null);
      return true;
    } catch (err) {
      setError(errorText(err));
      return false;
    } finally {
      setBusy(false);
      onBusyChange(false);
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-line bg-elevated/30 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm font-medium text-fg">Credentials</span>
        <span className={status.present && status.readable ? "text-xs text-success" : "text-xs text-muted"}>
          {status.present ? status.readable ? `Saved · ${status.hint ?? "••••"}` : "Saved key is unreadable" : "No key saved"}
        </span>
      </div>
      {!status.readable && status.present && <p className="text-xs text-warning">This key cannot be decrypted on this computer. Replace it to reconnect.</p>}
      {editing ? <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); if (value.trim()) void change(value.trim()); }}>
        <Field label={status.present ? "Replacement API key" : "API key"} error={error} hint={status.present ? "Your current key stays in use until you save the replacement." : `Create a key at ${help.site}.`}>
          <Input type="password" value={value} onChange={(event) => { setValue(event.target.value); setError(null); setMessage(null); }} placeholder={help.placeholder} autoComplete="off" spellCheck={false} disabled={busy || disabled} maxLength={400} required />
        </Field>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" size="sm" disabled={busy || disabled || !value.trim()}>{busy ? "Saving…" : status.present ? "Replace key" : "Save key"}</Button>
          {(status.present || value) && <Button type="button" size="sm" variant="ghost" disabled={busy || disabled} onClick={() => { setValue(""); setError(null); if (status.present) setEditing(false); }}>Cancel</Button>}
          {value && <span className="text-xs text-warning">Unsaved key</span>}
        </div>
        {activatesProvider && <p className="text-xs leading-5 text-muted">Saving a key while AI is off activates this provider. You can turn AI off at the top of Settings.</p>}
      </form> : <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant="outline" disabled={busy || disabled} onClick={() => { setEditing(true); setMessage(null); }}>Replace key</Button>
        <ConfirmRemoveButton label={`${help.label} key`} description={active ? "This key will be removed from this computer. New AI requests using this provider will fail until you save another key or change the active provider. Your case data stays available." : "This key will be removed from this computer. Your case data stays available."} disabled={busy || disabled} onRemove={() => change(null)} />
      </div>}
      <p className="text-xs leading-5 text-muted">{storageLabel}. <a href={help.href} target="_blank" rel="noreferrer" className="text-link underline underline-offset-4">Manage provider keys</a>.</p>
      {message && <p role="status" className="text-xs text-success">{message}</p>}
      {!editing && error && <p role="alert" className="text-xs text-danger">{error}</p>}
    </div>
  );
}
