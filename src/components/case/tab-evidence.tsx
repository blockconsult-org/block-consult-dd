"use client";
import { useState, type FormEvent } from "react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Badge, Tag } from "@/components/ui/badge";
import { useMutate } from "./use-mutate";
import { ConfirmRemoveButton } from "./confirm-remove-button";
import { apiPost, apiDelete } from "./api-client";
import type { CaseData, CaseSource, EvidenceItem } from "./types";
import { ExternalLink, OriginBadge, TONES, VerificationBadge, sameUrl, shortUrl } from "./provenance-badges";
import { SOURCE_TYPE, RELIABILITY_RATING, CLAIM_CLASS, CONFIDENCE } from "@/domain/enums";
import { cn, titleCase } from "@/lib/utils";

const RELIABILITY_TONE: Record<string, string> = {
  high: "bg-success/10 text-success",
  medium: "bg-warning/10 text-warning",
  low: "bg-danger/10 text-danger",
  unknown: "bg-elevated text-faint",
};

const AI_REPLACED_NOTE = "The next AI research run replaces everything marked AI research. Your own entries stay.";

function SourceRow({ source, busy, onRemove }: { source: CaseSource; busy: boolean; onRemove: () => Promise<boolean> }) {
  const { url, finalUrl, httpStatus } = source;
  const redirectedTo = url && finalUrl && !sameUrl(url, finalUrl) ? finalUrl : null;
  return (
    <div className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-line bg-elevated/40 p-4">
      <div className="min-w-0 flex-1 basis-48 space-y-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="min-w-0 break-words text-sm font-medium text-fg">{source.name}</span>
          <OriginBadge origin={source.origin} />
          <Badge className={RELIABILITY_TONE[source.reliabilityRating] ?? RELIABILITY_TONE.unknown}>{source.reliabilityRating}</Badge>
        </div>
        <p className="text-xs text-muted">
          {titleCase(source.sourceType)}
          {httpStatus !== null && (
            <span className={cn(httpStatus >= 400 && "text-danger")} title="Status the page returned when its quotes were checked">
              {` · HTTP ${httpStatus}`}
            </span>
          )}
        </p>
        {source.title && source.title !== source.name && <p className="break-words text-sm text-muted">{source.title}</p>}
        {url && (
          <ExternalLink href={url} className="block text-xs">
            {shortUrl(url)}
          </ExternalLink>
        )}
        {redirectedTo && (
          <p className="text-xs text-faint">
            Redirected to <ExternalLink href={redirectedTo}>{shortUrl(redirectedTo)}</ExternalLink>
          </p>
        )}
        {source.content && <details className="text-sm"><summary className="cursor-pointer text-link">View extracted content</summary><p className="mt-2 whitespace-pre-wrap break-words leading-relaxed text-muted">{source.content}</p></details>}
        {source.notes && <p className="break-words text-xs leading-relaxed text-muted">{source.notes}</p>}
      </div>
      <ConfirmRemoveButton label={`source “${source.name}”`} description="This removes the source from this case. It cannot be undone." onRemove={onRemove} disabled={busy} />
    </div>
  );
}

function ClaimRow({ claim, busy, onRemove }: { claim: EvidenceItem; busy: boolean; onRemove: () => Promise<boolean> }) {
  const unsupported = claim.claimClass === "unsupported";
  const sourceLabel = claim.sourceTitle || (claim.sourceUrl ? shortUrl(claim.sourceUrl) : null);
  return (
    <div className="rounded-lg border border-line bg-elevated/40 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="min-w-0 flex-1 basis-48 break-words text-sm leading-relaxed text-fg">{claim.claimText}</p>
        <ConfirmRemoveButton label="evidence claim" description="This removes the claim and its quote from this case. It cannot be undone." onRemove={onRemove} disabled={busy} />
      </div>
      {claim.quote && (
        <blockquote className="mt-1.5 border-l-2 border-line-strong pl-2.5 text-xs leading-relaxed text-muted">“{claim.quote}”</blockquote>
      )}
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
        <OriginBadge origin={claim.origin} />
        <Badge className={unsupported ? TONES.bad : "bg-elevated text-muted"}>
          <span title={unsupported ? "No source found supports this claim" : undefined}>{titleCase(claim.claimClass)}</span>
        </Badge>
        <Badge className={RELIABILITY_TONE[claim.reliabilityRating] ?? RELIABILITY_TONE.unknown}>{claim.reliabilityRating}</Badge>
        <VerificationBadge verification={claim.verification} quoted={Boolean(claim.quote)} />
        {claim.topic && <Tag>{titleCase(claim.topic)}</Tag>}
        <span>confidence {claim.confidence}</span>
        {claim.corroborated && <Badge className="bg-success/10 text-success">corroborated</Badge>}
      </div>
      {sourceLabel && (
        <p className="mt-1.5 text-xs text-muted">
          Source: <ExternalLink href={claim.sourceUrl}>{sourceLabel}</ExternalLink>
        </p>
      )}
      {claim.notes && <p className="mt-1 text-xs leading-relaxed text-faint">{claim.notes}</p>}
    </div>
  );
}

