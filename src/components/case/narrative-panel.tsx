"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { fmtDateTime } from "@/lib/utils";
import { apiDelete } from "./api-client";
import { ConfirmRemoveButton } from "./confirm-remove-button";
import { useMutate } from "./use-mutate";
import { TONES, UsageStats, formatElapsed } from "./provenance-badges";
import { useElapsed, useResearchStatus } from "./research-panel";
import { isRecord, readTextList, readUsageTotals, type ActiveRun, type AiStatus, type ResearchRunView, type UsageTotals } from "./types";

type NarrativeState = "ai" | "ai_stale" | "rules";

/** GET /api/cases/[id]/narrative → narrative. */
interface NarrativeInfo {
  provider: string;
  providerLabel: string;
  model: string;
  updatedAt: string;
  state: NarrativeState;
}

const STATE_BADGES: Record<NarrativeState, { label: string; tone: string }> = {
  ai: { label: "In use in the report", tone: TONES.good },
  ai_stale: { label: "Out of date", tone: TONES.warn },
  rules: { label: "Not in use", tone: TONES.neutral },
};

/** AI error codes the user fixes in Settings. */
const SETTINGS_CODES = new Set(["not_configured", "auth", "cli_missing"]);

function readNarrative(value: unknown): NarrativeInfo | null {
  if (!isRecord(value)) return null;
  const { provider, providerLabel, model, updatedAt, state } = value;
  if (typeof provider !== "string" || typeof model !== "string" || typeof updatedAt !== "string") return null;
  return {
    provider,
    providerLabel: typeof providerLabel === "string" ? providerLabel : provider,
    model,
    updatedAt,
    state: state === "ai" || state === "ai_stale" ? state : "rules",
  };
}

class NarrativeRequestError extends Error {
  readonly code: string | null;

  constructor(message: string, code: string | null) {
    super(message);
    this.name = "NarrativeRequestError";
    this.code = code;
  }
}

/** GET or POST the narrative route. Errors keep the AI error code from {error, details: {code}}, which apiPost folds into the message. */
async function narrativeRequest(caseId: string, method: "GET" | "POST"): Promise<Record<string, unknown>> {
  const res = await fetch(`/api/cases/${caseId}/narrative`, { method, cache: "no-store" });
  const body: unknown = await res.json().catch(() => null);
  const record = isRecord(body) ? body : {};
  if (!res.ok) {
    const details = record.details;
    const code = isRecord(details) && typeof details.code === "string" ? details.code : null;
    throw new NarrativeRequestError(typeof record.error === "string" ? record.error : `Request failed (HTTP ${res.status})`, code);
  }
  return record;
}

type DraftOutcome =
  | { ok: true; narrative: NarrativeInfo | null; usage: UsageTotals | null; notes: string[] }
  | { ok: false; message: string; code: string | null };

interface Draft {
  startedAt: number;
  outcome: Promise<DraftOutcome>;
}

/**
 * Keep drafts in flight by case, so a remounted panel can reattach instead
 * of offering a second paid request while the first is still running.
 */
const drafts = new Map<string, Draft>();

function startDraft(caseId: string): Draft {
  const running = drafts.get(caseId);
  if (running) return running;
  const outcome = narrativeRequest(caseId, "POST").then(
    (body): DraftOutcome => ({ ok: true, narrative: readNarrative(body.narrative), usage: readUsageTotals(body.usage), notes: readTextList(body.notes) }),
    (err: unknown): DraftOutcome => ({
      ok: false,
      message: err instanceof Error ? err.message : String(err),
      code: err instanceof NarrativeRequestError ? err.code : null,
    }),
  );
  const draft: Draft = { startedAt: Date.now(), outcome: outcome.finally(() => drafts.delete(caseId)) };
  drafts.set(caseId, draft);
  return draft;
}

