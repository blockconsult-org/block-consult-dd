"use client";
import { useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea, Field } from "@/components/ui/field";
import { useMutate } from "./use-mutate";
import { apiPost } from "./api-client";
import type { CaseData } from "./types";
import { ENTITY_TYPE, CONFIDENCE, MARKET_TYPE, STABLECOIN_CLASSIFICATION, RWA_ASSET_TYPE } from "@/domain/enums";
import { fmtUsd, titleCase } from "@/lib/utils";

type FieldKind = "text" | "number" | "bool" | "select" | "textarea" | "lines";
interface FieldDef { name: string; label: string; kind: FieldKind; options?: readonly string[]; required?: boolean; full?: boolean; hint?: string }
interface RecordDef { type: string; label: string; fields: FieldDef[] }

const RECORD_DEFS: RecordDef[] = [
  { type: "entity", label: "Entity", fields: [
    { name: "name", label: "Name", kind: "text", required: true },
    { name: "entityType", label: "Type", kind: "select", options: ENTITY_TYPE },
    { name: "role", label: "Role", kind: "text" },
    { name: "jurisdiction", label: "Jurisdiction", kind: "text" },
    { name: "registrationNumber", label: "Registration no.", kind: "text" },
    { name: "website", label: "Website", kind: "text" },
    { name: "confidence", label: "Confidence", kind: "select", options: CONFIDENCE },
    { name: "notes", label: "Notes", kind: "textarea", full: true },
  ] },
  { type: "person", label: "Person", fields: [
    { name: "fullName", label: "Full name", kind: "text", required: true },
    { name: "confidence", label: "Confidence", kind: "select", options: CONFIDENCE },
    { name: "roles", label: "Roles", kind: "lines", hint: "one per line" },
    { name: "linkedinUrl", label: "LinkedIn", kind: "text" },
    { name: "githubUrl", label: "GitHub", kind: "text" },
    { name: "xUrl", label: "X / Twitter", kind: "text" },
    { name: "previousCompanies", label: "Previous companies", kind: "lines", hint: "one per line" },
    { name: "legalHistory", label: "Legal history", kind: "textarea", full: true },
  ] },
  { type: "token", label: "Token", fields: [
    { name: "name", label: "Name", kind: "text", required: true },
    { name: "symbol", label: "Symbol", kind: "text" },
    { name: "chain", label: "Chain", kind: "text" },
    { name: "contractAddress", label: "Contract address", kind: "text" },
    { name: "price", label: "Price (USD)", kind: "number" },
    { name: "marketCap", label: "Market cap (USD)", kind: "number" },
    { name: "fdv", label: "FDV (USD)", kind: "number" },
    { name: "circulatingSupply", label: "Circulating supply", kind: "number" },
    { name: "totalSupply", label: "Total supply", kind: "number" },
    { name: "maxSupply", label: "Max supply", kind: "number" },
    { name: "vestingNotes", label: "Vesting notes", kind: "textarea", full: true },
    { name: "allocationsText", label: "Allocations", kind: "textarea", full: true, hint: "one per line — category:percent (e.g. team:18)" },
    { name: "unlocksText", label: "Unlock events", kind: "textarea", full: true, hint: "one per line — date:percent (e.g. 2025-09-01:5)" },
  ] },
  { type: "contract", label: "Contract", fields: [
    { name: "chain", label: "Chain", kind: "text", required: true },
    { name: "address", label: "Address", kind: "text", required: true },
    { name: "name", label: "Name", kind: "text" },
    { name: "ownerAddress", label: "Owner address", kind: "text" },
    { name: "verified", label: "Source verified", kind: "bool" },
    { name: "proxy", label: "Upgradeable proxy", kind: "bool" },
    { name: "canMint", label: "Can mint", kind: "bool" },
    { name: "canPause", label: "Can pause", kind: "bool" },
    { name: "canBlacklist", label: "Can blacklist", kind: "bool" },
    { name: "canUpgrade", label: "Can upgrade", kind: "bool" },
    { name: "multisig", label: "Multisig owner", kind: "bool" },
    { name: "timelock", label: "Timelock", kind: "bool" },
    { name: "securityNotes", label: "Security notes", kind: "textarea", full: true },
  ] },
  { type: "market", label: "Market", fields: [
    { name: "exchange", label: "Exchange / venue", kind: "text", required: true },
    { name: "marketType", label: "Market type", kind: "select", options: MARKET_TYPE },
    { name: "base", label: "Base", kind: "text" },
    { name: "quote", label: "Quote", kind: "text" },
    { name: "pair", label: "Pair", kind: "text" },
    { name: "price", label: "Price (USD)", kind: "number" },
    { name: "volume24h", label: "24h volume (USD)", kind: "number" },
    { name: "spreadBps", label: "Spread (bps)", kind: "number" },
    { name: "depthPlus2PctUsd", label: "Depth +2% (USD)", kind: "number" },
    { name: "depthMinus2PctUsd", label: "Depth -2% (USD)", kind: "number" },
  ] },
  { type: "stablecoin", label: "Stablecoin", fields: [
    { name: "name", label: "Name", kind: "text", required: true },
    { name: "symbol", label: "Symbol", kind: "text" },
    { name: "classification", label: "Classification", kind: "select", options: STABLECOIN_CLASSIFICATION },
    { name: "jurisdiction", label: "Jurisdiction", kind: "text" },
    { name: "redemptionParty", label: "Redemption party", kind: "text" },
    { name: "reserveAssets", label: "Reserve assets", kind: "lines", hint: "one per line" },
    { name: "reserveCustodians", label: "Reserve custodians", kind: "lines", hint: "one per line" },
    { name: "attestations", label: "Attestations", kind: "lines", hint: "one per line" },
    { name: "redemptionTerms", label: "Redemption terms", kind: "textarea", full: true },
    { name: "canPauseRedemptions", label: "Can pause redemptions", kind: "bool" },
    { name: "blacklistFreeze", label: "Blacklist / freeze", kind: "bool" },
    { name: "confidence", label: "Confidence", kind: "select", options: CONFIDENCE },
  ] },
  { type: "rwa", label: "RWA asset", fields: [
    { name: "assetDescription", label: "Asset description", kind: "text", required: true },
    { name: "assetType", label: "Asset type", kind: "select", options: RWA_ASSET_TYPE },
    { name: "jurisdiction", label: "Jurisdiction", kind: "text" },
    { name: "legalOwnerBefore", label: "Legal owner (before)", kind: "text" },
    { name: "legalOwnerAfter", label: "Legal owner (after)", kind: "text" },
    { name: "valuationMethod", label: "Valuation method", kind: "text" },
    { name: "investorRights", label: "Investor rights", kind: "lines", hint: "one per line" },
    { name: "redemptionRights", label: "Redemption rights", kind: "textarea", full: true },
    { name: "cashflowRights", label: "Cashflow rights", kind: "textarea", full: true },
  ] },
];

