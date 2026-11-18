"use client";

import * as React from "react";
import type { AiSettingsPatch } from "@/ai/settings";
import type { AiSettingsView, KeyProvider } from "@/ai/settings-view";
import { EFFORT_LEVELS, type EffortLevel, type ModelOption, type ProviderId } from "@/ai/types";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/field";
import { ConnectionTest } from "./connection-test";
import { KeyField, type KeyChangeResult } from "./key-field";
import { errorText, sendJson } from "./request";

const EFFORT_LABELS: Record<EffortLevel, string> = {
  low: "Low", medium: "Medium", high: "High", xhigh: "Extra high", max: "Maximum",
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
    case "anthropic": return { model: s.anthropic.model, effort: s.anthropic.effort, authMode: s.anthropic.authMode, fallbacks: s.anthropic.fallbacks, binaryPath: "" };
    case "openai": return { model: s.openai.model, effort: s.openai.effort, authMode: "api_key", fallbacks: false, binaryPath: "" };
    case "claude-code": return { model: s.claudeCode.model, effort: s.claudeCode.effort, authMode: "api_key", fallbacks: false, binaryPath: s.claudeCode.binaryPath };
    case "codex": return { model: s.codex.model, effort: s.codex.effort, authMode: "api_key", fallbacks: false, binaryPath: s.codex.binaryPath };
  }
}

function patchFrom(provider: ProviderId, form: FormState): AiSettingsPatch {
  const model = form.model.trim();
  switch (provider) {
    case "anthropic": return { anthropic: { model, effort: form.effort, authMode: form.authMode, fallbacks: form.fallbacks } };
    case "openai": return { openai: { model, effort: form.effort } };
    case "claude-code": return { claudeCode: { model, effort: form.effort, binaryPath: form.binaryPath.trim() } };
    case "codex": return { codex: { model, effort: form.effort, binaryPath: form.binaryPath.trim() } };
  }
}

function sameForm(a: FormState, b: FormState): boolean {
  return a.model.trim() === b.model.trim() && a.effort === b.effort && a.authMode === b.authMode && a.fallbacks === b.fallbacks && a.binaryPath.trim() === b.binaryPath.trim();
}

const isCli = (provider: ProviderId) => provider === "claude-code" || provider === "codex";

interface Props {
  provider: ProviderId;
  view: AiSettingsView;
  onSave: (patch: AiSettingsPatch) => Promise<void>;
  onKeyChange: (provider: KeyProvider, key: string | null) => Promise<KeyChangeResult>;
  onDraftChange: (id: string, dirty: boolean) => void;
}

