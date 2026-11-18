"use client";

import { useRef, useState } from "react";
import { Pencil, Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { useUnsavedChanges } from "@/components/ui/use-unsaved-changes";
import { apiPut } from "./api-client";
import { IntakeFields } from "./intake-fields";
import { intakeDraft, intakePayload, type IntakeDraft } from "./intake-draft";
import { useMutate } from "./use-mutate";
import type { CaseData } from "./types";

export function IntakeEditor({ data, children }: { data: CaseData; children: React.ReactNode }) {
  const editButton = useRef<HTMLButtonElement>(null);
  const projectInput = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<IntakeDraft>(() => intakeDraft(data.intake, data.projectName));
  const [baseline, setBaseline] = useState(draft);
  const [saved, setSaved] = useState(false);
  const { busy, error, run, setError } = useMutate();
  const dirty = editing && JSON.stringify(draft) !== JSON.stringify(baseline);
  useUnsavedChanges(dirty);

  function begin() {
    const current = intakeDraft(data.intake, data.projectName);
    setDraft(current);
    setBaseline(current);
    setError(null);
    setSaved(false);
    setEditing(true);
  }
  function cancel() {
    if (dirty && !window.confirm("Discard your unsaved intake changes?")) return;
    setEditing(false);
    setError(null);
    requestAnimationFrame(() => editButton.current?.focus());
  }
  async function save() {
    if (!draft.projectName.trim()) {
      setError("Enter a project name.");
      projectInput.current?.focus();
      return;
    }
    const ok = await run(async () => {
      const payload = intakePayload(draft, data.intake);
      await apiPut(`/api/cases/${data.id}/intake`, payload);
      setBaseline(draft);
      setSaved(true);
      setEditing(false);
    });
    if (!ok) setSaved(false);
    else requestAnimationFrame(() => editButton.current?.focus());
  }

  return <div>
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line p-4 sm:p-5">
      <div><h2 className="text-base font-semibold text-fg">Mandate & intake</h2><p className="mt-1 text-xs leading-5 text-muted">Opportunity details remain unverified until supported by evidence.</p></div>
      {!editing && <Button ref={editButton} type="button" size="sm" variant="outline" disabled={busy} onClick={begin}><Pencil aria-hidden className="h-3.5 w-3.5" />Edit intake</Button>}
    </div>
    {editing ? <form onSubmit={(event) => { event.preventDefault(); void save(); }} className="space-y-4 p-4 sm:p-5">
      <fieldset disabled={busy} className="space-y-4">
        <Field label="Project name" hint="Required. Also updates the case name."><Input ref={projectInput} name="projectName" aria-invalid={error === "Enter a project name." || undefined} value={draft.projectName} required onChange={(event) => setDraft({ ...draft, projectName: event.target.value })} autoFocus /></Field>
        <IntakeFields values={draft} onChange={(name, value) => { setDraft((current) => ({ ...current, [name]: value })); setSaved(false); }} />
      </fieldset>
      <div className="sticky bottom-3 z-10 flex flex-wrap items-center gap-3 rounded-lg border border-line-strong bg-surface p-3 shadow-sm">
        <Button type="submit" disabled={busy || !dirty}><Save aria-hidden className="h-4 w-4" />{busy ? "Saving…" : "Save intake"}</Button>
        <Button type="button" variant="ghost" disabled={busy} onClick={cancel}><X aria-hidden className="h-4 w-4" />Cancel</Button>
        <span role="status" className="text-xs text-muted">{busy ? "Saving intake…" : dirty ? "Unsaved intake changes" : "No unsaved changes"}</span>
      </div>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    </form> : <div className="p-4 sm:p-5">{saved && <p role="status" className="mb-3 text-sm text-success">Intake saved</p>}{children}</div>}
  </div>;
}
