"use client";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { ResearchMode } from "@/domain/enums";
import { cn, fmtDateTime, titleCase } from "@/lib/utils";
import { apiPost } from "./api-client";
import { useMutate } from "./use-mutate";
import { RunStatusBadge, UsageStats, formatElapsed, providerName } from "./provenance-badges";
import { readResearchStatus, readStartedRunId, type ActiveRun, type AiStatus, type ResearchRunView, type ResearchStatus } from "./types";

const POLL_MS = 2_000;

const MODE_LABELS: Record<string, string> = {
  ai: "AI research",
  offline: "Rule-based checks",
};

/** Labels for the AI stages; the rule-based workers use their title-cased names. */
const TRACE_LABELS: Record<string, string> = {
  "ai-research": "AI research",
  "source-verifier": "Quote check",
  "ai-analysis": "AI analysis",
};

const STAGE_LABELS: Record<string, string> = {
  research: "Research",
  analysis: "Analysis",
};

const TRACE_TONE: Record<string, string> = {
  ok: "bg-success/10 text-success",
  partial: "bg-warning/10 text-warning",
  failed: "bg-danger/10 text-danger",
  skipped: "bg-elevated text-faint",
};

function isLive(run: ResearchRunView | undefined): boolean {
  return run !== undefined && (run.status === "queued" || run.status === "running");
}

/**
 * Research status for a case: the server-rendered value, kept current by
 * polling every 2 s while a run is active. When the run ends the page data is
 * refreshed so findings, evidence and scores show the results.
 */
export function useResearchStatus(caseId: string, active: ActiveRun | null, runs: ResearchRunView[]) {
  const router = useRouter();
  const [status, setStatus] = useState<ResearchStatus>({ active, runs });
  const [rendered, setRendered] = useState<ResearchStatus>({ active, runs });
  const [pollFailed, setPollFailed] = useState(false);

  // Fresh server data (after router.refresh) replaces what polling found.
  if (rendered.active !== active || rendered.runs !== runs) {
    setRendered({ active, runs });
    setStatus({ active, runs });
  }

  const polling = status.active !== null;
  useEffect(() => {
    if (!polling) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      let next: ResearchStatus | null = null;
      try {
        const res = await fetch(`/api/cases/${caseId}/research`, { cache: "no-store" });
        next = res.ok ? readResearchStatus(await res.json()) : null;
      } catch {
        next = null;
      }
      if (stopped) return;
      setPollFailed(next === null);
      if (next) {
        setStatus(next);
        if (!next.active) {
          router.refresh();
          return;
        }
      }
      timer = setTimeout(() => void tick(), POLL_MS);
    };
    void tick();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [polling, caseId, router]);

  /** Show a run this client just started, before the first poll answers. */
  const started = useCallback((run: ResearchRunView) => {
    setStatus((prev) => ({
      active: { runId: run.id, startedAt: Date.now() },
      runs: [run, ...prev.runs.filter((r) => r.id !== run.id)],
    }));
  }, []);

  return { active: status.active, runs: status.runs, pollFailed, started };
}

/** Milliseconds since `since`, ticking every second; null when `since` is null or before the first tick. */
export function useElapsed(since: number | null): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    if (since === null) return;
    const update = () => setNow(Date.now());
    const first = setTimeout(update, 0);
    const timer = setInterval(update, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [since]);
  return since === null || now === null ? null : Math.max(0, now - since);
}

function queuedRun(id: string, mode: ResearchMode, ai: AiStatus): ResearchRunView {
  return {
    id,
    status: "queued",
    mode,
    provider: mode === "ai" ? ai.provider : null,
    model: mode === "ai" && ai.model ? ai.model : null,
    stage: "Queued",
    error: null,
    createdAt: new Date().toISOString(),
    startedAt: null,
    finishedAt: null,
    usage: null,
    traces: [],
  };
}

