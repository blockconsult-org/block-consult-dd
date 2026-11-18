"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, FileCheck2, FolderOpen, Plus, Search, SlidersHorizontal } from "lucide-react";
import { CASE_STATUS, REPORT_TYPE_LABELS, RECOMMENDATION_LABELS, type Recommendation, type ReportType } from "@/domain/enums";
import { RecommendationBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { LoadExampleButton } from "@/components/load-example-button";
import { cn, fmtDate } from "@/lib/utils";

interface CaseSummary {
  id: string;
  projectName: string;
  clientName: string | null;
  analyst: string | null;
  status: string;
  reportType: string;
  updatedAt: string;
  recommendation: string | null;
  overallScore: number | null;
  sources: number;
  flags: number;
  reports: number;
}

const STATUS_LABELS: Record<string, string> = { draft: "Draft", qa: "In review", final: "Final", archived: "Archived" };
type SortOrder = "recent" | "oldest" | "name" | "score";

function StatusBadge({ status }: { status: string }) {
  return <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium", {
    "border-line bg-elevated text-muted": status === "draft" || status === "archived",
    "border-warning/25 bg-warning/10 text-warning": status === "qa",
    "border-success/25 bg-success/10 text-success": status === "final",
  })}><span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />{STATUS_LABELS[status] ?? status}</span>;
}

function Recommendation({ item }: { item: CaseSummary }) {
  return item.recommendation ? <RecommendationBadge rec={item.recommendation} label={RECOMMENDATION_LABELS[item.recommendation as Recommendation] ?? item.recommendation} /> : <span className="text-xs text-faint">Not scored</span>;
}

