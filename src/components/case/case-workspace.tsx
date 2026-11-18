"use client";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import { ArrowLeft, ClipboardList, FileCheck2, Files, LayoutDashboard, Search, SlidersHorizontal } from "lucide-react";
import { RECOMMENDATION_LABELS, REPORT_TYPE_LABELS, type Recommendation, type ReportType } from "@/domain/enums";
import { Badge, RecommendationBadge } from "@/components/ui/badge";
import { cn, titleCase } from "@/lib/utils";
import type { CaseData } from "./types";
import { OverviewTab } from "./tab-overview";
import { EvidenceTab } from "./tab-evidence";
import { RecordsTab } from "./tab-records";
import { FindingsTab } from "./tab-findings";
import { ScorecardTab } from "./tab-scorecard";
import { ReportTab } from "./tab-report";

const TABS = [
  { key: "overview", label: "Overview", icon: LayoutDashboard, description: "Set the mandate, run research and follow the case." },
  { key: "evidence", label: "Evidence", icon: Search, description: "Review sources, check claims and record supporting evidence." },
  { key: "records", label: "Records", icon: Files, description: "Capture the entities, people and assets behind the project." },
  { key: "findings", label: "Findings", icon: ClipboardList, description: "Review the analysis, record findings and resolve red flags." },
  { key: "scorecard", label: "Scorecard", icon: SlidersHorizontal, description: "Assess each category and review the recommendation." },
  { key: "report", label: "Report", icon: FileCheck2, description: "Review the narrative, check readiness and save a report version." },
] as const;
type TabKey = (typeof TABS)[number]["key"];

function tabFromUrl(): TabKey {
  const value = new URLSearchParams(window.location.search).get("tab");
  return TABS.find((item) => item.key === value)?.key ?? "overview";
}

export function CaseWorkspace({ data }: { data: CaseData }) {
  const [tab, setTab] = useState<TabKey>("overview");
  const [visited, setVisited] = useState<Set<TabKey>>(() => new Set(["overview"]));
  const buttons = useRef<Partial<Record<TabKey, HTMLButtonElement | null>>>({});
  const rec = data.scorecard?.recommendation as Recommendation | undefined;

  useEffect(() => {
    const sync = () => {
      const next = tabFromUrl();
      setTab(next);
      setVisited((previous) => new Set([...previous, next]));
      const url = new URL(window.location.href);
      if (url.searchParams.has("tab") && url.searchParams.get("tab") !== next) {
        url.searchParams.set("tab", next);
        window.history.replaceState(null, "", url);
      }
    };
    sync();
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, [data.id]);

  function selectTab(next: TabKey) {
    setTab(next);
    setVisited((previous) => new Set([...previous, next]));
    const url = new URL(window.location.href);
    if (url.searchParams.get("tab") !== next) {
      url.searchParams.set("tab", next);
      window.history.pushState(null, "", url);
    }
  }

  function onTabKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const last = TABS.length - 1;
    const nextIndex = event.key === "ArrowRight" ? (index + 1) % TABS.length
      : event.key === "ArrowLeft" ? (index + last) % TABS.length
      : event.key === "Home" ? 0 : event.key === "End" ? last : null;
    if (nextIndex === null) return;
    event.preventDefault();
    const next = TABS[nextIndex]?.key;
    if (!next) return;
    selectTab(next);
    buttons.current[next]?.focus({ preventScroll: true });
    buttons.current[next]?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }

  const panels = {
    overview: <OverviewTab data={data} />,
    evidence: <EvidenceTab data={data} />,
    records: <RecordsTab data={data} />,
    findings: <FindingsTab data={data} />,
    scorecard: <ScorecardTab data={data} />,
    report: <ReportTab data={data} />,
  };

  return (
    <div className="min-w-0 space-y-6">
      <header className="space-y-4">
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-muted transition hover:text-fg">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> All cases
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="min-w-0 flex-1 basis-72">
            <p className="font-mono text-xs uppercase tracking-wider text-muted">{REPORT_TYPE_LABELS[data.reportType as ReportType] ?? data.reportType}</p>
            <h1 className="mt-2 break-words text-3xl font-semibold tracking-tight text-fg">{data.projectName}</h1>
            <p className="mt-2 text-sm text-muted">{data.clientName || "No client assigned"} <span aria-hidden="true">·</span> {data.analyst ? `Analyst: ${data.analyst}` : "No analyst assigned"}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface p-4">
            <div className="space-y-2">
              <p className="text-xs text-muted">Case status</p>
              <Badge className="bg-elevated text-fg">{titleCase(data.status)}</Badge>
            </div>
            {rec && <div className="space-y-2 border-l border-line pl-3"><p className="text-xs text-muted">Recommendation</p><RecommendationBadge rec={rec} label={RECOMMENDATION_LABELS[rec] ?? rec} /></div>}
            {data.scorecard?.overallScore != null && <div className="border-l border-line pl-3"><p className="text-xs text-muted">Overall score</p><p className="mt-1 text-2xl font-semibold tabular-nums text-fg">{data.scorecard.overallScore}<span className="ml-1 text-sm font-normal text-muted">/ 10</span></p></div>}
          </div>
        </div>
      </header>

      <div className="space-y-3">
        <div role="tablist" aria-label="Case sections" aria-orientation="horizontal" className="flex gap-1 overflow-x-auto rounded-xl border border-line bg-surface p-1.5">
          {TABS.map((item, index) => (
            <button key={item.key} ref={(node) => { buttons.current[item.key] = node; }} type="button" role="tab"
              id={`case-${data.id}-tab-${item.key}`} aria-controls={`case-${data.id}-panel-${item.key}`} aria-selected={tab === item.key}
              tabIndex={tab === item.key ? 0 : -1} onKeyDown={(event) => onTabKey(event, index)} onClick={() => selectTab(item.key)}
              className={cn("flex min-h-10 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-lg px-4 text-sm font-medium transition-colors", tab === item.key ? "bg-accent text-accent-fg" : "text-muted hover:bg-elevated hover:text-fg")}
            ><item.icon className="h-4 w-4 shrink-0" aria-hidden="true" />{item.label}</button>
          ))}
        </div>
        <p className="text-sm text-muted">{TABS.find((item) => item.key === tab)?.description}</p>
      </div>

      {TABS.map((item) => (
        <section key={`${data.id}-${item.key}`} role="tabpanel" id={`case-${data.id}-panel-${item.key}`} aria-labelledby={`case-${data.id}-tab-${item.key}`}
          hidden={tab !== item.key} tabIndex={0} className={cn("min-w-0 rounded-xl", tab !== item.key && "hidden")}>
          {visited.has(item.key) ? panels[item.key] : null}
        </section>
      ))}
    </div>
  );
}
