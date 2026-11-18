"use client";
import { useState, type ReactNode } from "react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field, Select } from "@/components/ui/field";
import { useMutate } from "./use-mutate";
import { apiPatch } from "./api-client";
import type { CaseData, LatestAiSummary, VerificationCounts } from "./types";
import { ResearchPanel } from "./research-panel";
import { ExternalLink, TONES, plural, providerName } from "./provenance-badges";
import { CASE_STATUS, QUOTE_VERIFICATION_LABELS, REPORT_TYPE, REPORT_TYPE_LABELS } from "@/domain/enums";
import { GATING_RULES, SCORE_CATEGORIES } from "@/domain/scoring";
import { fmtDateTime, titleCase } from "@/lib/utils";

function list(v: unknown): string[] {
  if (Array.isArray(v)) {
    return v
      .map((x) => {
        if (x && typeof x === "object") {
          const o = x as Record<string, unknown>;
          if ("chain" in o || "address" in o) return [o.chain, o.address].filter(Boolean).join(":");
          if ("name" in o) return String(o.name);
          return JSON.stringify(o);
        }
        return String(x);
      })
      .filter(Boolean);
  }
  if (typeof v === "string" && v.trim()) return [v.trim()];
  return [];
}
function text(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

const INTAKE_ROWS: { key: string; label: string; type: "list" | "text"; wide?: boolean }[] = [
  { key: "tickers", label: "Tickers", type: "list" },
  { key: "chains", label: "Chains", type: "list" },
  { key: "links", label: "Links", type: "list", wide: true },
  { key: "contractAddresses", label: "Contract addresses", type: "list", wide: true },
  { key: "claimedExchangeListings", label: "Claimed listings", type: "list" },
  { key: "claimedPartnerships", label: "Claimed partnerships", type: "list" },
  { key: "walletAddresses", label: "Wallet addresses", type: "list", wide: true },
  { key: "offerType", label: "Offer type", type: "text" },
  { key: "offerPrice", label: "Offer price", type: "text" },
  { key: "investmentAmount", label: "Investment size", type: "text" },
  { key: "lockupVesting", label: "Lockup / vesting", type: "text" },
  { key: "clientJurisdiction", label: "Client jurisdiction", type: "text" },
  { key: "issuerJurisdiction", label: "Issuer jurisdiction", type: "text" },
  { key: "sellerDetails", label: "Seller details", type: "text", wide: true },
  { key: "questionsToVerify", label: "Questions to verify", type: "list", wide: true },
  { key: "notes", label: "Notes", type: "text", wide: true },
];

const VERIFICATION_ROWS: { key: Exclude<keyof VerificationCounts, "checkedSources">; label: string; tone: string }[] = [
  { key: "verified", label: QUOTE_VERIFICATION_LABELS.verified, tone: TONES.good },
  { key: "partial", label: QUOTE_VERIFICATION_LABELS.partial, tone: TONES.warn },
  { key: "notFound", label: QUOTE_VERIFICATION_LABELS.not_found, tone: TONES.bad },
  { key: "unreachable", label: QUOTE_VERIFICATION_LABELS.unreachable, tone: TONES.neutral },
  { key: "blocked", label: QUOTE_VERIFICATION_LABELS.blocked, tone: TONES.neutral },
  { key: "notChecked", label: "Quote not checked", tone: TONES.neutral },
];

function gatingLabel(flag: string): string {
  return GATING_RULES.find((rule) => rule.flag === flag)?.label ?? titleCase(flag);
}

function SummarySection({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section>
      <h4 className="text-xs font-medium text-muted">{label}</h4>
      <div className="mt-1">{children}</div>
    </section>
  );
}

function BulletList({ items }: { items: string[] }) {
  return (
    <ul className="list-disc space-y-1 pl-4 text-sm leading-relaxed text-muted marker:text-faint">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

/** What the latest completed AI run found, checked and concluded. */
function AiSummaryCard({ latest }: { latest: LatestAiSummary }) {
  const { research, verification, analysis, notes } = latest.summary;
  const by = [providerName(latest.provider), latest.model].filter(Boolean).join(" · ");
  const when = latest.finishedAt ? ` finished ${fmtDateTime(latest.finishedAt)}` : "";

  const countRows: { label: string; n: number | null; hint?: string }[] = research
    ? [
        { label: "Sources added", n: research.sourcesCreated },
        { label: "Claims added", n: research.claimsCreated },
        { label: "Unsupported", n: research.unsupportedClaims, hint: "Claims that no source found by the research supports" },
        { label: "Unconfirmed URLs", n: research.unseenUrls, hint: "Cited URLs the provider's web tools never reported opening or finding" },
      ]
    : [];
  const counts = countRows.filter((row): row is { label: string; n: number; hint?: string } => row.n !== null);
  const checks = verification ? VERIFICATION_ROWS.filter((row) => verification[row.key] > 0) : [];
  const scored = analysis ? Object.keys(analysis.scores).length : 0;
  const facts = analysis
    ? [
        analysis.confidence ? `Confidence ${analysis.confidence}` : null,
        analysis.findings !== null && analysis.redFlags !== null
          ? `${plural(analysis.findings, "finding")} and ${plural(analysis.redFlags, "red flag")} drafted`
          : null,
        scored > 0 ? `Suggested scores for ${scored} of ${SCORE_CATEGORIES.length} categories` : null,
      ].filter((fact): fact is string => fact !== null)
    : [];

  return (
    <Card>
      <CardHeader
        title="AI research summary"
        subtitle={`From the AI run${when}${by ? ` (${by})` : ""}. Check the claims in the Evidence tab before you rely on it.`}
      />
      <CardBody className="space-y-4">
        {notes.length > 0 && (
          <div className="rounded-lg border border-warning/25 bg-warning/10 px-3 py-2 text-sm text-warning">
            <p className="font-medium">Notes from the run</p>
            <ul className="mt-0.5 space-y-0.5">
              {notes.map((note) => (
                <li key={note}>• {note}</li>
              ))}
            </ul>
          </div>
        )}
        {research?.overview && (
          <SummarySection label="Overview">
            <p className="whitespace-pre-line text-sm leading-relaxed text-fg">{research.overview}</p>
          </SummarySection>
        )}
        {analysis && (analysis.summary || facts.length > 0) && (
          <SummarySection label="Assessment">
            {analysis.summary && <p className="whitespace-pre-line text-sm leading-relaxed text-fg">{analysis.summary}</p>}
            {facts.length > 0 && <p className="mt-1 text-xs text-muted">{facts.join(" · ")}</p>}
          </SummarySection>
        )}
        {counts.length > 0 && (
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {counts.map((row) => (
              <div key={row.label} className="rounded-lg border border-line bg-elevated/50 px-2 py-2 text-center" title={row.hint}>
                <dt className="text-xs font-medium text-muted">{row.label}</dt>
                <dd className="text-lg font-semibold tabular-nums text-fg">{row.n}</dd>
              </div>
            ))}
          </dl>
        )}
        {verification && verification.checkedSources > 0 && (
          <SummarySection label={`Quote checks · ${plural(verification.checkedSources, "page")}`}>
            {checks.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {checks.map((row) => (
                  <Badge key={row.key} className={row.tone}>
                    {verification[row.key]} · {row.label}
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted">The checked pages had no quotes to compare.</p>
            )}
          </SummarySection>
        )}
        {analysis && analysis.gatingReasons.length > 0 && (
          <div className="rounded-lg border border-danger/25 bg-danger/10 px-3 py-2 text-xs text-danger">
            <p className="font-medium">Blockers the AI raised (each caps the recommendation)</p>
            <ul className="mt-1 space-y-1">
              {analysis.gatingReasons.map((g) => (
                <li key={g.flag}>
                  <span className="font-medium">{gatingLabel(g.flag)}.</span> {g.reason}
                </li>
              ))}
            </ul>
          </div>
        )}
        {research && research.contradictions.length > 0 && (
          <SummarySection label="Contradictions">
            <BulletList items={research.contradictions} />
          </SummarySection>
        )}
        {research && research.openQuestions.length > 0 && (
          <SummarySection label="Open questions">
            <BulletList items={research.openQuestions} />
          </SummarySection>
        )}
      </CardBody>
    </Card>
  );
}

export function OverviewTab({ data }: { data: CaseData }) {
  const { busy, error, run } = useMutate();
  const [workflow, setWorkflow] = useState(() => ({
    status: data.status,
    reportType: data.reportType,
    baseline: { status: data.status, reportType: data.reportType },
    server: { status: data.status, reportType: data.reportType },
    saved: false,
  }));
  // Only clean fields follow refreshed server data; a submitted snapshot becomes
  // the baseline immediately, before router.refresh returns the new props.
  if (workflow.server.status !== data.status || workflow.server.reportType !== data.reportType) {
    setWorkflow((current) => ({
      ...current,
      status: current.status === current.baseline.status ? data.status : current.status,
      reportType: current.reportType === current.baseline.reportType ? data.reportType : current.reportType,
      baseline: { status: data.status, reportType: data.reportType },
      server: { status: data.status, reportType: data.reportType },
    }));
  }
  const { status, reportType, baseline, saved } = workflow;
  const dirty = status !== baseline.status || reportType !== baseline.reportType;
  async function saveWorkflow() {
    const submitted = { status, reportType };
    await run(async () => {
      await apiPatch(`/api/cases/${data.id}`, submitted);
      setWorkflow((current) => ({ ...current, baseline: submitted, saved: true }));
    });
  }
  const intake = (data.intake ?? {}) as Record<string, unknown>;
  const intakeRows = INTAKE_ROWS.filter((row) => row.type === "list" ? list(intake[row.key]).length > 0 : text(intake[row.key]).trim() !== "");

  const counts: { label: string; n: number }[] = [
    { label: "Sources", n: data.sources.length },
    { label: "Evidence", n: data.evidence.length },
    { label: "Entities", n: data.entities.length },
    { label: "People", n: data.people.length },
    { label: "Tokens", n: data.tokens.length },
    { label: "Contracts", n: data.contracts.length },
    { label: "Markets", n: data.markets.length },
    { label: "Findings", n: data.findings.length },
    { label: "Red flags", n: data.redFlags.length },
  ];

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
      <div className="min-w-0 space-y-5 lg:col-span-2">
        <Card>
          <CardHeader title="Mandate & intake" subtitle="Captured opportunity details — treated as unverified claims until sourced." />
          <CardBody>
            {intakeRows.length === 0 && <p className="text-sm leading-relaxed text-muted">No intake details were captured. Add sources and structured records to begin the review.</p>}
            <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
              {intakeRows.map((row) => {
                const raw = intake[row.key];
                const items = row.type === "list" ? list(raw) : [];
                const value = row.type === "text" ? text(raw) : "";
                return (
                  <div key={row.key} className={row.wide ? "sm:col-span-2" : ""}>
                    <dt className="text-xs font-medium text-muted">{row.label}</dt>
                    <dd className="mt-1 break-words text-sm text-fg">
                      {row.type === "list" ? (
                        <div className="flex flex-wrap gap-1">
                          {items.map((it, i) => (
                            <span key={`${row.key}-${i}`} className="break-all rounded bg-elevated px-1.5 py-0.5 text-xs text-muted">{row.key === "links" ? <ExternalLink href={it}>{it}</ExternalLink> : it}</span>
                          ))}
                        </div>
                      ) : row.key === "offerType" ? (
                        titleCase(value)
                      ) : (
                        value
                      )}
                    </dd>
                  </div>
                );
              })}
            </dl>
          </CardBody>
        </Card>

        <ResearchPanel caseId={data.id} ai={data.ai} active={data.activeRun} runs={data.researchRuns} />

        {data.latestAiSummary && <AiSummaryCard latest={data.latestAiSummary} />}
      </div>

      <div className="space-y-5">
        <Card>
          <CardHeader title="Workflow" />
          <CardBody className="space-y-3">
            <Field label="Status">
              <Select value={status} disabled={busy} onChange={(e) => setWorkflow({ ...workflow, status: e.target.value, saved: false })}>
                {CASE_STATUS.map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}
              </Select>
            </Field>
            <Field label="Report type">
              <Select value={reportType} disabled={busy} onChange={(e) => setWorkflow({ ...workflow, reportType: e.target.value, saved: false })}>
                {REPORT_TYPE.map((t) => <option key={t} value={t}>{REPORT_TYPE_LABELS[t]}</option>)}
              </Select>
            </Field>
            <Button
              variant="outline"
              size="sm"
              disabled={busy || !dirty}
              onClick={() => void saveWorkflow()}
            >
              {busy ? "Saving…" : "Save workflow"}
            </Button>
            <p role="status" className="text-xs text-muted">{dirty ? "Unsaved workflow changes" : saved ? "Workflow saved" : "Changes here update the case and report format."}</p>
            {error && (
              <p role="alert" className="text-xs text-danger">
                {error}
              </p>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Case contents" />
          <CardBody>
            <dl className="grid grid-cols-3 gap-3">
              {counts.map((c) => (
                <div key={c.label} className="rounded-lg border border-line bg-elevated/50 px-2 py-2 text-center">
                  <dt className="text-xs font-medium text-muted">{c.label}</dt>
                  <dd className="text-lg font-semibold tabular-nums text-fg">{c.n}</dd>
                </div>
              ))}
            </dl>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
