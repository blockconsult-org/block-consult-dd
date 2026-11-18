/**
 * Research-run orchestrator.
 *
 * Offline mode runs the rule-based worker pipeline over what the analyst has
 * entered. AI mode first has the active provider research the web (sources
 * and quoted claims), checks each quote against the cited page, runs the same
 * workers over the enlarged evidence base, and then asks the provider for an
 * analyst-level assessment. Every stage writes a WorkerTrace.
 *
 * Results replace earlier machine-generated rows only: analyst findings, and
 * scores the analyst set by hand, are never overwritten.
 */
import { prisma } from "@/lib/db";
import { parseJson, toJson } from "@/domain/json";
import { mergeGating, readSavedGating } from "@/domain/gating";
import type { ResearchMode } from "@/domain/enums";
import { readScoreSources, type ScoreSource, type ScoreSources } from "@/domain/score-sources";
import { computeScorecard, type GatingFlags, type ScoreInput, type ScorecardResult } from "@/domain/scoring";
import { runAiAnalysis, type AnalysisStageResult } from "@/ai/analysis";
import { runAiResearch, verifyAiSources, type ResearchStageResult, type VerificationSummary } from "@/ai/research";
import { SCORE_KEYS } from "@/ai/schemas";
import { getAiSettings } from "@/ai/settings";
import { addUsage, AiError, emptyUsage, isAbortError, type AiUsage } from "@/ai/types";
import { getConnectors } from "./connectors";
import { loadSnapshot } from "./snapshot";
import type { CaseSnapshot, FindingDraft, RedFlagDraft, Worker, WorkerResult } from "./types";
import { aggregateSuggestedScores } from "./workers/scoring";
import { intakeParser } from "./workers/intake-parser";
import { searchPlanner } from "./workers/search-planner";
import { webResearch } from "./workers/web-research";
import { identityWorker } from "./workers/identity";
import { exchangeData } from "./workers/exchange-data";
import { onchainWorker } from "./workers/onchain";
import { tokenomicsWorker } from "./workers/tokenomics";
import { entityTeamWorker } from "./workers/entity-team";
import { stablecoinRwaWorker } from "./workers/stablecoin-rwa";
import { legalIssueSpotting } from "./workers/legal-issue-spotting";
import { fraudRedFlag } from "./workers/fraud-redflag";
import { citationVerifier } from "./workers/citation-verifier";

/** Ordered rule-based pipeline. */
export const PIPELINE: Worker[] = [
  intakeParser,
  searchPlanner,
  webResearch,
  identityWorker,
  exchangeData,
  onchainWorker,
  tokenomicsWorker,
  entityTeamWorker,
  stablecoinRwaWorker,
  legalIssueSpotting,
  fraudRedFlag,
  citationVerifier,
];

export interface RunSummaryJson {
  mode: ResearchMode;
  moduleOutputs: Record<string, unknown>;
  /** Gating applied to the scorecard: worker flags plus AI flags. */
  gating: GatingFlags;
  /** Scores the rule-based workers suggested. */
  suggested: ScoreInput;
  /** Gating flags raised by the AI analyst (this run, or carried from the last AI run in offline mode). */
  aiGating: Partial<GatingFlags>;
  findingsCreated: number;
  redFlagsCreated: number;
  ai?: {
    research?: Omit<ResearchStageResult, "usage">;
    verification?: VerificationSummary;
    analysis?: Omit<AnalysisStageResult, "usage" | "findings" | "redFlags"> & { findings: number; redFlags: number };
    notes: string[];
  };
}

// ---------------------------------------------------------------------------
// Progress
// ---------------------------------------------------------------------------

interface Progress {
  stage(label: string): Promise<void>;
  detail(message: string): void;
  logs(): string[];
}

/** Writes the run's stage label, with live detail throttled to one write every 1.5 s. */
function progressFor(runId: string): Progress {
  let label = "Starting";
  let pending: string | null = null;
  let timer: NodeJS.Timeout | null = null;
  let logs: string[] = [];
  const write = (text: string) =>
    prisma.researchRun.update({ where: { id: runId }, data: { stage: text.slice(0, 300) } }).catch(() => undefined);
  return {
    async stage(next) {
      label = next;
      pending = null;
      logs = [];
      await write(next);
    },
    detail(message) {
      logs.push(message);
      if (logs.length > 200) logs.shift();
      pending = `${label} · ${message}`;
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        if (pending) void write(pending);
        pending = null;
      }, 1500);
      timer.unref?.();
    },
    logs: () => [...logs],
  };
}

