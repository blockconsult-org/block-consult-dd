"use client";

import * as React from "react";
import * as Tabs from "@radix-ui/react-tabs";
import { Activity, CheckCircle2, Monitor, Plug, Search } from "lucide-react";
import type { AiSettingsPatch } from "@/ai/settings";
import type { AiSettingsView, KeyProvider } from "@/ai/settings-view";
import type { ProviderId } from "@/ai/types";
import type { SecretStatus } from "@/lib/secrets";
import { ThemeSelect } from "@/components/shell/theme-select";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Select } from "@/components/ui/field";
import { useUnsavedChanges } from "@/components/ui/use-unsaved-changes";
import { cn } from "@/lib/utils";
import { ProviderConfig } from "./provider-config";
import type { KeyChangeResult } from "./key-field";
import { ResearchOptions } from "./research-options";
import { UsageSummary } from "./usage-summary";
import { errorText, sendJson } from "./request";

const SECTIONS = [
  { id: "providers", label: "AI providers", Icon: Plug },
  { id: "appearance", label: "Appearance", Icon: Monitor },
  { id: "research", label: "Research", Icon: Search },
  { id: "usage", label: "Usage", Icon: Activity },
] as const;

export function AiSettingsPanel({ initial }: { initial: AiSettingsView }) {
  const [view, setView] = React.useState(initial);
  const [selected, setSelected] = React.useState<ProviderId>(initial.settings.activeProvider ?? "anthropic");
  const [visited, setVisited] = React.useState<ProviderId[]>([selected]);
  const [section, setSection] = React.useState("providers");
  const [changingActive, setChangingActive] = React.useState(false);
  const [activeError, setActiveError] = React.useState<string | null>(null);
  const [activeMessage, setActiveMessage] = React.useState<string | null>(null);
  const [drafts, setDrafts] = React.useState<Record<string, boolean>>({});
  const saveQueue = React.useRef<Promise<void>>(Promise.resolve());
  const active = view.settings.activeProvider;
  const labelFor = (id: ProviderId) => view.providers.find((provider) => provider.id === id)?.label ?? id;
  useUnsavedChanges(Object.values(drafts).some(Boolean));

  React.useEffect(() => {
    const params = new URL(window.location.href).searchParams;
    const nextSection = params.get("section");
    const nextProvider = params.get("provider");
    if (SECTIONS.some((item) => item.id === nextSection)) setSection(nextSection!);
    const provider = initial.providers.find((item) => item.id === nextProvider)?.id;
    if (provider) { setSelected(provider); setVisited((current) => current.includes(provider) ? current : [...current, provider]); }
  }, [initial.providers]);

  function rememberLocation(nextSection: string, provider: ProviderId) {
    const url = new URL(window.location.href);
    url.searchParams.set("section", nextSection);
    url.searchParams.set("provider", provider);
    window.history.replaceState(null, "", url);
  }

  // Settings occupy one database row. Queue all settings/key writes and their refreshes.
  const enqueue = React.useCallback(<T,>(action: () => Promise<T>): Promise<T> => {
    const operation = saveQueue.current.then(action);
    saveQueue.current = operation.then(() => undefined, () => undefined);
    return operation;
  }, []);

  const saveSettings = React.useCallback((patch: AiSettingsPatch): Promise<void> => enqueue(async () => {
    setView((await sendJson("PUT", "/api/settings/ai", patch)) as AiSettingsView);
    window.dispatchEvent(new Event("bc:ai-settings"));
  }), [enqueue]);

  const changeKey = React.useCallback((provider: KeyProvider, key: string | null): Promise<KeyChangeResult> => enqueue(async () => {
    setActiveMessage(null);
    setActiveError(null);
    const status = await sendJson(key === null ? "DELETE" : "PUT", `/api/settings/ai/keys/${provider}`, key === null ? undefined : { key }) as SecretStatus;
    setView((current) => ({ ...current, keys: { ...current.keys, [provider]: status }, settings: { ...current.settings, activeProvider: key === null ? current.settings.activeProvider : current.settings.activeProvider ?? provider } }));
    window.dispatchEvent(new Event("bc:ai-settings"));
    try {
      setView((await sendJson("GET", "/api/settings/ai")) as AiSettingsView);
      return {};
    } catch {
      return { warning: `Key ${key === null ? "removed" : "saved"}, but the connection summary could not be refreshed. Reload Settings to check it.` };
    }
  }), [enqueue]);

  const onDraftChange = React.useCallback((id: string, dirty: boolean) => {
    setDrafts((current) => current[id] === dirty ? current : { ...current, [id]: dirty });
  }, []);

  async function activate(provider: ProviderId | null) {
    setChangingActive(true);
    setActiveError(null);
    setActiveMessage(null);
    try {
      await saveSettings({ activeProvider: provider });
      setActiveMessage(provider ? `${labelFor(provider)} is now active.` : "AI is off. Rule-based checks remain available.");
    } catch (error) {
      setActiveError(errorText(error));
    } finally {
      setChangingActive(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-card border border-line bg-surface px-5 py-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-medium text-fg">
            <span aria-hidden className={cn("h-2 w-2 shrink-0 rounded-full", active ? "bg-success" : "bg-faint")} />
            {active ? `Active: ${labelFor(active)}` : "AI is off"}
          </div>
          <p className="mt-1 text-xs leading-5 text-muted">{active ? "New research, intake extraction and report drafts use this provider." : "You can create cases, review evidence, run rule-based checks and export reports."}</p>
        </div>
        {active && <Button type="button" variant="outline" size="sm" disabled={changingActive} onClick={() => void activate(null)}>{changingActive ? "Saving…" : "Turn off AI"}</Button>}
        {(activeMessage || activeError) && <p role={activeError ? "alert" : "status"} className={cn("w-full text-sm", activeError ? "text-danger" : "text-success")}>{activeError ?? activeMessage}</p>}
      </div>

      <Tabs.Root value={section} onValueChange={(value) => { setSection(value); rememberLocation(value, selected); }}>
        <Tabs.List aria-label="Settings sections" className="mb-6 flex gap-1 overflow-x-auto rounded-lg border border-line bg-surface p-1">
          {SECTIONS.map(({ id, label, Icon }) => <Tabs.Trigger key={id} value={id} className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-md px-4 py-2 text-sm font-medium text-muted transition-colors duration-160 ease-standard hover:bg-elevated hover:text-fg data-[state=active]:bg-elevated data-[state=active]:text-fg">
            <Icon aria-hidden className="h-4 w-4" />{label}
            {(id === "providers" ? Object.entries(drafts).some(([key, value]) => key !== "research" && value) : drafts[id]) && <span aria-hidden title="Unsaved changes" className="h-1.5 w-1.5 rounded-full bg-warning" />}
          </Tabs.Trigger>)}
        </Tabs.List>

        <Tabs.Content value="providers" forceMount hidden={section !== "providers"} className="space-y-5">
          <div className="space-y-2">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0 flex-1 sm:max-w-md">
              <Field label="Configure provider">
                <Select value={selected} aria-describedby="configure-provider-hint" onChange={(event) => {
                  const provider = event.target.value as ProviderId;
                  setSelected(provider);
                  rememberLocation(section, provider);
                  setVisited((current) => current.includes(provider) ? current : [...current, provider]);
                }}>
                  {view.providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.label}{provider.id === active ? " (active)" : ""}</option>)}
                </Select>
              </Field>
            </div>
            {active === selected
              ? <span className="inline-flex min-h-11 items-center gap-2 text-sm text-success"><CheckCircle2 aria-hidden className="h-4 w-4" />Active provider</span>
              : <Button type="button" variant="outline" disabled={changingActive || Boolean(drafts[selected]) || Boolean(drafts[`${selected}-key`])} onClick={() => void activate(selected)}>{changingActive ? "Saving…" : "Use this provider"}</Button>}
          </div>
          <p id="configure-provider-hint" className="text-xs leading-5 text-muted">Switching here keeps your drafts and does not change the active provider.</p>
          </div>
          {view.providers.map(({ id }) => <div key={id} hidden={selected !== id}>
            {visited.includes(id) && <ProviderConfig provider={id} view={view} onSave={saveSettings} onKeyChange={changeKey} onDraftChange={onDraftChange} />}
          </div>)}
          <p className="text-xs leading-5 text-muted">AI requests send relevant case material to the selected provider. Saved keys are sent only to their own provider. Save connection changes before activating a provider.</p>
        </Tabs.Content>

        <Tabs.Content value="appearance" forceMount hidden={section !== "appearance"}>
          <Card>
            <CardHeader title="Appearance" subtitle="Choose a theme for this app. System follows your computer's appearance." />
            <CardBody>
              <div className="max-w-sm"><label htmlFor="settings-appearance" className="label">Theme</label><ThemeSelect id="settings-appearance" label="Theme" className="w-full" /></div>
              <p className="mt-3 text-xs text-muted">Theme changes apply immediately and are saved on this computer.</p>
            </CardBody>
          </Card>
        </Tabs.Content>
        <Tabs.Content value="research" forceMount hidden={section !== "research"}><ResearchOptions research={view.settings.research} onSave={saveSettings} onDraftChange={onDraftChange} /></Tabs.Content>
        <Tabs.Content value="usage" forceMount hidden={section !== "usage"}><UsageSummary providers={view.providers} active={section === "usage"} /></Tabs.Content>
      </Tabs.Root>
    </div>
  );
}
