"use client";
import * as React from "react";
import type { AiSettingsPatch } from "@/ai/settings";
import type { AiSettingsView, KeyProvider } from "@/ai/settings-view";
import type { ProviderId } from "@/ai/types";
import type { SecretStatus } from "@/lib/secrets";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { ProviderConfig } from "./provider-config";
import { ResearchOptions } from "./research-options";
import { UsageSummary } from "./usage-summary";
import { errorText, sendJson } from "./request";

const DESCRIPTIONS: Record<ProviderId, string> = {
  anthropic: "Your own Anthropic API key, billed per use. Web search and page reading run on Anthropic's servers.",
  openai: "Your own OpenAI API key, billed per use. Uses OpenAI's web search.",
  "claude-code": "Claude Code on this computer, signed in with your Claude Pro or Max plan. No API key needed.",
  codex: "The Codex CLI on this computer, signed in with your ChatGPT plan. No API key needed.",
};

function keyChip(status: SecretStatus): { text: string; tone: "ok" | "warn" | "none" } {
  if (!status.present) return { text: "No key", tone: "none" };
  if (!status.readable) return { text: "Key unreadable", tone: "warn" };
  return { text: `Key ${status.hint ?? "saved"}`, tone: "ok" };
}

function providerChip(view: AiSettingsView, id: ProviderId): { text: string; tone: "ok" | "warn" | "none" } {
  if (id === "anthropic") {
    if (view.settings.anthropic.authMode === "environment") {
      return view.anthropicEnvKey ? { text: "Environment key", tone: "ok" } : { text: "Environment", tone: "none" };
    }
    return keyChip(view.keys.anthropic);
  }
  if (id === "openai") return keyChip(view.keys.openai);
  return { text: "Local CLI", tone: "none" };
}

const CHIP_TONES = {
  ok: "bg-success/10 text-success ring-1 ring-success/25",
  warn: "bg-warning/10 text-warning ring-1 ring-warning/25",
  none: "bg-elevated text-muted ring-1 ring-line",
} as const;