export function CaseDashboard({ cases, aiConfigured }: { cases: CaseSummary[]; aiConfigured: boolean }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [flagged, setFlagged] = useState(false);
  const [sort, setSort] = useState<SortOrder>("recent");
  const filtered = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    return cases.filter((item) => {
      const haystack = [item.projectName, item.clientName, item.analyst, REPORT_TYPE_LABELS[item.reportType as ReportType] ?? item.reportType].join(" ").toLocaleLowerCase();
      return (!term || haystack.includes(term)) && (status === "all" || item.status === status) && (!flagged || item.flags > 0);
    }).sort((a, b) => {
      if (sort === "name") return a.projectName.localeCompare(b.projectName);
      if (sort === "score") return (b.overallScore ?? -1) - (a.overallScore ?? -1) || b.updatedAt.localeCompare(a.updatedAt);
      return sort === "oldest" ? a.updatedAt.localeCompare(b.updatedAt) : b.updatedAt.localeCompare(a.updatedAt);
    });
  }, [cases, flagged, query, sort, status]);

  function clearFilters() { setQuery(""); setStatus("all"); setFlagged(false); }

  const metrics = [
    { label: "Cases", value: cases.length, detail: "Across your workspace" },
    { label: "In progress", value: cases.filter((item) => item.status === "draft" || item.status === "qa").length, detail: "Drafts and cases in review" },
    { label: "Cases with flags", value: cases.filter((item) => item.flags > 0).length, detail: "Recorded risks to assess" },
    { label: "Saved reports", value: cases.reduce((total, item) => total + item.reports, 0), detail: "Latest snapshots per case" },
  ];

  return <div className="space-y-8">
    <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
      <div className="max-w-2xl"><span className="eyebrow">Research workspace</span>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-fg sm:text-4xl">Due diligence<span className="text-accent">.</span></h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">Review an opportunity, trace its claims to evidence, and prepare a report for a decision.</p>
      </div>
      <Button asChild className="self-start sm:shrink-0"><Link href="/cases/new"><Plus className="h-4 w-4" aria-hidden="true" /> New case</Link></Button>
    </header>

    <section aria-label="Workspace totals" className="grid grid-cols-2 gap-px overflow-hidden rounded-card border border-line bg-line lg:grid-cols-4">
      {metrics.map((metric) => <div key={metric.label} className="min-w-0 bg-surface px-4 py-5 sm:px-6">
        <p className="text-xs font-medium text-muted">{metric.label}</p><p className="mt-2 font-mono text-3xl font-medium tabular-nums text-fg">{metric.value}</p><p className="mt-2 text-xs leading-relaxed text-faint">{metric.detail}</p>
      </div>)}
    </section>

    {!aiConfigured && <aside className="flex flex-col gap-4 border-l-2 border-accent bg-accent/5 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div><h2 className="text-sm font-semibold text-fg">Start with your evidence. Connect AI when you need it.</h2><p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted">Create cases and run rule-based checks now. Add an API key or a signed-in local CLI in settings to use AI research and drafting.</p></div>
      <Button asChild variant="outline" className="self-start sm:shrink-0"><Link href="/settings">AI settings <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link></Button>
    </aside>}

    {cases.length === 0 ? <section className="card px-6 py-12 text-center sm:py-16" aria-labelledby="empty-cases-heading">
      <FolderOpen className="mx-auto h-8 w-8 text-accent" aria-hidden="true" /><h2 id="empty-cases-heading" className="mt-5 text-xl font-semibold text-fg">Your first review starts with a case</h2>
      <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-muted">Add the project and the offer you want to examine. You can also explore a fictional case with sample evidence, findings, and a scorecard.</p>
      <div className="mt-6 flex flex-wrap items-start justify-center gap-3"><Button asChild><Link href="/cases/new">Create a case</Link></Button><LoadExampleButton /></div>
      <p className="mt-4 text-xs text-faint">The fictional example and rule-based checks do not call an AI provider.</p>
    </section> : <section className="card overflow-hidden" aria-labelledby="case-list-heading">
      <div className="border-b border-line p-4 sm:p-6">
        <div className="mb-5 flex items-center justify-between gap-3"><h2 id="case-list-heading" className="text-lg font-semibold text-fg">Case library</h2><span className="text-xs text-faint" aria-live="polite">{filtered.length} of {cases.length} cases</span></div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_12rem_12rem]">
          <div><label htmlFor="case-search" className="label">Search cases</label><div className="relative"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-faint" aria-hidden="true" /><Input id="case-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Project, client, analyst or report" className="pl-10" /></div></div>
          <Field label="Status"><Select value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">All statuses</option>{CASE_STATUS.map((value) => <option key={value} value={value}>{STATUS_LABELS[value]}</option>)}</Select></Field>
          <Field label="Sort by"><Select value={sort} onChange={(event) => setSort(event.target.value as SortOrder)}><option value="recent">Recently updated</option><option value="oldest">Oldest updated</option><option value="name">Project name</option><option value="score">Highest score</option></Select></Field>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs"><label className="inline-flex cursor-pointer items-center gap-2 text-muted"><input type="checkbox" checked={flagged} onChange={(event) => setFlagged(event.target.checked)} className="h-4 w-4 accent-accent" /> Only cases with red flags</label>{(query || status !== "all" || flagged) && <button type="button" onClick={clearFilters} className="text-link underline-offset-4 hover:underline">Clear filters</button>}</div>
      </div>

      {filtered.length === 0 ? <div className="px-6 py-12 text-center"><SlidersHorizontal className="mx-auto h-6 w-6 text-muted" aria-hidden="true" /><h3 className="mt-4 text-base font-semibold text-fg">No cases match these filters</h3><p className="mt-2 text-sm text-muted">Try another project name or show all statuses.</p><Button variant="outline" onClick={clearFilters} className="mt-5">Clear filters</Button></div> : <>
        <div className="hidden lg:block"><table className="w-full table-fixed text-left text-sm">
          <caption className="sr-only">Cases matching the search and status filters</caption>
          <thead className="bg-elevated text-xs text-muted"><tr><th scope="col" className="w-1/3 px-6 py-3 font-medium">Project</th><th scope="col" className="px-4 py-3 font-medium">Status</th><th scope="col" className="w-1/4 px-4 py-3 font-medium">Assessment</th><th scope="col" className="px-4 py-3 text-right font-medium">Evidence</th><th scope="col" className="px-6 py-3 text-right font-medium">Updated</th></tr></thead>
          <tbody className="divide-y divide-line">{filtered.map((item) => <tr key={item.id} className="group transition-colors hover:bg-elevated/70">
            <td className="px-6 py-5 align-top"><Link href={`/cases/${item.id}`} className="inline-flex max-w-full items-center gap-2 break-words font-semibold text-fg hover:text-link">{item.projectName}<ArrowRight className="h-3.5 w-3.5 shrink-0 text-faint group-hover:text-link" aria-hidden="true" /></Link><p className="mt-1 text-xs text-muted">{item.clientName ?? "No client assigned"}</p><p className="mt-2 text-xs leading-relaxed text-faint">{REPORT_TYPE_LABELS[item.reportType as ReportType] ?? item.reportType}</p></td>
            <td className="px-4 py-5 align-top"><StatusBadge status={item.status} /></td><td className="px-4 py-5 align-top"><Recommendation item={item} />{item.overallScore !== null && <p className="mt-2 font-mono text-xs tabular-nums text-muted">{item.overallScore.toFixed(1)} <span className="text-faint">/ 10</span></p>}</td>
            <td className="px-4 py-5 text-right align-top"><p className="tabular-nums text-muted">{item.sources} <span className="text-xs">{item.sources === 1 ? "source" : "sources"}</span></p><p className={cn("mt-2 text-xs tabular-nums", item.flags ? "text-warning" : "text-faint")}>{item.flags} {item.flags === 1 ? "flag" : "flags"}</p></td>
            <td className="px-6 py-5 text-right align-top text-xs text-faint"><div className="flex flex-col items-end gap-2"><time dateTime={item.updatedAt} className="whitespace-nowrap">{fmtDate(item.updatedAt)}</time>{item.reports > 0 && <span className="inline-flex items-center gap-1 whitespace-nowrap"><FileCheck2 className="h-3 w-3 shrink-0" aria-hidden="true" /> {item.reports} {item.reports === 1 ? "report" : "reports"}</span>}</div></td>
          </tr>)}</tbody>
        </table></div>
        <ul className="divide-y divide-line lg:hidden">{filtered.map((item) => <li key={item.id} className="p-4 sm:p-6">
          <div className="flex items-start justify-between gap-3"><div className="min-w-0"><Link href={`/cases/${item.id}`} className="break-words text-base font-semibold text-fg hover:text-link">{item.projectName}</Link><p className="mt-1 text-xs text-muted">{item.clientName ?? "No client assigned"}</p></div><StatusBadge status={item.status} /></div>
          <p className="mt-3 text-xs leading-relaxed text-faint">{REPORT_TYPE_LABELS[item.reportType as ReportType] ?? item.reportType}</p><div className="mt-4"><Recommendation item={item} /></div>
          <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-line pt-4 text-xs"><div><dt className="text-faint">Score</dt><dd className="mt-1 font-mono text-fg">{item.overallScore !== null ? `${item.overallScore.toFixed(1)}/10` : "Not scored"}</dd></div><div><dt className="text-faint">Sources</dt><dd className="mt-1 font-mono text-fg">{item.sources}</dd></div><div><dt className="text-faint">Red flags</dt><dd className={cn("mt-1 font-mono", item.flags ? "text-warning" : "text-fg")}>{item.flags}</dd></div></dl>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3"><time dateTime={item.updatedAt} className="text-xs text-faint">Updated {fmtDate(item.updatedAt)}</time><Link href={`/cases/${item.id}`} className="inline-flex items-center gap-2 text-sm font-medium text-link" aria-label={`Open ${item.projectName}`}>Open case <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link></div>
        </li>)}</ul>
      </>}
    </section>}
  </div>;
}
