"use client";
import * as React from "react";
import type { ProviderSummary } from "@/ai/settings-view";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { errorText, sendJson } from "./request";

interface Totals {
  provider: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  webSearches: number;
  costUsd: number | null;
}

interface RecentCall {
  id: string;
  purpose: string;
  provider: string;
  model: string;
  status: string;
  inputTokens: number;
  outputTokens: number;
  webSearches: number;
  costUsd: number | null;
  durationMs: number;
  error: string | null;
  createdAt: string;
}

interface Usage {
  last30Days: Totals[];
  recent: RecentCall[];
}

const PURPOSE_LABELS: Record<string, string> = {
  research: "Research",
  analysis: "Analysis",
  narrative: "Narrative",
  intake: "Intake",
  test: "Test",
};

const fmtTokens = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));
const fmtCost = (n: number | null) => (n == null ? "—" : n > 0 && n < 0.01 ? "<$0.01" : `$${n.toFixed(2)}`);

export function UsageSummary({ providers, active }: { providers: ProviderSummary[]; active: boolean }) {
  const [usage, setUsage] = React.useState<Usage | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [revision, setRevision] = React.useState(0);
  const labelFor = (id: string) => providers.find((p) => p.id === id)?.label ?? id;

  React.useEffect(() => {
    const refresh = () => setRevision((current) => current + 1);
    window.addEventListener("bc:ai-usage", refresh);
    return () => window.removeEventListener("bc:ai-usage", refresh);
  }, []);

  React.useEffect(() => {
    if (!active) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    sendJson("GET", "/api/settings/ai/usage")
      .then((data) => {
        if (!cancelled) setUsage(data as Usage);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(errorText(err));
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => {
      cancelled = true;
    };
  }, [active, revision]);

  return (
    <Card>
      <CardHeader
        title="Usage"
        subtitle="Recorded by this app for every AI call. Prompts and answers are not stored here. Costs are list-price estimates for API keys."
        action={<Button type="button" size="sm" variant="outline" disabled={loading} onClick={() => setRevision((current) => current + 1)}>{loading ? "Refreshing…" : error ? "Retry" : "Refresh usage"}</Button>}
      />
      <CardBody>
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        {loading && <p role="status" className="mb-3 text-sm text-faint">Loading usage…</p>}
        {usage && usage.last30Days.length === 0 && <p className="text-sm text-muted">No AI calls recorded in the last 30 days. Research, extraction and test requests will appear here.</p>}
        {usage && usage.last30Days.length > 0 && (
          <div className="space-y-5">
            <div className="table-scroll" role="region" aria-label="Usage by provider" tabIndex={0}>
              <table className="w-full text-sm">
                <caption className="mb-2 text-left text-xs text-muted">Last 30 days</caption>
                <thead className="text-left font-mono text-xs uppercase tracking-wider text-faint">
                  <tr>
                    <th scope="col" className="py-1.5 pr-4 font-medium">Provider</th>
                    <th scope="col" className="py-1.5 pr-4 text-right font-medium">Calls</th>
                    <th scope="col" className="py-1.5 pr-4 text-right font-medium">Tokens in</th>
                    <th scope="col" className="py-1.5 pr-4 text-right font-medium">Tokens out</th>
                    <th scope="col" className="py-1.5 pr-4 text-right font-medium">Searches</th>
                    <th scope="col" className="py-1.5 text-right font-medium">Est. cost</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {usage.last30Days.map((row) => (
                    <tr key={row.provider}>
                      <td className="py-1.5 pr-4 text-fg">{labelFor(row.provider)}</td>
                      <td className="py-1.5 pr-4 text-right tabular-nums text-muted">{row.calls}</td>
                      <td className="py-1.5 pr-4 text-right tabular-nums text-muted">{fmtTokens(row.inputTokens)}</td>
                      <td className="py-1.5 pr-4 text-right tabular-nums text-muted">{fmtTokens(row.outputTokens)}</td>
                      <td className="py-1.5 pr-4 text-right tabular-nums text-muted">{row.webSearches}</td>
                      <td className="py-1.5 text-right tabular-nums text-muted">{fmtCost(row.costUsd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="table-scroll" role="region" aria-label="Recent AI calls" tabIndex={0}>
              <table className="w-full text-xs">
                <caption className="mb-2 text-left text-xs text-muted">Latest calls</caption>
                <thead className="text-left font-mono text-xs uppercase tracking-wider text-faint">
                  <tr>
                    <th scope="col" className="py-1.5 pr-3 font-medium">When</th>
                    <th scope="col" className="py-1.5 pr-3 font-medium">Task</th>
                    <th scope="col" className="py-1.5 pr-3 font-medium">Model</th>
                    <th scope="col" className="py-1.5 pr-3 font-medium">Result</th>
                    <th scope="col" className="py-1.5 pr-3 text-right font-medium">Tokens</th>
                    <th scope="col" className="py-1.5 text-right font-medium">Est. cost</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {usage.recent.slice(0, 10).map((call) => (
                    <tr key={call.id} title={call.error ?? undefined}>
                      <td className="whitespace-nowrap py-1.5 pr-3 text-faint">{new Date(call.createdAt).toLocaleString()}</td>
                      <td className="py-1.5 pr-3 text-muted">{PURPOSE_LABELS[call.purpose] ?? call.purpose}</td>
                      <td className="max-w-[12rem] truncate py-1.5 pr-3 font-mono text-muted" title={`${labelFor(call.provider)} · ${call.model}`}>
                        {call.model}
                      </td>
                      <td className={call.status === "ok" ? "py-1.5 pr-3 text-success" : "py-1.5 pr-3 text-warning"}>
                        {call.status === "ok" ? "OK" : call.status === "cancelled" ? "Cancelled" : "Failed"}
                        {call.error && <details className="mt-1 min-w-32 max-w-xs text-muted"><summary className="cursor-pointer text-xs">Error details</summary><p className="mt-1 break-words leading-5">{call.error}</p></details>}
                      </td>
                      <td className="py-1.5 pr-3 text-right tabular-nums text-muted">{fmtTokens(call.inputTokens + call.outputTokens)}</td>
                      <td className="py-1.5 text-right tabular-nums text-muted">{fmtCost(call.costUsd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