function ModeOption({
  name,
  value,
  checked,
  disabled,
  onSelect,
  title,
  description,
  children,
}: {
  name: string;
  value: ResearchMode;
  checked: boolean;
  disabled: boolean;
  onSelect: (value: ResearchMode) => void;
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <label
      className={cn(
        "flex items-start gap-2.5 rounded-lg border px-3 py-2.5 transition-colors",
        checked ? "border-line-strong bg-elevated" : "border-line",
        disabled ? "cursor-not-allowed" : "cursor-pointer hover:border-line-strong",
      )}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        disabled={disabled}
        onChange={() => onSelect(value)}
        className="mt-0.5 h-4 w-4 shrink-0 accent-accent disabled:opacity-50"
      />
      <span className="min-w-0">
        <span className={cn("block text-sm font-medium", disabled ? "text-muted" : "text-fg")}>{title}</span>
        <span className="mt-0.5 block text-xs leading-relaxed text-muted">{description}</span>
        {children && <span className="mt-1.5 block text-xs leading-relaxed text-faint">{children}</span>}
      </span>
    </label>
  );
}

function RunSummary({ run, stale }: { run: ResearchRunView; stale: boolean }) {
  const ai = run.mode === "ai";
  const who = ai ? [providerName(run.provider), run.model ?? "default model"].filter(Boolean).join(" · ") : null;
  const duration = run.startedAt && run.finishedAt ? Date.parse(run.finishedAt) - Date.parse(run.startedAt) : null;
  const calls = run.usage?.calls ?? [];
  const mixedModels = new Set(calls.map((call) => call.model)).size > 1;

  return (
    <div className="space-y-3 border-t border-line pt-4" role="status">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-muted">Last run</span>
        <RunStatusBadge status={run.status} />
        <span className="text-xs text-muted">
          {MODE_LABELS[run.mode] ?? titleCase(run.mode)}
          {who ? ` · ${who}` : ""}
        </span>
      </div>
      <p className="text-xs text-faint">
        {run.finishedAt ? `Finished ${fmtDateTime(run.finishedAt)}` : `Started ${fmtDateTime(run.startedAt ?? run.createdAt)}`}
        {duration !== null && duration >= 0 ? ` · took ${formatElapsed(duration)}` : ""}
      </p>
      {stale && (
        <p className="text-xs text-warning">This run stopped without finishing, probably because the app restarted. Close it to clear it.</p>
      )}
      {run.error && (run.status === "failed" || run.status === "cancelled") && (
        <p className={cn("text-xs leading-relaxed", run.status === "failed" ? "text-danger" : "text-muted")}>{run.error}</p>
      )}
      {ai && run.usage && <UsageStats usage={run.usage} provider={run.provider} />}
      {ai && mixedModels && (
        <p className="text-xs text-faint">{calls.map((call) => `${STAGE_LABELS[call.stage] ?? titleCase(call.stage)}: ${call.model}`).join(" · ")}</p>
      )}
      {run.traces.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {run.traces.map((t, i) => (
            <span
              key={`${t.worker}-${i}`}
              className={cn("rounded px-1.5 py-0.5 text-xs", TRACE_TONE[t.status] ?? "bg-elevated text-muted")}
              title={`${t.worker}: ${t.status}, confidence ${t.confidence}, ${formatElapsed(t.durationMs)}${t.error ? `. ${t.error}` : ""}`}
            >
              {TRACE_LABELS[t.worker] ?? titleCase(t.worker)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** Start, follow and cancel research runs, and show how the last run went. */
export function ResearchPanel({ caseId, ai, active, runs }: { caseId: string; ai: AiStatus; active: ActiveRun | null; runs: ResearchRunView[] }) {
  const router = useRouter();
  const research = useResearchStatus(caseId, active, runs);
  const starting = useMutate();
  const cancelling = useMutate();
  const [choice, setChoice] = useState<ResearchMode>(ai.configured ? "ai" : "offline");
  const [stoppingRunId, setStoppingRunId] = useState<string | null>(null);

  const mode: ResearchMode = ai.configured ? choice : "offline";
  const running = research.active !== null;
  const latest = research.runs[0];
  const liveRun = research.runs.find((r) => r.id === research.active?.runId) ?? latest;
  const stale = !running && isLive(latest);
  const stopping = running && stoppingRunId === research.active?.runId;
  const elapsed = useElapsed(research.active?.startedAt ?? null);
  const error = starting.error ?? cancelling.error;

  async function start() {
    cancelling.setError(null);
    const ok = await starting.run(async () => {
      const runId = readStartedRunId(await apiPost(`/api/cases/${caseId}/research`, { mode }));
      if (runId) research.started(queuedRun(runId, mode, ai));
    });
    // 409: a run started elsewhere. 400: Settings may have changed. Reload the case either way.
    if (!ok) router.refresh();
  }

  async function cancel() {
    starting.setError(null);
    setStoppingRunId(research.active?.runId ?? null);
    const ok = await cancelling.run(() => apiPost(`/api/cases/${caseId}/research/cancel`, {}));
    if (!ok) setStoppingRunId(null);
  }

  return (
    <Card>
      <CardHeader
        title="Research & checks"
        subtitle="Review the sources and intake first. A run replaces earlier generated findings and scores while keeping your analyst entries."
      />
      <CardBody className="space-y-4">
        <fieldset disabled={running || starting.busy}>
          <legend className="sr-only">Research mode</legend>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <ModeOption
              name={`research-mode-${caseId}`}
              value="ai"
              checked={mode === "ai"}
              disabled={!ai.configured}
              onSelect={setChoice}
              title="AI research"
              description="Searches the web, checks quotes against the cited pages and drafts findings and scores, then runs the rule-based checks."
            >
              {ai.configured ? (
                <>
                  Uses {ai.label ?? providerName(ai.provider)} · {ai.model || "default model"}. AI research uses your provider&apos;s tokens or plan limits.
                </>
              ) : (
                <Link href="/settings" className="text-link hover:underline">
                  Set up an AI provider in Settings
                </Link>
              )}
            </ModeOption>
            <ModeOption
              name={`research-mode-${caseId}`}
              value="offline"
              checked={mode === "offline"}
              disabled={false}
              onSelect={setChoice}
              title="Rule-based checks only"
              description="Runs the built-in checks on the sources and records already in the case. Makes no AI calls."
            />
          </div>
        </fieldset>

        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={start} disabled={running || starting.busy}>
            {starting.busy ? "Starting…" : mode === "ai" ? "Start AI research" : "Run rule-based checks"}
          </Button>
          {(running || stale) && (
            <Button size="sm" variant="outline" onClick={cancel} disabled={stopping || cancelling.busy}>
              {stopping ? "Stopping…" : running ? "Cancel run" : "Close run"}
            </Button>
          )}
        </div>
        {error && (
          <p role="alert" className="text-xs text-danger">
            {error}
          </p>
        )}

        {running && (
          <div className="rounded-lg border border-line bg-elevated/50 px-3 py-2.5">
            <p className="break-words text-sm text-fg" aria-live="polite">
              {liveRun?.stage ?? "Starting"}
            </p>
            <p className="mt-0.5 text-xs text-muted">
              {MODE_LABELS[liveRun?.mode ?? mode] ?? mode}
              {elapsed !== null ? ` · running for ${formatElapsed(elapsed)}` : ""}
            </p>
            {research.pollFailed && <p className="mt-1 text-xs text-warning">Could not refresh the run status. Retrying.</p>}
          </div>
        )}

        {!running &&
          (latest ? (
            <RunSummary run={latest} stale={stale} />
          ) : (
            <p className="text-sm text-muted">No research run yet. Start one to get suggested findings, red flags and scores.</p>
          ))}
      </CardBody>
    </Card>
  );
}