function parsePairs(raw: string, keyA: string, keyB: string): Record<string, unknown>[] {
  return raw
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const idx = l.search(/[:=]/);
      const a = idx >= 0 ? l.slice(0, idx).trim() : l.trim();
      const b = idx >= 0 ? l.slice(idx + 1).trim() : "";
      const row: Record<string, unknown> = { [keyA]: a };
      if (b) {
        const n = Number(b.replace(/[%,\s]/g, ""));
        row[keyB] = Number.isFinite(n) ? n : b;
      }
      return row;
    });
}

function buildData(def: RecordDef, fd: FormData): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const f of def.fields) {
    if (f.name === "allocationsText" || f.name === "unlocksText") continue;
    if (f.kind === "bool") { data[f.name] = fd.get(f.name) === "on"; continue; }
    const s = String(fd.get(f.name) ?? "").trim();
    if (f.kind === "number") { if (s !== "") data[f.name] = Number(s); continue; }
    if (f.kind === "lines") { data[f.name] = s ? s.split(/[\n,]+/).map((x) => x.trim()).filter(Boolean) : []; continue; }
    if (s) data[f.name] = s;
  }
  if (def.type === "token") {
    data.allocations = parsePairs(String(fd.get("allocationsText") ?? ""), "category", "percentageTotal");
    data.unlocks = parsePairs(String(fd.get("unlocksText") ?? ""), "date", "percentageSupply");
  }
  return data;
}

