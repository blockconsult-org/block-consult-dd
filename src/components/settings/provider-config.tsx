"use client";
import * as React from "react";
import type { AiSettingsPatch } from "@/ai/settings";
import type { AiSettingsView, KeyProvider } from "@/ai/settings-view";
import { EFFORT_LEVELS, type ConnectionCheck, type EffortLevel, type ModelOption, type ProviderId } from "@/ai/types";
import type { SecretStatus } from "@/lib/secrets";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/field";
import { cn } from "@/lib/utils";
import { errorText, sendJson } from "./request";

const EFFORT_LABELS: Record<EffortLevel, string> = {
  low: "Low: fastest, fewest tokens",
  medium: "Medium",
  high: "High (recommended)",
  xhigh: "Extra high",
  max: "Max: slowest, most thorough",
};

interface FormState {
  model: string;
  effort: EffortLevel;
  authMode: "api_key" | "environment";
  fallbacks: boolean;
  binaryPath: string;
}

function formFrom(view: AiSettingsView, provider: ProviderId): FormState {
  const s = view.settings;
  switch (provider) {
    case "anthropic":
      return { model: s.anthropic.model, effort: s.anthropic.effort, authMode: s.anthropic.authMode, fallbacks: s.anthropic.fallbacks, binaryPath: "" };
    case "openai":
      return { model: s.openai.model, effort: s.openai.effort, authMode: "api_key", fallbacks: false, binaryPath: "" };
    case "claude-code":
      return { model: s.claudeCode.model, effort: s.claudeCode.effort, authMode: "api_key", fallbacks: false, binaryPath: s.claudeCode.binaryPath };
    case "codex":
      return { model: s.codex.model, effort: s.codex.effort, authMode: "api_key", fallbacks: false, binaryPath: s.codex.binaryPath };
  }
}

function patchFrom(provider: ProviderId, f: FormState): AiSettingsPatch {
  const model = f.model.trim();
  switch (provider) {
    case "anthropic":
      return { anthropic: { model, effort: f.effort, authMode: f.authMode, fallbacks: f.fallbacks } };
    case "openai":
      return { openai: { model, effort: f.effort } };
    case "claude-code":
      return { claudeCode: { model, effort: f.effort, binaryPath: f.binaryPath.trim() } };
    case "codex":
      return { codex: { model, effort: f.effort, binaryPath: f.binaryPath.trim() } };
  }
}

function sameForm(a: FormState, b: FormState): boolean {
  return (
    a.model.trim() === b.model.trim() &&
    a.effort === b.effort &&
    a.authMode === b.authMode &&
    a.fallbacks === b.fallbacks &&
    a.binaryPath.trim() === b.binaryPath.trim()
  );
}

const isCli = (provider: ProviderId) => provider === "claude-code" || provider === "codex";

interface Props {
  provider: ProviderId;
  view: AiSettingsView;
  onSave: (patch: AiSettingsPatch) => Promise<boolean>;
  onKeyStatus: (provider: KeyProvider, status: SecretStatus) => void;
  onKeySaved: () => Promise<void>;
}