/** Draft, check and remove the AI-written report narrative. */
export function NarrativePanel({ caseId, ai, active, runs, revision }: { caseId: string; ai: AiStatus; active: ActiveRun | null; runs: ResearchRunView[]; revision: string }) {
  const research = useResearchStatus(caseId, active, runs);
  const removal = useMutate();
  const [narrative, setNarrative] = useState<NarrativeInfo | null>(null);
  const [loading, setLoading] = useState<"pending" | "ready" | "failed">("pending");
  const [draftStartedAt, setDraftStartedAt] = useState<number | null>(() => drafts.get(caseId)?.startedAt ?? null);
  const [outcome, setOutcome] = useState<DraftOutcome | null>(null);
  const elapsed = useElapsed(draftStartedAt);
  const requestVersion = useRef(0);
  const [reload, setReload] = useState(0);

  const follow = useCallback(async (draft: Draft) => {
    requestVersion.current += 1;
    setDraftStartedAt(draft.startedAt);
    const result = await draft.outcome;
    requestVersion.current += 1;
    setDraftStartedAt(null);
    setReload((value) => value + 1);
    setOutcome(result);
    if (result.ok) {
      setNarrative(result.narrative);
      setLoading("pending");
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const version = ++requestVersion.current;
    setLoading("pending");
    narrativeRequest(caseId, "GET")
      .then((body) => {
        if (cancelled || version !== requestVersion.current) return;
        setNarrative(readNarrative(body.narrative));
        setLoading("ready");
      })
      .catch(() => {
        if (!cancelled && version === requestVersion.current) setLoading("failed");
      });
    return () => { cancelled = true; };
  }, [caseId, revision, reload]);

  useEffect(() => {
    const inFlight = drafts.get(caseId);
    if (inFlight) void follow(inFlight);
  }, [caseId, follow]);

  function draft() {
    setOutcome(null);
    removal.setError(null);
    void follow(startDraft(caseId));
  }

  async function remove() {
    setOutcome(null);
    const removed = await removal.run(() => apiDelete(`/api/cases/${caseId}/narrative`), { refresh: false });
    if (removed) {
      requestVersion.current += 1;
      setNarrative(null);
      setReload((value) => value + 1);
    }
    return removed;
  }

  const drafting = draftStartedAt !== null;
  const runActive = research.active !== null;
  const failure = outcome && !outcome.ok ? outcome : null;
  const success = outcome && outcome.ok ? outcome : null;
  const badge = narrative && loading === "ready" ? STATE_BADGES[narrative.state] : null;

  return (
    <Card>
      <CardHeader
        title="Report narrative"
        subtitle="AI drafting is optional. Scores and blockers determine the recommendation; the narrative supplies the prose."
      />
      <CardBody className="space-y-3">
        <p className="text-xs leading-relaxed text-muted">After editing intake or structured records, review and redraft the narrative before sharing. Those edits may not mark an existing narrative as out of date.</p>
        {loading === "pending" && !drafting && <p className="text-sm text-faint">Checking for an AI narrative…</p>}
        {loading === "failed" && <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-warning"><p>Could not refresh the narrative status.</p><Button variant="outline" size="sm" onClick={() => setReload((value) => value + 1)}>Retry status check</Button></div>}
        {loading === "ready" && !narrative && <p className="text-sm text-muted">No AI narrative yet. The report uses the built-in text.</p>}
        {narrative && badge && (
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className={badge.tone}>{badge.label}</Badge>
              <span className="text-xs text-muted">
                Drafted by {narrative.providerLabel} · {narrative.model} · {fmtDateTime(narrative.updatedAt)}
              </span>
            </div>
            {narrative.state === "ai_stale" && (
              <p className="text-xs leading-relaxed text-warning">
                Results changed since it was drafted; the report uses the built-in text until you redraft.
              </p>
            )}
          </div>
        )}

        {success?.usage && <UsageStats usage={success.usage} provider={narrative?.provider ?? ai.provider} />}
        {success && success.notes.length > 0 && (
          <div className="rounded-lg border border-warning/25 bg-warning/10 px-3 py-2 text-sm text-warning">
            <ul className="space-y-0.5">
              {success.notes.map((note) => (
                <li key={note}>• {note}</li>
              ))}
            </ul>
          </div>
        )}
        {failure && (
          <p role="alert" className="text-xs leading-relaxed text-danger">
            {failure.message}
            {failure.code !== null && SETTINGS_CODES.has(failure.code) && (
              <>
                {" "}
                <Link href="/settings" className="text-link hover:underline">
                  Open Settings
                </Link>
              </>
            )}
          </p>
        )}
        {removal.error && (
          <p role="alert" className="text-xs text-danger">
            {removal.error}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {ai.configured ? (
            <Button size="sm" onClick={draft} disabled={drafting || runActive || removal.busy} aria-busy={drafting}>
              {drafting ? `Drafting… ${formatElapsed(elapsed ?? 0)}` : narrative ? "Redraft narrative with AI" : "Draft narrative with AI"}
            </Button>
          ) : (
            <p className="text-xs text-muted">
              <Link href="/settings" className="text-link hover:underline">
                Set up an AI provider in Settings
              </Link>{" "}
              to draft the narrative.
            </p>
          )}
          {narrative && (
            <ConfirmRemoveButton label="AI narrative" description="The live report will return to its built-in text. This removes the saved AI draft and cannot be undone." onRemove={remove} disabled={drafting || removal.busy} />
          )}
        </div>
        {ai.configured && (
          <p className="text-xs text-faint">
            {drafting
              ? "Drafting usually takes one to three minutes. You can switch tabs while it runs."
              : runActive
                ? "Drafting is available once the research run finishes."
                : "Drafting takes one to three minutes and uses your provider's tokens or plan limits."}
          </p>
        )}
      </CardBody>
    </Card>
  );
}