export function RecordsTab({ data }: { data: CaseData }) {
  const { busy, error, run } = useMutate();
  const [type, setType] = useState("entity");
  const recordCount = data.entities.length + data.people.length + data.tokens.length + data.contracts.length + data.markets.length + data.stablecoins.length + data.rwaAssets.length;

  async function submit(e: FormEvent<HTMLFormElement>, def: RecordDef) {
    e.preventDefault();
    const form = e.currentTarget;
    const payload = { type: def.type, data: buildData(def, new FormData(form)) };
    if (await run(() => apiPost(`/api/cases/${data.id}/records`, payload))) form.reset();
  }

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      <Card>
        <CardHeader title="Add structured record" subtitle="Manually capture verified data. Leave unknowns blank — do not guess." />
        <CardBody>
          <Field label="Record type" className="mb-4">
            <Select value={type} disabled={busy} onChange={(e) => setType(e.target.value)}>
              {RECORD_DEFS.map((d) => <option key={d.type} value={d.type}>{d.label}</option>)}
            </Select>
          </Field>
          {RECORD_DEFS.map((def) => (
          <form onSubmit={(event) => void submit(event, def)} key={def.type} hidden={type !== def.type} className={type !== def.type ? "hidden" : ""}>
            <fieldset disabled={busy} className="min-w-0 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <legend className="sr-only">Add {def.label.toLowerCase()}</legend>
            {def.fields.map((f) => (
              <div key={f.name} className={f.full || f.kind === "textarea" ? "sm:col-span-2" : ""}>
                {f.kind === "bool" ? (
                  <label className="flex items-center gap-2 pt-5 text-sm text-muted">
                    <input type="checkbox" name={f.name} className="h-4 w-4 rounded border-line bg-surface accent-accent" /> {f.label}
                  </label>
                ) : (
                  <Field label={`${f.label}${f.required ? " *" : ""}`} hint={f.hint}>
                    {f.kind === "textarea" || f.kind === "lines" ? (
                      <Textarea name={f.name} required={f.required} />
                    ) : f.kind === "select" ? (
                      <Select name={f.name} defaultValue={f.options?.[0]}>
                        {(f.options ?? []).map((o) => <option key={o} value={o}>{titleCase(o)}</option>)}
                      </Select>
                    ) : (
                      <Input name={f.name} type={f.kind === "number" ? "number" : "text"} step={f.kind === "number" ? "any" : undefined} required={f.required} />
                    )}
                  </Field>
                )}
              </div>
            ))}
            <div className="sm:col-span-2">
              <Button type="submit" size="sm" disabled={busy}>Add {def.label.toLowerCase()}</Button>
              {error && <p role="alert" className="mt-3 text-sm text-danger">{error}</p>}
            </div>
            </fieldset>
          </form>
          ))}
        </CardBody>
      </Card>

      <div className="min-w-0 space-y-4">
        <div className="flex items-center justify-between gap-3"><h2 className="section-heading">Case records</h2><span className="text-sm tabular-nums text-muted">{recordCount} total</span></div>
        {recordCount === 0 && <div className="empty-state"><p className="font-medium text-fg">No structured records yet</p><p className="mt-2">Choose a record type and add the people, organisations or assets you have verified.</p></div>}
        <RecordGroup title="Entities" count={data.entities.length}>
          {data.entities.map((e) => <Row key={e.id} a={e.name} b={`${titleCase(e.entityType)}${e.jurisdiction ? " · " + e.jurisdiction : ""}`} />)}
        </RecordGroup>
        <RecordGroup title="People" count={data.people.length}>
          {data.people.map((p) => <Row key={p.id} a={p.fullName} b={`confidence ${p.confidence}`} />)}
        </RecordGroup>
        <RecordGroup title="Tokens" count={data.tokens.length}>
          {data.tokens.map((t) => <Row key={t.id} a={`${t.name}${t.symbol ? " (" + t.symbol + ")" : ""}`} b={`${t.allocations} alloc · ${t.unlocks} unlocks`} />)}
        </RecordGroup>
        <RecordGroup title="Contracts" count={data.contracts.length}>
          {data.contracts.map((t) => <Row key={t.id} a={`${t.chain}: ${t.address}`} b={t.verified ? "verified" : "unverified"} />)}
        </RecordGroup>
        <RecordGroup title="Markets" count={data.markets.length}>
          {data.markets.map((m) => <Row key={m.id} a={`${m.exchange}${m.pair ? " · " + m.pair : ""}`} b={`${fmtUsd(m.volume24h)} 24h`} />)}
        </RecordGroup>
        <RecordGroup title="Stablecoin profiles" count={data.stablecoins.length}>
          {data.stablecoins.map((s) => <Row key={s.id} a={s.name} b="" />)}
        </RecordGroup>
        <RecordGroup title="RWA assets" count={data.rwaAssets.length}>
          {data.rwaAssets.map((r) => <Row key={r.id} a={r.assetDescription} b="" />)}
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

function Row({ a, b }: { a: string; b: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line py-3 text-sm last:border-0 last:pb-0">
      <span className="min-w-0 flex-1 basis-48 break-all text-fg">{a}</span>
      {b && <span className="text-xs text-muted">{b}</span>}
    </div>
  );
}