export function AiSettingsPanel({ initial }: { initial: AiSettingsView }) {
  const [view, setView] = React.useState(initial);
  const [selected, setSelected] = React.useState<ProviderId>(initial.settings.activeProvider ?? "anthropic");
  const [visited, setVisited] = React.useState<ProviderId[]>([initial.settings.activeProvider ?? "anthropic"]);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  function selectProvider(provider: ProviderId) {
    setSelected(provider);
    setVisited((current) => current.includes(provider) ? current : [...current, provider]);
  }

  function navigateTabs(event: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    const last = view.providers.length - 1;
    const next = event.key === "ArrowRight" ? (index + 1) % view.providers.length
      : event.key === "ArrowLeft" ? (index + last) % view.providers.length
      : event.key === "Home" ? 0 : event.key === "End" ? last : null;
    if (next === null) return;
    event.preventDefault();
    const provider = view.providers[next]?.id;
    if (!provider) return;
    selectProvider(provider);
    document.getElementById(`settings-tab-${provider}`)?.focus();
  }

  const saveSettings = React.useCallback(async (patch: AiSettingsPatch): Promise<boolean> => {
    setSaving(true);
    setError(null);
    try {
      setView((await sendJson("PUT", "/api/settings/ai", patch)) as AiSettingsView);
      window.dispatchEvent(new Event("bc:ai-settings"));
      return true;
    } catch (err) {
      setError(errorText(err));
      return false;
    } finally {
      setSaving(false);
    }
  }, []);

  const onKeyStatus = React.useCallback((provider: KeyProvider, status: SecretStatus) => {
    setView((current) => ({ ...current, keys: { ...current.keys, [provider]: status } }));
  }, []);

  /** Saving a first key also makes that provider active on the server; reload to reflect it. */
  const reload = React.useCallback(async () => {
    try {
      setView((await sendJson("GET", "/api/settings/ai")) as AiSettingsView);
      window.dispatchEvent(new Event("bc:ai-settings"));
    } catch (err) {
      setError(errorText(err));
    }
  }, []);

  const active = view.settings.activeProvider;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="Choose an active provider"
          subtitle={
            active
              ? `AI research, narrative drafting and intake extraction use ${view.providers.find((p) => p.id === active)?.label ?? active}.`
              : "No provider is active. Cases can still run the rule-based checks."
          }
        />
        <CardBody>
          <fieldset>
            <legend className="sr-only">AI provider</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              {view.providers.map((provider) => {
                const chip = providerChip(view, provider.id);
                const isActive = active === provider.id;
                return (
                  <label
                    key={provider.id}
                    className={cn(
                      "relative flex cursor-pointer flex-col gap-1.5 rounded-xl border px-4 py-3 transition-colors duration-150 ease-out focus-within:ring-2 focus-within:ring-accent/40",
                      isActive ? "border-accent/60 bg-accent/10" : "border-line hover:border-line-strong",
                    )}
                  >
                    <input
                      type="radio"
                      name="ai-provider"
                      value={provider.id}
                      checked={isActive}
                      disabled={saving}
                      onChange={() => {
                        selectProvider(provider.id);
                        void saveSettings({ activeProvider: provider.id });
                      }}
                      className="sr-only"
                    />
                    <span className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-medium text-fg">{provider.label}</span>
                      <span className={cn("inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium", CHIP_TONES[chip.tone])}>
                        {chip.text}
                      </span>
                    </span>
                    <span className="text-xs leading-relaxed text-muted">{DESCRIPTIONS[provider.id]}</span>
                    {isActive && <span className="text-xs font-medium text-link">Active provider</span>}
                  </label>
                );
              })}
            </div>
          </fieldset>
          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
            {active && (
              <button
                type="button"
                className="text-muted underline-offset-2 transition-colors hover:text-fg hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                disabled={saving}
                onClick={() => void saveSettings({ activeProvider: null })}
              >
                Turn off AI and use rule-based checks only
              </button>
            )}
            {saving && <span role="status" className="text-faint">Saving…</span>}
            {error && (
              <span role="alert" className="text-danger">
                {error}
              </span>
            )}
          </div>
        </CardBody>
      </Card>

      <section aria-labelledby="provider-config-heading" className="space-y-4">
        <div><h2 id="provider-config-heading" className="text-lg font-semibold text-fg">Connection & model</h2><p className="mt-1 text-xs leading-relaxed text-muted">Configure any provider here. The active provider above handles new AI requests.</p></div>
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Configure provider">
        {view.providers.map((provider, index) => (
          <button
            key={provider.id}
            type="button"
            role="tab"
            id={`settings-tab-${provider.id}`}
            aria-controls={`settings-panel-${provider.id}`}
            aria-selected={selected === provider.id}
            tabIndex={selected === provider.id ? 0 : -1}
            onClick={() => selectProvider(provider.id)}
            onKeyDown={(event) => navigateTabs(event, index)}
            className={cn(
              "rounded-lg border px-4 py-2 text-sm transition-colors duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
              selected === provider.id ? "border-accent/50 bg-accent/10 text-fg" : "border-line bg-surface text-muted hover:text-fg",
            )}
          >
            {provider.label}
          </button>
        ))}
      </div>

      {view.providers.map(({ id }) => <div key={id} id={`settings-panel-${id}`} role="tabpanel" aria-labelledby={`settings-tab-${id}`} hidden={selected !== id} tabIndex={0}>
        {visited.includes(id) && <ProviderConfig provider={id} view={view} onSave={saveSettings} onKeyStatus={onKeyStatus} onKeySaved={reload} />}
      </div>)}
      </section>

      <ResearchOptions research={view.settings.research} onSave={saveSettings} />

      <UsageSummary providers={view.providers} />
    </div>
  );
}