export function ProviderConfig({ provider, view, onSave, onKeyStatus, onKeySaved }: Props) {
  const saved = React.useMemo(() => formFrom(view, provider), [view, provider]);
  const [form, setForm] = React.useState<FormState>(saved);
  const previousSaved = React.useRef(saved);
  const [saving, setSaving] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [models, setModels] = React.useState<ModelOption[]>([]);
  const dirty = !sameForm(form, saved);
  const label = view.providers.find((p) => p.id === provider)?.label ?? provider;
  const formId = `provider-${provider}`;

  React.useEffect(() => {
    const previous = previousSaved.current;
    setForm((current) => sameForm(current, previous) ? saved : current);
    previousSaved.current = saved;
  }, [saved]);

  React.useEffect(() => {
    let cancelled = false;
    sendJson("GET", `/api/settings/ai/models?provider=${encodeURIComponent(provider)}`)
      .then((data) => {
        const list = typeof data === "object" && data !== null && "models" in data && Array.isArray(data.models) ? (data.models as ModelOption[]) : [];
        if (!cancelled) setModels(list);
      })
      .catch(() => {
        if (!cancelled) setModels([]);
      });
    return () => {
      cancelled = true;
    };
  }, [provider, view.keys.anthropic.updatedAt, view.keys.openai.updatedAt]);

  const save = React.useCallback(async (): Promise<boolean> => {
    if (!isCli(provider) && !form.model.trim()) {
      setFormError("Enter a model id.");
      return false;
    }
    setSaving(true);
    setFormError(null);
    const ok = await onSave(patchFrom(provider, form));
    setSaving(false);
    return ok;
  }, [form, onSave, provider]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setFormError(null);
    setForm((f) => ({ ...f, [key]: value }));
  };

  return (
    <Card>
      <CardHeader title={label} subtitle={subtitleFor(provider)} headingLevel={3} />
      <CardBody className="space-y-5">
        {provider === "anthropic" && (
          <>
            <fieldset className="space-y-2">
              <legend className="label">Authentication</legend>
              <RadioRow
                name={`${formId}-auth`}
                checked={form.authMode === "api_key"}
                onChange={() => set("authMode", "api_key")}
                title="API key saved in this app"
                hint="Stored encrypted on this computer."
              />
              <RadioRow
                name={`${formId}-auth`}
                checked={form.authMode === "environment"}
                onChange={() => set("authMode", "environment")}
                title="ANTHROPIC_API_KEY from the environment"
                hint={
                  view.anthropicEnvKey
                    ? "The variable is set for this app."
                    : "Not set for this app. Desktop apps opened from the Dock or Start menu usually don't see shell variables."
                }
              />
            </fieldset>
            {form.authMode === "api_key" && (
              <KeyField provider="anthropic" status={view.keys.anthropic} storageLabel={view.keyStorage.label} onStatus={onKeyStatus} onSaved={onKeySaved} />
            )}
          </>
        )}
        {provider === "openai" && (
          <KeyField provider="openai" status={view.keys.openai} storageLabel={view.keyStorage.label} onStatus={onKeyStatus} onSaved={onKeySaved} />
        )}
        {isCli(provider) && <CliSetup provider={provider} />}

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor={`${formId}-model`}>Model</Label>
            <Input
              id={`${formId}-model`}
              list={`${formId}-models`}
              value={form.model}
              placeholder={isCli(provider) ? "The CLI's default model" : "Model id"}
              onChange={(e) => set("model", e.target.value)}
              aria-describedby={`${formId}-model-hint`}
              autoComplete="off"
              spellCheck={false}
            />
            <datalist id={`${formId}-models`}>
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </datalist>
            <p id={`${formId}-model-hint`} className="mt-1 text-xs text-faint">
              {isCli(provider) ? "Leave empty to use the model your plan defaults to." : "Pick from the list or type a model id."}
            </p>
          </div>
          <div>
            <Label htmlFor={`${formId}-effort`}>Effort</Label>
            <Select id={`${formId}-effort`} value={form.effort} onChange={(e) => set("effort", e.target.value as EffortLevel)}>
              {EFFORT_LEVELS.map((level) => (
                <option key={level} value={level}>
                  {EFFORT_LABELS[level]}
                </option>
              ))}
            </Select>
            <p className="mt-1 text-xs text-faint">Higher effort reasons longer and uses more tokens or plan quota.</p>
          </div>
        </div>

        {isCli(provider) && (
          <div>
            <Label htmlFor={`${formId}-path`}>Program path (optional)</Label>
            <Input
              id={`${formId}-path`}
              value={form.binaryPath}
              placeholder="Found automatically"
              onChange={(e) => set("binaryPath", e.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
            <p className="mt-1 text-xs text-faint">
              Only needed when the app can’t find {provider === "codex" ? "codex" : "claude"} on its own, for example after a custom install.
            </p>
          </div>
        )}

        {provider === "anthropic" && (
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 accent-accent"
              checked={form.fallbacks}
              onChange={(e) => set("fallbacks", e.target.checked)}
            />
            <span>
              <span className="block text-sm text-fg">Allow fallback models</span>
              <span className="block text-xs leading-relaxed text-muted">
                If the selected model declines a request, Anthropic can answer with another Claude model instead of failing the run. The run
                notes say when this happened.
              </span>
            </span>
          </label>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" size="sm" onClick={() => void save()} disabled={!dirty || saving}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
          {dirty && !saving && (
            <Button type="button" size="sm" variant="ghost" onClick={() => setForm(saved)}>
              Discard
            </Button>
          )}
          {dirty && <span className="text-xs text-warning">Unsaved changes</span>}
          {formError && (
            <span role="alert" className="text-xs text-danger">
              {formError}
            </span>
          )}
        </div>

        <ConnectionTest provider={provider} beforeTest={dirty ? save : undefined} />
      </CardBody>
    </Card>
  );
}

function subtitleFor(provider: ProviderId): string {
  switch (provider) {
    case "anthropic":
      return "Claude models with Anthropic's web search and page reading. Billed to your Anthropic account.";
    case "openai":
      return "OpenAI models with OpenAI's web search. Billed to your OpenAI account.";
    case "claude-code":
      return "Runs your installed Claude Code with web search and page reading only. It cannot edit files or run commands.";
    case "codex":
      return "Runs your installed Codex CLI in a read-only sandbox with web search on.";
  }
}

function RadioRow({ name, checked, onChange, title, hint }: { name: string; checked: boolean; onChange: () => void; title: string; hint: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <input type="radio" name={name} checked={checked} onChange={onChange} className="mt-0.5 h-4 w-4 accent-accent" />
      <span>
        <span className="block text-sm text-fg">{title}</span>
        <span className="block text-xs text-muted">{hint}</span>
      </span>
    </label>
  );
}

const KEY_HELP: Record<KeyProvider, { placeholder: string; href: string; site: string }> = {
  anthropic: { placeholder: "sk-ant-…", href: "https://console.anthropic.com/settings/keys", site: "console.anthropic.com" },
  openai: { placeholder: "sk-…", href: "https://platform.openai.com/api-keys", site: "platform.openai.com" },
};

function KeyField({
  provider,
  status,
  storageLabel,
  onStatus,
  onSaved,
}: {
  provider: KeyProvider;
  status: SecretStatus;
  storageLabel: string;
  onStatus: (provider: KeyProvider, status: SecretStatus) => void;
  onSaved: () => Promise<void>;
}) {
  const [value, setValue] = React.useState("");
  const [editing, setEditing] = React.useState(!status.present);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const help = KEY_HELP[provider];
  const inputId = `key-${provider}`;

  async function saveKey(e: React.FormEvent) {
    e.preventDefault();
    if (!value.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const next = (await sendJson("PUT", `/api/settings/ai/keys/${provider}`, { key: value.trim() })) as SecretStatus;
      onStatus(provider, next);
      setValue("");
      setEditing(false);
      await onSaved();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  async function removeKey() {
    setBusy(true);
    setError(null);
    try {
      onStatus(provider, (await sendJson("DELETE", `/api/settings/ai/keys/${provider}`)) as SecretStatus);
      setEditing(true);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  if (status.present && !editing) {
    return (
      <div className="space-y-1.5">
        <span className="label">API key</span>
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-mono text-sm text-fg">{status.hint ?? "Saved"}</span>
          {!status.readable && <span className="text-xs text-warning">This key can’t be decrypted here. Enter it again.</span>}
          <Button type="button" size="sm" variant="outline" onClick={() => setEditing(true)} disabled={busy}>
            Replace
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => void removeKey()} disabled={busy}>
            Remove
          </Button>
        </div>
        <p className="text-xs text-faint">{storageLabel}.</p>
        {error && (
          <p role="alert" className="text-xs text-danger">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={(e) => void saveKey(e)} className="space-y-1.5">
      <Label htmlFor={inputId}>API key</Label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          id={inputId}
          type="password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={help.placeholder}
          autoComplete="off"
          spellCheck={false}
          aria-invalid={error ? true : undefined}
          aria-describedby={`${inputId}-hint${error ? ` ${inputId}-error` : ""}`}
          className={cn(error && "border-danger/60")}
        />
        <div className="flex shrink-0 gap-2">
          <Button type="submit" size="sm" disabled={busy || !value.trim()} className="h-9">
            {busy ? "Saving…" : "Save key"}
          </Button>
          {status.present && (
            <Button type="button" size="sm" variant="ghost" className="h-9" onClick={() => { setValue(""); setError(null); setEditing(false); }} disabled={busy}>
              Cancel
            </Button>
          )}
        </div>
      </div>
      <p id={`${inputId}-hint`} className="text-xs text-faint">
        Create a key at{" "}
        <a href={help.href} target="_blank" rel="noreferrer" className="text-link underline underline-offset-4 hover:decoration-2">
          {help.site}
        </a>
        . {storageLabel}; it is sent only to {provider === "anthropic" ? "Anthropic" : "OpenAI"}.
      </p>
      {error && (
        <p id={`${inputId}-error`} role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </form>
  );
}

function CliSetup({ provider }: { provider: "claude-code" | "codex" }) {
  const steps =
    provider === "claude-code"
      ? [
          <>
            Install Claude Code from{" "}
            <a href="https://claude.com/claude-code" target="_blank" rel="noreferrer" className="text-link underline underline-offset-4 hover:decoration-2">
              claude.com/claude-code
            </a>
            .
          </>,
          <>
            Open a terminal, run <code className="rounded bg-elevated px-1 font-mono text-xs text-fg">claude</code> once and sign in with your
            Claude account.
          </>,
          <>Come back here and test the connection.</>,
        ]
      : [
          <>
            Install the Codex CLI: <code className="rounded bg-elevated px-1 font-mono text-xs text-fg">npm install -g @openai/codex</code>.
          </>,
          <>
            Run <code className="rounded bg-elevated px-1 font-mono text-xs text-fg">codex login</code> in a terminal and sign in with your
            ChatGPT account.
          </>,
          <>Come back here and test the connection.</>,
        ];
  return (
    <div className="rounded-lg border border-line bg-elevated px-4 py-3">
      <p className="text-xs font-medium text-fg">Set up</p>
      <ol className="mt-1.5 list-decimal space-y-1 pl-4 text-xs leading-relaxed text-muted">
        {steps.map((step, i) => (
          <li key={i}>{step}</li>
        ))}
      </ol>
      <p className="mt-2 text-xs text-faint">Research counts toward your plan’s usage limits. Cost estimates are shown for API keys only.</p>
    </div>
  );
}

function ConnectionTest({ provider, beforeTest }: { provider: ProviderId; beforeTest?: () => Promise<boolean> }) {
  const [busy, setBusy] = React.useState<"check" | "prompt" | null>(null);
  const [result, setResult] = React.useState<ConnectionCheck | null>(null);

  async function run(mode: "check" | "prompt") {
    if (beforeTest && !(await beforeTest())) return;
    setBusy(mode);
    setResult(null);
    try {
      setResult((await sendJson("POST", "/api/settings/ai/test", { provider, mode })) as ConnectionCheck);
    } catch (err) {
      setResult({ ok: false, message: errorText(err) });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="border-t border-line pt-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant="outline" onClick={() => void run("check")} disabled={busy !== null}>
          {busy === "check" ? "Testing…" : "Test connection"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => void run("prompt")} disabled={busy !== null}>
          {busy === "prompt" ? "Waiting for the model…" : "Send a test prompt"}
        </Button>
      </div>
      <p className="mt-1.5 text-xs text-faint">
        The connection test checks sign-in and the model without using tokens. The test prompt sends one short request.
      </p>
      {result && (
        <div role="status" className="mt-3 rounded-lg border border-line px-3 py-2">
          <p className={cn("text-sm", result.ok ? "text-success" : "text-danger")}>
            {result.ok ? "Connected. " : "Not connected. "}
            <span className="text-fg">{result.message.replace(/^Connected\.\s*/, "")}</span>
          </p>
          {result.detail && <p className="mt-1 break-words font-mono text-xs text-faint">{result.detail}</p>}
        </div>
      )}
    </div>
  );
}