export function EvidenceTab({ data }: { data: CaseData }) {
  const { busy, error, run } = useMutate();
  const [query, setQuery] = useState("");
  const search = query.trim().toLocaleLowerCase();
  const sources = data.sources.filter((source) => [source.name, source.title, source.url, source.sourceType, source.origin].some((value) => value?.toLocaleLowerCase().includes(search)));
  const claims = data.evidence.filter((claim) => [claim.claimText, claim.quote, claim.sourceTitle, claim.topic, claim.origin].some((value) => value?.toLocaleLowerCase().includes(search)));
  const aiSources = data.sources.some((s) => s.origin === "ai");
  const aiClaims = data.evidence.some((c) => c.origin === "ai");

  async function addSource(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const get = (k: string) => String(fd.get(k) ?? "").trim();
    const payload = {
      name: get("name"),
      title: get("title") || undefined,
      sourceType: get("sourceType") || "unknown",
      url: get("url") || undefined,
      reliabilityRating: get("reliabilityRating") || "unknown",
      content: get("content") || undefined,
    };
    if (await run(() => apiPost(`/api/cases/${data.id}/sources`, payload))) form.reset();
  }

  async function addClaim(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const get = (k: string) => String(fd.get(k) ?? "").trim();
    const payload = {
      claimText: get("claimText"),
      sourceType: get("sourceType") || "unknown",
      claimClass: get("claimClass") || "secondary",
      reliabilityRating: get("reliabilityRating") || "unknown",
      confidence: get("confidence") || "medium",
      corroborated: fd.get("corroborated") === "on",
      sourceUrl: get("sourceUrl") || undefined,
    };
    if (await run(() => apiPost(`/api/cases/${data.id}/evidence`, payload))) form.reset();
  }

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      <div className="flex flex-wrap items-end gap-4 rounded-xl border border-line bg-surface p-4 lg:col-span-2">
        <div className="min-w-0 flex-1 basis-64"><Field label="Search evidence"><Input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Source, claim, topic or origin" /></Field></div>
        <p role="status" className="pb-2 text-sm text-muted">{sources.length} of {data.sources.length} sources · {claims.length} of {data.evidence.length} claims</p>
        {query && <Button variant="ghost" type="button" onClick={() => setQuery("")}>Clear search</Button>}
      </div>
      {error && <div role="alert" className="rounded-lg border border-danger/25 bg-danger/10 px-4 py-3 text-sm text-danger lg:col-span-2">{error}</div>}
      <Card>
        <CardHeader title="Add source" subtitle="Add the document or page behind a claim. Rate its reliability based on the available evidence." />
        <CardBody>
          <form onSubmit={addSource}><fieldset disabled={busy} className="min-w-0 space-y-3"><legend className="sr-only">New source</legend>
            <Field label="Name / label *"><Input name="name" required placeholder="Project whitepaper v2" /></Field>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Source type">
                <Select name="sourceType" defaultValue="primary_official">
                  {SOURCE_TYPE.map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}
                </Select>
              </Field>
              <Field label="Reliability">
                <Select name="reliabilityRating" defaultValue="medium">
                  {RELIABILITY_RATING.map((r) => <option key={r} value={r}>{titleCase(r)}</option>)}
                </Select>
              </Field>
            </div>
            <Field label="URL"><Input name="url" type="url" placeholder="https://…" /></Field>
            <Field label="Title"><Input name="title" /></Field>
            <Field label="Notes / extracted content" hint="Paste key passages that support claims"><Textarea name="content" /></Field>
            <Button type="submit" size="sm" disabled={busy}>Add source</Button>
          </fieldset></form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={`Sources (${data.sources.length})`} subtitle={aiSources ? AI_REPLACED_NOTE : undefined} />
        <CardBody className="space-y-2">
          {sources.length === 0 && <p className="empty-state">{search ? "No sources match this search." : "Add a source or run research to begin collecting evidence."}</p>}
          {sources.map((s) => (
            <SourceRow key={s.id} source={s} busy={busy} onRemove={() => run(() => apiDelete(`/api/cases/${data.id}/sources/${s.id}`))} />
          ))}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Record evidence claim" subtitle="A discrete factual claim and how well it is supported." />
        <CardBody>
          <form onSubmit={addClaim}><fieldset disabled={busy} className="min-w-0 space-y-3"><legend className="sr-only">New evidence claim</legend>
            <Field label="Claim *"><Textarea name="claimText" required placeholder="The token contract on Ethereum is 0x… per the official docs." /></Field>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Claim class">
                <Select name="claimClass" defaultValue="secondary">
                  {CLAIM_CLASS.map((c) => <option key={c} value={c}>{titleCase(c)}</option>)}
                </Select>
              </Field>
              <Field label="Source type">
                <Select name="sourceType" defaultValue="primary_official">
                  {SOURCE_TYPE.map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}
                </Select>
              </Field>
              <Field label="Reliability">
                <Select name="reliabilityRating" defaultValue="medium">
                  {RELIABILITY_RATING.map((r) => <option key={r} value={r}>{titleCase(r)}</option>)}
                </Select>
              </Field>
              <Field label="Confidence">
                <Select name="confidence" defaultValue="medium">
                  {CONFIDENCE.map((c) => <option key={c} value={c}>{titleCase(c)}</option>)}
                </Select>
              </Field>
            </div>
            <Field label="Source URL"><Input name="sourceUrl" type="url" placeholder="https://…" /></Field>
            <label className="flex items-center gap-2 text-sm text-muted">
              <input type="checkbox" name="corroborated" className="h-4 w-4 rounded border-line bg-surface accent-accent" /> Corroborated by ≥2 independent sources
            </label>
            <Button type="submit" size="sm" disabled={busy}>Add claim</Button>
          </fieldset></form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={`Evidence claims (${data.evidence.length})`} subtitle={aiClaims ? AI_REPLACED_NOTE : undefined} />
        <CardBody className="space-y-2">
          {claims.length === 0 && <p className="empty-state">{search ? "No claims match this search." : "Record a claim and its source to build the evidence trail."}</p>}
          {claims.map((c) => (
            <ClaimRow key={c.id} claim={c} busy={busy} onRemove={() => run(() => apiDelete(`/api/cases/${data.id}/evidence/${c.id}`))} />
          ))}
        </CardBody>
      </Card>

    </div>
  );
}