async function trace(
  runId: string,
  worker: string,
  started: number,
  status: "ok" | "partial" | "failed" | "skipped",
  output: unknown,
  logs: string[],
  error?: string,
  confidence = "medium",
): Promise<void> {
  await prisma.workerTrace.create({
    data: {
      researchRunId: runId,
      worker,
      status,
      startedAt: new Date(started),
      finishedAt: new Date(),
      durationMs: Date.now() - started,
      confidence,
      outputJson: toJson(output),
      logs: toJson(logs),
      error: error ?? null,
    },
  });
}

// ---------------------------------------------------------------------------
// Rule-based workers
// ---------------------------------------------------------------------------

async function runWorker(worker: Worker, snapshot: CaseSnapshot): Promise<WorkerResult> {
  const logs: string[] = [];
  const ctx = { snapshot, connectors: getConnectors(), log: (m: string) => logs.push(m) };
  try {
    if (worker.applies && !worker.applies(snapshot)) {
      return { worker: worker.name, status: "skipped", confidence: "low", logs: ["not applicable"], findings: [], redFlags: [], openQuestions: [], gating: {}, moduleOutput: {} };
    }
    const partial = await worker.run(ctx);
    return { ...partial, worker: worker.name, logs };
  } catch (err) {
    return {
      worker: worker.name,
      status: "failed",
      confidence: "low",
      logs,
      findings: [],
      redFlags: [],
      openQuestions: [],
      gating: {},
      moduleOutput: {},
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function runPipeline(runId: string, caseId: string, snapshot: CaseSnapshot, signal: AbortSignal): Promise<WorkerResult[]> {
  const results: WorkerResult[] = [];
  for (const worker of PIPELINE) {
    signal.throwIfAborted();
    const started = Date.now();
    const result = await runWorker(worker, snapshot);
    results.push(result);
    await prisma.workerTrace.create({
      data: {
        researchRunId: runId,
        worker: result.worker,
        status: result.status,
        startedAt: new Date(started),
        finishedAt: new Date(),
        durationMs: Date.now() - started,
        confidence: result.confidence,
        inputJson: toJson({ caseId }),
        outputJson: toJson(result.moduleOutput),
        logs: toJson(result.logs),
        error: result.error,
      },
    });
  }
  return results;
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

function findingData(caseId: string, f: FindingDraft, source: "worker" | "ai") {
  return {
    caseId,
    category: f.category,
    title: f.title,
    claim: f.claim,
    analysis: f.analysis,
    severity: f.severity,
    confidence: f.confidence,
    impact: f.impact,
    mitigation: f.mitigation,
    openQuestions: toJson(f.openQuestions ?? []),
    evidenceIds: toJson(f.evidenceIds ?? []),
    source,
  };
}

function redFlagData(caseId: string, flag: RedFlagDraft, source: "worker" | "ai") {
  return {
    caseId,
    code: flag.code,
    title: flag.title,
    severity: flag.severity,
    evidence: flag.evidence,
    impact: flag.impact,
    mitigation: flag.mitigation,
    triggered: flag.triggered,
    source,
  };
}

/** Replace machine-generated findings and red flags. AI rows are replaced only by an AI run. */
async function saveFindings(
  caseId: string,
  mode: ResearchMode,
  results: WorkerResult[],
  analysis: AnalysisStageResult | null,
): Promise<{ findings: number; redFlags: number }> {
  const replaced = mode === "ai" ? ["worker", "ai"] : ["worker"];
  const workerFindings = results.flatMap((r) => r.findings);
  const workerFlags = results.flatMap((r) => r.redFlags);
  const aiFindings = analysis?.findings ?? [];
  const aiFlags = analysis?.redFlags ?? [];
  await prisma.$transaction(
    async (tx) => {
      await tx.riskFinding.deleteMany({ where: { caseId, source: { in: replaced } } });
      await tx.redFlag.deleteMany({ where: { caseId, source: { in: replaced } } });
      for (const f of workerFindings) await tx.riskFinding.create({ data: findingData(caseId, f, "worker") });
      for (const f of aiFindings) await tx.riskFinding.create({ data: findingData(caseId, f, "ai") });
      for (const flag of workerFlags) await tx.redFlag.create({ data: redFlagData(caseId, flag, "worker") });
      for (const flag of aiFlags) await tx.redFlag.create({ data: redFlagData(caseId, flag, "ai") });
    },
    { timeout: 30_000 },
  );
  return { findings: workerFindings.length + aiFindings.length, redFlags: workerFlags.length + aiFlags.length };
}

function onlyTrue(flags: Partial<GatingFlags>): Partial<GatingFlags> {
  const out: Partial<GatingFlags> = {};
  for (const [key, on] of Object.entries(flags) as [keyof GatingFlags, boolean | undefined][]) if (on) out[key] = true;
  return out;
}

/** AI gating from the most recent completed AI run, carried into offline re-runs. */
async function latestAiGating(caseId: string): Promise<Partial<GatingFlags>> {
  const run = await prisma.researchRun.findFirst({ where: { caseId, status: "completed", mode: "ai" }, orderBy: { createdAt: "desc" } });
  return onlyTrue(parseJson<Partial<RunSummaryJson>>(run?.summaryJson, {}).aiGating ?? {});
}

/**
 * Merge suggestions into the scorecard. Scores the analyst set stay; AI
 * scores beat rule-based ones; an offline run keeps scores from the last AI
 * run. Rows saved before score sources were tracked count as analyst input.
 */
async function updateScorecard(
  caseId: string,
  mode: ResearchMode,
  suggested: ScoreInput,
  gating: GatingFlags,
  analysis: AnalysisStageResult | null,
): Promise<ScorecardResult> {
  const existing = await prisma.scorecard.findUnique({ where: { caseId } });
  const sources = readScoreSources(existing?.scoreSources);
  const rationale = parseJson<Record<string, string>>(existing?.rationale, {});
  const merged: ScoreInput = {};
  const nextSources: ScoreSources = {};

  for (const key of SCORE_KEYS) {
    const prior = existing ? existing[key] : null;
    const priorSource: ScoreSource | undefined = prior == null ? undefined : (sources[key] ?? "analyst");
    const ai = analysis?.scores[key];
    const worker = suggested[key];
    if (priorSource === "analyst") {
      merged[key] = prior;
      nextSources[key] = "analyst";
    } else if (ai) {
      merged[key] = ai.score;
      nextSources[key] = "ai";
      rationale[key] = ai.rationale;
    } else if (mode === "offline" && priorSource === "ai") {
      merged[key] = prior;
      nextSources[key] = "ai";
    } else if (worker != null) {
      merged[key] = worker;
      nextSources[key] = "worker";
    } else {
      merged[key] = null;
    }
  }

  const scorecard = computeScorecard(merged, mergeGating(gating, readSavedGating(existing?.manualGating)));
  const data = {
    ...Object.fromEntries(SCORE_KEYS.map((key) => [key, merged[key] ?? null])),
    overallScore: scorecard.overallScore,
    recommendation: scorecard.recommendation,
    gatingApplied: toJson(scorecard.gatingApplied),
    rationale: toJson(rationale),
    scoreSources: toJson(nextSources),
  };
  await prisma.scorecard.upsert({ where: { caseId }, update: data, create: { caseId, ...data } });
  return scorecard;
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

function withoutUsage<T extends { usage: AiUsage }>(value: T): Omit<T, "usage"> {
  const { usage, ...rest } = value;
  void usage;
  return rest;
}

function analysisSummary(analysis: AnalysisStageResult): NonNullable<NonNullable<RunSummaryJson["ai"]>["analysis"]> {
  const { usage, findings, redFlags, ...rest } = analysis;
  void usage;
  return { ...rest, findings: findings.length, redFlags: redFlags.length };
}

function usageJson(usage: AiUsage, calls: { stage: string; provider: string; model: string; usage: AiUsage }[]) {
  return toJson({ ...usage, calls });
}

/**
 * Execute a research run that already has a ResearchRun row. Never throws:
 * failures and cancellations are recorded on the run.
 */
export async function executeResearchRun(input: { runId: string; caseId: string; mode: ResearchMode; signal: AbortSignal }): Promise<void> {
  const { runId, caseId, mode, signal } = input;
  const progress = progressFor(runId);
  let usage = emptyUsage();
  const calls: { stage: string; provider: string; model: string; usage: AiUsage }[] = [];
  const notes: string[] = [];

  try {
    await prisma.researchRun.update({ where: { id: runId }, data: { status: "running", startedAt: new Date() } });
    let snapshot = await loadSnapshot(caseId);
    if (!snapshot) throw new Error("The case no longer exists.");

    let research: ResearchStageResult | null = null;
    let verification: VerificationSummary | undefined;
    if (mode === "ai") {
      const settings = await getAiSettings();
      await progress.stage("Researching the web");
      const started = Date.now();
      try {
        research = await runAiResearch({ caseId, runId, snapshot, settings, signal, progress: progress.detail });
      } catch (err) {
        await trace(runId, "ai-research", started, "failed", {}, progress.logs(), err instanceof Error ? err.message : String(err), "low");
        throw err;
      }
      usage = addUsage(usage, research.usage);
      calls.push({ stage: "research", provider: research.provider, model: research.model, usage: research.usage });
      notes.push(...research.notes);
      await trace(runId, "ai-research", started, "ok", withoutUsage(research), progress.logs());

      if (settings.research.verifySources) {
        signal.throwIfAborted();
        await progress.stage("Checking quotes against the cited pages");
        const verifyStarted = Date.now();
        verification = await verifyAiSources({ caseId, runId, signal, progress: progress.detail });
        const weak = verification.notFound + verification.unreachable + verification.blocked;
        await trace(runId, "source-verifier", verifyStarted, weak > 0 ? "partial" : "ok", verification, progress.logs());
      }
      snapshot = (await loadSnapshot(caseId)) ?? snapshot;
    }

    signal.throwIfAborted();
    await progress.stage("Running rule-based checks");
    const results = await runPipeline(runId, caseId, snapshot, signal);
    const { scores: suggested, gating: workerGating } = aggregateSuggestedScores(results);

    let analysis: AnalysisStageResult | null = null;
    if (mode === "ai") {
      signal.throwIfAborted();
      await progress.stage("Analysing the evidence");
      const started = Date.now();
      try {
        analysis = await runAiAnalysis({ caseId, snapshot, workerResults: results, signal, progress: progress.detail });
      } catch (err) {
        await trace(runId, "ai-analysis", started, "failed", {}, progress.logs(), err instanceof Error ? err.message : String(err), "low");
        throw err;
      }
      usage = addUsage(usage, analysis.usage);
      calls.push({ stage: "analysis", provider: analysis.provider, model: analysis.model, usage: analysis.usage });
      notes.push(...analysis.notes);
      await trace(
        runId,
        "ai-analysis",
        started,
        "ok",
        { summary: analysis.summary, findings: analysis.findings.length, redFlags: analysis.redFlags.length, gating: analysis.gating, scores: analysis.scores },
        progress.logs(),
        undefined,
        analysis.confidence,
      );
    }

    signal.throwIfAborted();
    await progress.stage("Saving results");
    const aiGating = analysis ? onlyTrue(analysis.gating) : mode === "offline" ? await latestAiGating(caseId) : {};
    const gating: GatingFlags = { ...workerGating, ...aiGating };
    const saved = await saveFindings(caseId, mode, results, analysis);
    await updateScorecard(caseId, mode, suggested, gating, analysis);

    const moduleOutputs: Record<string, unknown> = {};
    for (const r of results) moduleOutputs[r.worker] = r.moduleOutput;
    const summary: RunSummaryJson = {
      mode,
      moduleOutputs,
      gating,
      suggested,
      aiGating,
      findingsCreated: saved.findings,
      redFlagsCreated: saved.redFlags,
    };
    if (mode === "ai") {
      summary.ai = {
        research: research ? withoutUsage(research) : undefined,
        verification,
        analysis: analysis ? analysisSummary(analysis) : undefined,
        notes: [...new Set(notes)],
      };
    }

    await prisma.researchRun.update({
      where: { id: runId },
      data: {
        status: "completed",
        stage: null,
        finishedAt: new Date(),
        summaryJson: toJson(summary),
        usageJson: usageJson(usage, calls),
        provider: research?.provider ?? analysis?.provider ?? undefined,
        model: research?.model ?? analysis?.model ?? undefined,
      },
    });
    await prisma.dDCase.update({ where: { id: caseId }, data: { updatedAt: new Date() } });
  } catch (err) {
    const cancelled = signal.aborted || isAbortError(err);
    const message = cancelled
      ? "Cancelled by the analyst."
      : err instanceof AiError
        ? err.message
        : `Research failed: ${err instanceof Error ? err.message : String(err)}`;
    if (!cancelled && !(err instanceof AiError)) console.error(`[research] run ${runId} failed:`, err);
    await prisma.researchRun
      .update({
        where: { id: runId },
        data: { status: cancelled ? "cancelled" : "failed", stage: null, finishedAt: new Date(), error: message, usageJson: usageJson(usage, calls) },
      })
      .catch(() => undefined);
  }
}

/** Run an offline research pass and wait for it (used when a report is built before any run). */
export async function runOfflineResearchNow(caseId: string): Promise<string> {
  const snapshot = await loadSnapshot(caseId);
  if (!snapshot) throw new Error("case not found");
  const run = await prisma.researchRun.create({
    data: { caseId, status: "queued", mode: "offline", reportType: snapshot.caseRow.reportType, stage: "Queued" },
  });
  await executeResearchRun({ runId: run.id, caseId, mode: "offline", signal: new AbortController().signal });
  return run.id;
}
