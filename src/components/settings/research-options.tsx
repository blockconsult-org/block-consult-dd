"use client";

import * as React from "react";
import type { AiSettings, AiSettingsPatch, ResearchDepth } from "@/ai/settings";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Select } from "@/components/ui/field";
import { errorText } from "./request";

const DEPTHS: { id: ResearchDepth; title: string; detail: string }[] = [
  { id: "quick", title: "Quick", detail: "Requests up to 8 searches and 6 page reads." },
  { id: "standard", title: "Standard", detail: "Requests up to 20 searches and 15 page reads." },
  { id: "deep", title: "Deep", detail: "Requests up to 40 searches and 30 page reads. Uses the most time and tokens." },
];

export function ResearchOptions({ research, onSave, onDraftChange }: {
  research: AiSettings["research"];
  onSave: (patch: AiSettingsPatch) => Promise<void>;
  onDraftChange: (id: string, dirty: boolean) => void;
}) {
  const [draft, setDraft] = React.useState(research);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState(false);
  const dirty = draft.depth !== research.depth || draft.verifySources !== research.verifySources;
  React.useEffect(() => onDraftChange("research", dirty), [dirty, onDraftChange]);

  async function save() {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await onSave({ research: draft });
      setSaved(true);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader title="Research defaults" subtitle="These settings apply to future AI research runs with every provider." />
      <CardBody className="space-y-5">
        <div className="max-w-md">
          <Field label="Research depth" hint={DEPTHS.find((depth) => depth.id === draft.depth)?.detail}>
            <Select value={draft.depth} disabled={busy} onChange={(event) => { setDraft({ ...draft, depth: event.target.value as ResearchDepth }); setSaved(false); setError(null); }}>
              {DEPTHS.map((depth) => <option key={depth.id} value={depth.id}>{depth.title}</option>)}
            </Select>
          </Field>
        </div>
        <p className="text-xs leading-5 text-muted">CLI providers receive these budgets as instructions. They are not a guaranteed spending limit.</p>
        <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-line px-4 py-3">
          <input type="checkbox" className="mt-1 h-4 w-4 shrink-0 accent-accent" checked={draft.verifySources} disabled={busy} onChange={(event) => { setDraft({ ...draft, verifySources: event.target.checked }); setSaved(false); setError(null); }} />
          <span>
            <span className="block text-sm font-medium text-fg">Check quotes against cited pages</span>
            <span className="mt-1 block text-xs leading-5 text-muted">The app downloads each cited page from this computer and looks for the quote. Missing quotes are marked and lower the claim&apos;s confidence. A matching quote does not verify the claim itself.</span>
          </span>
        </label>
        <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
          <Button type="button" size="sm" disabled={!dirty || busy} onClick={() => void save()}>{busy ? "Saving…" : "Save research settings"}</Button>
          {dirty && <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => { setDraft(research); setError(null); setSaved(false); }}>Discard changes</Button>}
          <span role="status" className={dirty ? "text-xs text-warning" : "text-xs text-muted"}>{busy ? "Saving research settings…" : dirty ? "Unsaved changes" : saved ? "Research settings saved" : "All changes saved"}</span>
          {error && <p role="alert" className="w-full text-sm text-danger">{error} Your draft is kept. Try saving again.</p>}
        </div>
      </CardBody>
    </Card>
  );
}