export function ProviderConfig({ provider, view, onSave, onKeyChange, onDraftChange }: Props) {
  const saved = React.useMemo(() => formFrom(view, provider), [view, provider]);
  const [form, setForm] = React.useState<FormState>(saved);
  const previousSaved = React.useRef(saved);
  const [saving, setSaving] = React.useState(false);
  const [testing, setTesting] = React.useState(false);
  const [keyBusy, setKeyBusy] = React.useState(false);
  const [keyDirty, setKeyDirty] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [savedMessage, setSavedMessage] = React.useState(false);
  const [models, setModels] = React.useState<ModelOption[]>([]);
  const [modelsLoading, setModelsLoading] = React.useState(false);
  const [modelsError, setModelsError] = React.useState<string | null>(null);
  const [modelRefresh, setModelRefresh] = React.useState(0);
  const [customModel, setCustomModel] = React.useState(false);
  const dirty = !sameForm(form, saved);
  const busy = saving || testing || keyBusy;
  const label = view.providers.find((item) => item.id === provider)?.label ?? provider;
  const keyStatus = provider === "anthropic" || provider === "openai" ? view.keys[provider] : null;
  const formId = `provider-${provider}`;
  const fingerprint = JSON.stringify([saved, keyStatus?.updatedAt, keyStatus?.present, keyStatus?.readable, view.anthropicEnvKey]);

  React.useEffect(() => onDraftChange(provider, dirty), [dirty, onDraftChange, provider]);
  React.useEffect(() => onDraftChange(`${provider}-key`, keyDirty), [keyDirty, onDraftChange, provider]);
  React.useEffect(() => {
    const previous = previousSaved.current;
    setForm((current) => sameForm(current, previous) ? saved : current);
    previousSaved.current = saved;
  }, [saved]);

  React.useEffect(() => {
    let cancelled = false;
    setModelsLoading(true);
    setModelsError(null);
    sendJson("GET", `/api/settings/ai/models?provider=${encodeURIComponent(provider)}`)
      .then((data) => {
        if (cancelled) return;
        const result = data as { models?: ModelOption[]; error?: string };
        setModels(Array.isArray(result.models) ? result.models : []);
        setModelsError(result.error ?? null);
      })
      .catch((error: unknown) => { if (!cancelled) setModelsError(errorText(error)); })
      .finally(() => { if (!cancelled) setModelsLoading(false); });
    return () => { cancelled = true; };
  }, [provider, keyStatus?.updatedAt, saved.authMode, modelRefresh]);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isCli(provider) && !form.model.trim()) { setFormError("Enter a model ID."); return; }
    setSaving(true);
    setFormError(null);
    setSavedMessage(false);
    try {
      await onSave(patchFrom(provider, form));
      setSavedMessage(true);
    } catch (error) {
      setFormError(errorText(error));
    } finally {
      setSaving(false);
    }
  }

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setFormError(null);
    setSavedMessage(false);
    setForm((current) => ({ ...current, [key]: value }));
  };
  const choices = [...models];
  if (isCli(provider) && !choices.some((model) => model.id === "")) choices.unshift({ id: "", label: "CLI default model" });
  if (saved.model && !choices.some((model) => model.id === saved.model)) choices.unshift({ id: saved.model, label: saved.model });
  const modelSelection = customModel || !choices.some((model) => model.id === form.model) ? "custom" : `model:${form.model}`;
  const connectionMissing = keyStatus && (provider !== "anthropic" || form.authMode === "api_key") && (!keyStatus.present || !keyStatus.readable);

  return (
    <Card>
      <CardHeader title={label} subtitle={isCli(provider) ? "Uses the CLI installed and signed in on this computer." : "Uses your own API account. Provider usage is billed separately."} />
      <CardBody className="space-y-5">
        <div className="grid gap-6 lg:grid-cols-2">
        <div className="min-w-0 space-y-4">
        {provider === "anthropic" && <Field label="Authentication" hint={form.authMode === "environment" ? (view.anthropicEnvKey ? "An environment key is available to this app." : "No environment key is available to this app. Use a saved API key or configure the environment before testing.") : undefined}>
          <Select value={form.authMode} disabled={busy} onChange={(event) => set("authMode", event.target.value as FormState["authMode"])}>
            <option value="api_key">API key saved in this app</option><option value="environment">Environment key</option>
          </Select>
        </Field>}
        {keyStatus && <div hidden={provider === "anthropic" && form.authMode !== "api_key"}>
          <KeyField provider={provider as KeyProvider} status={keyStatus} storageLabel={view.keyStorage.label} activatesProvider={!view.settings.activeProvider} active={view.settings.activeProvider === provider} disabled={saving || testing} onChange={onKeyChange} onBusyChange={setKeyBusy} onDraftChange={setKeyDirty} />
        </div>}
        {isCli(provider) && <details className="rounded-lg border border-line bg-elevated/40 px-4 py-3">
          <summary className="cursor-pointer text-sm font-medium text-fg">CLI setup instructions</summary>
          <div className="mt-3 space-y-2 text-xs leading-5 text-muted">
            <p>{provider === "codex" ? <>Install the Codex CLI with <code className="break-all font-mono text-fg">npm install -g @openai/codex</code>, then run <code className="font-mono text-fg">codex login</code> in a terminal.</> : <>Install <a href="https://claude.com/claude-code" target="_blank" rel="noreferrer" className="text-link underline underline-offset-4">Claude Code</a>, then run <code className="font-mono text-fg">claude</code> in a terminal and sign in.</>}</p>
            <p>Test the connection below to check availability and sign-in. Research uses your account&apos;s limits; API authentication can incur API charges.</p>
          </div>
        </details>}
        </div>

        <form id={`${formId}-settings`} onSubmit={(event) => void save(event)} className="min-w-0 lg:border-l lg:border-line lg:pl-6">
          <fieldset disabled={busy} className="min-w-0 space-y-5">
            <legend className="sr-only">{label} configuration</legend>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-1">
              <div className="space-y-3">
                <Field label="Model" id={`${formId}-model`} hint={isCli(provider) ? "Choose CLI default to use your account's default model." : "Choose a model or enter a custom model ID."}>
                  <Select value={modelSelection} disabled={busy} onChange={(event) => {
                    const value = event.target.value;
                    setCustomModel(value === "custom");
                    if (value !== "custom") set("model", value.slice(6));
                  }}>
                    {choices.map((model) => <option key={model.id} value={`model:${model.id}`}>{model.label}</option>)}
                    <option value="custom">Custom model ID</option>
                  </Select>
                </Field>
                {modelSelection === "custom" && <Field label="Custom model ID" error={formError && !form.model.trim() ? formError : undefined}>
                  <Input value={form.model} maxLength={120} required={!isCli(provider)} onChange={(event) => set("model", event.target.value)} autoComplete="off" spellCheck={false} placeholder={isCli(provider) ? "Leave empty for CLI default" : "Enter a model ID"} />
                </Field>}
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                  {modelsLoading ? <span role="status">Loading model choices…</span> : <button type="button" disabled={busy} className="rounded-sm text-link underline underline-offset-4" onClick={() => setModelRefresh((count) => count + 1)}>Refresh model list</button>}
                  {modelsError && <span role="alert">Model list unavailable. You can enter an ID or retry.</span>}
                </div>
              </div>
              <Field label="Effort" hint="Higher effort takes longer and uses more tokens or plan quota.">
                <Select value={form.effort} disabled={busy} onChange={(event) => set("effort", event.target.value as EffortLevel)}>
                  {EFFORT_LEVELS.map((level) => <option key={level} value={level}>{EFFORT_LABELS[level]}</option>)}
                </Select>
              </Field>
            </div>
            {isCli(provider) && <Field label="Program path (optional)" hint="Leave empty to find the CLI automatically. Set a path if the connection test cannot find it.">
              <Input value={form.binaryPath} maxLength={1024} placeholder="Find automatically" onChange={(event) => set("binaryPath", event.target.value)} autoComplete="off" spellCheck={false} />
            </Field>}
            {provider === "anthropic" && <label className="flex cursor-pointer items-start gap-3">
              <input type="checkbox" className="mt-1 h-4 w-4 shrink-0 accent-accent" checked={form.fallbacks} onChange={(event) => set("fallbacks", event.target.checked)} />
              <span><span className="block text-sm text-fg">Allow fallback models</span><span className="mt-1 block text-xs leading-5 text-muted">If this model declines a request, another Claude model can answer. The run notes record the change.</span></span>
            </label>}
          </fieldset>
        </form>
        </div>
          <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
            <Button type="submit" form={`${formId}-settings`} size="sm" disabled={!dirty || busy}>{saving ? "Saving…" : "Save changes"}</Button>
            {dirty && <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => { setForm(saved); setFormError(null); setSavedMessage(false); setCustomModel(false); }}>Discard changes</Button>}
            <span role="status" className={dirty ? "text-xs text-warning" : "text-xs text-muted"}>{saving ? "Saving connection settings…" : dirty ? "Unsaved changes" : savedMessage ? "Connection settings saved" : "All changes saved"}</span>
            {formError && <p role="alert" className="w-full text-sm text-danger">{formError} Your draft is kept.</p>}
          </div>
        <ConnectionTest provider={provider} fingerprint={fingerprint} dirty={dirty || keyDirty} disabled={saving || keyBusy || Boolean(connectionMissing)} onBusyChange={setTesting} />
      </CardBody>
    </Card>
  );
}
