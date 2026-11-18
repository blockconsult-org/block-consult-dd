"use client";
import { useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, Field } from "@/components/ui/field";
import { useMutate } from "./use-mutate";
import { apiPost } from "./api-client";
import type { CaseData } from "./types";
import { RECORD_DEFS, buildRecordData, type RecordDef } from "@/domain/record-fields";
import { DraftForm } from "@/components/ui/draft-form";
import { RecordFields } from "./record-fields";
import { RecordEditor } from "./record-editor";
import { MutationNotice } from "./mutation-notice";
import { fmtUsd, titleCase } from "@/lib/utils";

export function RecordsTab({ data }: { data: CaseData }) {
  const { busy, error, success, run } = useMutate();
  const [type, setType] = useState("entity");
  const recordCount = data.entities.length + data.people.length + data.tokens.length + data.contracts.length + data.markets.length + data.stablecoins.length + data.rwaAssets.length;

  async function submit(e: FormEvent<HTMLFormElement>, def: RecordDef) {
    e.preventDefault();
    const form = e.currentTarget;
    const payload = { type: def.type, data: buildRecordData(def, new FormData(form)) };
    if (await run(() => apiPost(`/api/cases/${data.id}/records`, payload), { success: `${def.label} added.` })) form.reset();
  }

  return (
    <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-2">
      <Card>
        <CardHeader title="Add structured record" subtitle="Capture verified data. Leave unknown values blank. Drafts stay here when you switch record types." />
        <CardBody>
          <Field label="Record type" className="mb-4">
            <Select value={type} disabled={busy} onChange={(e) => setType(e.target.value)}>
              {RECORD_DEFS.map((d) => <option key={d.type} value={d.type}>{d.label}</option>)}
            </Select>
          </Field>
          {RECORD_DEFS.map((def) => (
          <DraftForm onSubmit={(event) => void submit(event, def)} key={def.type} hidden={type !== def.type} className={type !== def.type ? "hidden" : ""}>
            <fieldset disabled={busy} className="min-w-0 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <legend className="sr-only">Add {def.label.toLowerCase()}</legend>
            <RecordFields def={def} />
            <div className="sm:col-span-2">
              <Button type="submit" disabled={busy} aria-busy={busy}>{busy ? "Saving…" : `Add ${def.label.toLowerCase()}`}</Button>
              <div className="mt-3"><MutationNotice error={error} success={success} /></div>
            </div>
            </fieldset>
          </DraftForm>
          ))}
        </CardBody>
      </Card>

      <div className="min-w-0 space-y-4">
        <div className="flex items-center justify-between gap-3"><h2 className="section-heading">Case records</h2><span className="text-sm tabular-nums text-muted">{recordCount} total</span></div>
        {recordCount === 0 && <div className="empty-state"><p className="font-medium text-fg">No structured records yet</p><p className="mt-2">Choose a record type and add the people, organisations or assets you have verified.</p></div>}
        <RecordGroup title="Entities" count={data.entities.length}>
          {data.entities.map((e) => <Row key={e.id} action={<RecordEditor caseId={data.id} recordId={e.id} type="entity" />} a={e.name} b={`${titleCase(e.entityType)}${e.jurisdiction ? " · " + e.jurisdiction : ""}`} />)}
        </RecordGroup>
        <RecordGroup title="People" count={data.people.length}>
          {data.people.map((p) => <Row key={p.id} action={<RecordEditor caseId={data.id} recordId={p.id} type="person" />} a={p.fullName} b={`confidence ${p.confidence}`} />)}
        </RecordGroup>
        <RecordGroup title="Tokens" count={data.tokens.length}>
          {data.tokens.map((t) => <Row key={t.id} action={<RecordEditor caseId={data.id} recordId={t.id} type="token" />} a={`${t.name}${t.symbol ? " (" + t.symbol + ")" : ""}`} b={`${t.allocations} alloc · ${t.unlocks} unlocks`} />)}
        </RecordGroup>
        <RecordGroup title="Contracts" count={data.contracts.length}>
          {data.contracts.map((t) => <Row key={t.id} action={<RecordEditor caseId={data.id} recordId={t.id} type="contract" />} a={`${t.chain}: ${t.address}`} b={t.verified ? "verified" : "unverified"} />)}
        </RecordGroup>
        <RecordGroup title="Markets" count={data.markets.length}>
          {data.markets.map((m) => <Row key={m.id} action={<RecordEditor caseId={data.id} recordId={m.id} type="market" />} a={`${m.exchange}${m.pair ? " · " + m.pair : ""}`} b={`${fmtUsd(m.volume24h)} 24h`} />)}
        </RecordGroup>
        <RecordGroup title="Stablecoin profiles" count={data.stablecoins.length}>
          {data.stablecoins.map((s) => <Row key={s.id} action={<RecordEditor caseId={data.id} recordId={s.id} type="stablecoin" />} a={s.name} b="" />)}
        </RecordGroup>
        <RecordGroup title="RWA assets" count={data.rwaAssets.length}>
          {data.rwaAssets.map((r) => <Row key={r.id} action={<RecordEditor caseId={data.id} recordId={r.id} type="rwa" />} a={r.assetDescription} b="" />)}
        </RecordGroup>
      </div>
    </div>
  );
}

function RecordGroup({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  if (count === 0) return null;
  return (
    <Card>
      <CardHeader title={`${title} (${count})`} />
      <CardBody className="space-y-1.5">
        {children}
      </CardBody>
    </Card>
  );
}

function Row({ a, b, action }: { a: string; b: string; action: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line py-3 text-sm last:border-0 last:pb-0">
      <span className="min-w-0 flex-1 basis-48 break-all text-fg">{a}</span>
      <div className="flex shrink-0 items-center gap-3">{b && <span className="text-xs text-muted">{b}</span>}{action}</div>
    </div>
  );
}
