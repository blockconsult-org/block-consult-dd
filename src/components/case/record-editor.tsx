"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Pencil, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DraftForm } from "@/components/ui/draft-form";
import { buildRecordPatch, recordDefinition, type RecordType } from "@/domain/record-edit";
import { apiPatch } from "./api-client";
import { isRecord } from "./types";
import { RecordFields } from "./record-fields";
import { MutationNotice } from "./mutation-notice";
import { useMutate } from "./use-mutate";

export function RecordEditor({ caseId, recordId, type }: { caseId: string; recordId: string; type: RecordType }) {
  const def = recordDefinition(type);
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  const baseline = useRef<FormData | null>(null);
  const requestVersion = useRef(0);
  const mutation = useMutate();
  const url = `/api/cases/${caseId}/records/${type}/${recordId}`;

  useEffect(() => {
    if (values && form.current) baseline.current = new FormData(form.current);
  }, [values]);

  async function load() {
    const version = ++requestVersion.current;
    setLoading(true);
    setValues(null);
    mutation.setError(null);
    setSaved(false);
    setDirty(false);
    try {
      const response = await fetch(url, { cache: "no-store" });
      const body: unknown = await response.json();
      if (version !== requestVersion.current) return;
      if (!response.ok || !isRecord(body)) throw new Error(isRecord(body) && typeof body.error === "string" ? body.error : "Could not load this record.");
      setValues(body);
    } catch (error) {
      if (version === requestVersion.current) mutation.setError(error instanceof Error ? error.message : "Could not load this record.");
    } finally { if (version === requestVersion.current) setLoading(false); }
  }

  function changeOpen(next: boolean) {
    if (mutation.busy) return;
    if (!next && dirty && !window.confirm("Discard unsaved record changes?")) return;
    setOpen(next);
    if (next) void load();
    else requestVersion.current += 1;
  }

  function changed() {
    if (form.current && baseline.current) setDirty(Object.keys(buildRecordPatch(def, new FormData(form.current), baseline.current)).length > 0);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!baseline.current) return;
    const patch = buildRecordPatch(def, new FormData(event.currentTarget), baseline.current);
    if (await mutation.run(() => apiPatch(url, patch))) {
      setDirty(false);
      setSaved(true);
      setOpen(false);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={changeOpen}>
      <div className="flex items-center gap-2">
        {saved && <span role="status" className="text-xs text-success">Saved</span>}
        <Dialog.Trigger asChild><Button type="button" size="sm" variant="outline" aria-label={`Edit ${def.label.toLowerCase()}`}><Pencil aria-hidden="true" className="h-3.5 w-3.5" />Edit</Button></Dialog.Trigger>
      </div>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />
        <Dialog.Content onEscapeKeyDown={(event) => { if (mutation.busy) event.preventDefault(); }} onPointerDownOutside={(event) => event.preventDefault()}
          className="fixed left-1/2 top-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-card border border-line bg-surface p-5 shadow-xl sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div><Dialog.Title className="text-xl font-semibold text-fg">Edit {def.label.toLowerCase()}</Dialog.Title><Dialog.Description className="mt-2 text-sm text-muted">Update the verified details for this case.</Dialog.Description></div>
            <Dialog.Close asChild><Button type="button" variant="ghost" size="icon" disabled={mutation.busy} aria-label="Close record editor"><X aria-hidden="true" className="h-4 w-4" /></Button></Dialog.Close>
          </div>
          {loading && <p role="status" className="py-8 text-sm text-muted">Loading record…</p>}
          {!loading && !values && <div className="mt-5 space-y-3"><MutationNotice error={mutation.error} /><Button type="button" variant="outline" onClick={() => void load()}>Try again</Button></div>}
          {values && <DraftForm ref={form} saved={saved} onInput={changed} onChange={changed} onSubmit={(event) => void submit(event)} className="mt-5 space-y-5">
            <fieldset disabled={mutation.busy} className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2"><legend className="sr-only">{def.label} details</legend><RecordFields def={def} values={values} editing /></fieldset>
            {type === "token" && <p className="text-xs text-muted">This editor changes token details. Existing allocation and unlock schedules are retained.</p>}
            <MutationNotice error={mutation.error} />
            <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 border-t border-line bg-surface py-4">
              <span className="text-xs text-muted">{mutation.busy ? "Saving changes…" : dirty ? "Unsaved changes" : "No unsaved changes"}</span>
              <div className="flex gap-2"><Dialog.Close asChild><Button type="button" variant="outline" disabled={mutation.busy}>Cancel</Button></Dialog.Close><Button type="submit" disabled={!dirty || mutation.busy} aria-busy={mutation.busy}>{mutation.busy ? "Saving…" : "Save changes"}</Button></div>
            </div>
          </DraftForm>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
