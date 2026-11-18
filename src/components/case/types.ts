/**
 * Plain serialised case shape passed from the server page to the workspace,
 * plus defensive readers for the JSON the workspace receives: run usage and
 * summaries stored as JSON text, and the research status API. The readers
 * run on the server page and in the client panels, so this module stays free
 * of server-only imports.
 */
import { SCORE_CATEGORIES, type GatingFlags, type ScoreCategoryKey } from "@/domain/scoring";
import type { ScoreSources } from "@/domain/score-sources";

/** The AI provider chosen in Settings. */
export interface AiStatus {
  configured: boolean;
  provider: string | null;
  label: string | null;
  /** Model chosen in Settings; "" means the CLI's own default. */
  model: string;
}

export interface CaseSource {
  id: string;
  name: string;
  title: string | null;
  sourceType: string;
  url: string | null;
  reliabilityRating: string;
  notes: string | null;
  content: string | null;
  /** manual | ai */
  origin: string;
  /** "analyst", or "ai:<provider id>" for AI research. */
  retrievedBy: string | null;
  httpStatus: number | null;
  finalUrl: string | null;
}

export interface EvidenceItem {
  id: string;
  claimText: string;
  sourceType: string;
  claimClass: string;
  reliabilityRating: string;
  confidence: string;
  corroborated: boolean;
  /** manual | ai */
  origin: string;
  topic: string | null;
  /** Verbatim excerpt the claim relies on (AI research). */
  quote: string | null;
  /** QuoteVerification value; null when the quote was not checked. */
  verification: string | null;
  sourceUrl: string | null;
  sourceTitle: string | null;
  sourceId: string | null;
  notes: string | null;
}

export interface CaseScorecard extends Record<ScoreCategoryKey, number | null> {
  overallScore: number | null;
  recommendation: string | null;
  confidenceLevel: string;
  notes: string | null;
  gatingApplied: string[];
  manualGating: GatingFlags;
  scoreSources: ScoreSources;
  /** Category key to rationale text. */
  rationale: Record<string, string>;
}

export interface UsageTotals {
  inputTokens: number;
  outputTokens: number;
  webSearches: number;
  /** Estimated list-price cost; null when unknown or covered by a subscription. */
  costUsd: number | null;
}

export interface RunUsage extends UsageTotals {
  /** Provider and model behind each AI stage of the run. */
  calls: { stage: string; provider: string; model: string }[];
}

export interface RunTrace {
  worker: string;
  status: string;
  confidence: string;
  durationMs: number;
  error: string | null;
}

export interface ResearchRunView {
  id: string;
  /** queued | running | completed | failed | cancelled */
  status: string;
  /** offline | ai */
  mode: string;
  provider: string | null;
  model: string | null;
  /** Progress label while the run works. */
  stage: string | null;
  error: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  /** Null when the run recorded no AI usage. */
  usage: RunUsage | null;
  traces: RunTrace[];
}

/** The research job running for the case in this server process (startedAt in epoch ms). */
export interface ActiveRun {
  runId: string;
  startedAt: number;
}

export interface ResearchStatus {
  active: ActiveRun | null;
  /** Newest first. */
  runs: ResearchRunView[];
}

export interface AiScoreSuggestion {
  score: number;
  rationale: string | null;
}

export type AiScoreSuggestions = Partial<Record<ScoreCategoryKey, AiScoreSuggestion>>;

export interface VerificationCounts {
  checkedSources: number;
  verified: number;
  partial: number;
  notFound: number;
  unreachable: number;
  blocked: number;
  notChecked: number;
}

export interface AiResearchPart {
  overview: string | null;
  contradictions: string[];
  openQuestions: string[];
  sourcesCreated: number | null;
  claimsCreated: number | null;
  unsupportedClaims: number | null;
  unseenUrls: number | null;
}

export interface AiAnalysisPart {
  summary: string | null;
  confidence: string | null;
  findings: number | null;
  redFlags: number | null;
  gatingReasons: { flag: string; reason: string }[];
  scores: AiScoreSuggestions;
}

/** The `ai` part of a research run's summaryJson (see RunSummaryJson in src/harness/orchestrator.ts). */
export interface AiRunSummary {
  research: AiResearchPart | null;
  verification: VerificationCounts | null;
  analysis: AiAnalysisPart | null;
  /** Facts worth surfacing, e.g. that a fallback model answered. */
  notes: string[];
}

export interface LatestAiSummary {
  runId: string;
  finishedAt: string | null;
  provider: string | null;
  model: string | null;
  summary: AiRunSummary;
}

export interface CaseData {
  id: string;
  projectName: string;
  clientName: string | null;
  analyst: string | null;
  status: string;
  reportType: string;
  brand: string;
  updatedAt: string;
  intake: Record<string, unknown> | null;
  sources: CaseSource[];
  evidence: EvidenceItem[];
  entities: { id: string; name: string; entityType: string; jurisdiction: string | null }[];
  people: { id: string; fullName: string; confidence: string }[];
  tokens: { id: string; name: string; symbol: string | null; allocations: number; unlocks: number }[];
  contracts: { id: string; name: string | null; chain: string; address: string; verified: boolean }[];
  markets: { id: string; exchange: string; pair: string | null; volume24h: number | null }[];
  stablecoins: { id: string; name: string }[];
  rwaAssets: { id: string; assetDescription: string }[];
  findings: {
    id: string;
    category: string;
    title: string;
    severity: string;
    confidence: string;
    analysis: string | null;
    impact: string | null;
    mitigation: string | null;
    source: string;
  }[];
  redFlags: { id: string; title: string; severity: string; evidence: string | null; mitigation: string | null }[];
  scorecard: CaseScorecard | null;
  /** Blockers from the latest completed research run, separate from saved choices. */
  researchGating: GatingFlags;
  reports: { id: string; title: string; version: number; recommendation: string | null; overallScore: number | null; qaJson: string; generatedAt: string; files: { id: string; kind: string; filename: string; sizeBytes: number }[] }[];
  /** Latest runs, newest first. */
  researchRuns: ResearchRunView[];
  activeRun: ActiveRun | null;
  ai: AiStatus;
  /** The latest completed AI run's summary; null when no AI run has completed. */
  latestAiSummary: LatestAiSummary | null;
}

// ---------------------------------------------------------------------------
// Readers
// ---------------------------------------------------------------------------

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function count(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function readTextList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string" && v.trim() !== "") : [];
}

function isoDate(value: unknown): string | null {
  return typeof value === "string" && !Number.isNaN(Date.parse(value)) ? value : null;
}

/** Token and search totals; null when the value records none. */
export function readUsageTotals(value: unknown): UsageTotals | null {
  if (!isRecord(value)) return null;
  const inputTokens = count(value.inputTokens);
  const outputTokens = count(value.outputTokens);
  const webSearches = count(value.webSearches);
  if (inputTokens === null && outputTokens === null && webSearches === null) return null;
  return { inputTokens: inputTokens ?? 0, outputTokens: outputTokens ?? 0, webSearches: webSearches ?? 0, costUsd: count(value.costUsd) };
}

/** A run's usageJson, parsed. */
export function readRunUsage(value: unknown): RunUsage | null {
  const totals = readUsageTotals(value);
  if (!totals || !isRecord(value)) return null;
  const calls = Array.isArray(value.calls)
    ? value.calls.flatMap((call) => {
        if (!isRecord(call)) return [];
        const stage = text(call.stage);
        const provider = text(call.provider);
        const model = text(call.model);
        return stage && provider && model ? [{ stage, provider, model }] : [];
      })
    : [];
  return { ...totals, calls };
}

function readTrace(value: unknown): RunTrace | null {
  if (!isRecord(value)) return null;
  const worker = text(value.worker);
  if (!worker) return null;
  return {
    worker,
    status: text(value.status) ?? "ok",
    confidence: text(value.confidence) ?? "medium",
    durationMs: count(value.durationMs) ?? 0,
    error: text(value.error),
  };
}

function readResearchRun(value: unknown): ResearchRunView | null {
  if (!isRecord(value)) return null;
  const id = text(value.id);
  const status = text(value.status);
  const createdAt = isoDate(value.createdAt);
  if (!id || !status || !createdAt) return null;
  return {
    id,
    status,
    mode: text(value.mode) ?? "offline",
    provider: text(value.provider),
    model: text(value.model),
    stage: text(value.stage),
    error: text(value.error),
    createdAt,
    startedAt: isoDate(value.startedAt),
    finishedAt: isoDate(value.finishedAt),
    usage: readRunUsage(value.usage),
    traces: Array.isArray(value.traces) ? value.traces.flatMap((t) => readTrace(t) ?? []) : [],
  };
}

function readActiveRun(value: unknown): ActiveRun | null {
  if (!isRecord(value)) return null;
  const runId = text(value.runId);
  const startedAt = count(value.startedAt);
  return runId && startedAt !== null ? { runId, startedAt } : null;
}

/** GET /api/cases/[id]/research. Null when the body is not a status payload. */
export function readResearchStatus(value: unknown): ResearchStatus | null {
  if (!isRecord(value) || !Array.isArray(value.runs)) return null;
  return {
    active: readActiveRun(value.active),
    runs: value.runs.flatMap((run) => readResearchRun(run) ?? []),
  };
}

/** Run id from the 202 answer of POST /api/cases/[id]/research. */
export function readStartedRunId(value: unknown): string | null {
  return isRecord(value) ? text(value.runId) : null;
}

/** Scorecard.rationale, parsed: string values only. */
export function readRationale(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {};
  const out: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    const rationale = text(entry);
    if (rationale) out[key] = rationale;
  }
  return out;
}

function readResearchPart(value: unknown): AiResearchPart | null {
  if (!isRecord(value)) return null;
  return {
    overview: text(value.overview),
    contradictions: readTextList(value.contradictions),
    openQuestions: readTextList(value.openQuestions),
    sourcesCreated: count(value.sourcesCreated),
    claimsCreated: count(value.claimsCreated),
    unsupportedClaims: count(value.unsupportedClaims),
    unseenUrls: count(value.unseenUrls),
  };
}

function readVerificationPart(value: unknown): VerificationCounts | null {
  if (!isRecord(value)) return null;
  return {
    checkedSources: count(value.checkedSources) ?? 0,
    verified: count(value.verified) ?? 0,
    partial: count(value.partial) ?? 0,
    notFound: count(value.notFound) ?? 0,
    unreachable: count(value.unreachable) ?? 0,
    blocked: count(value.blocked) ?? 0,
    notChecked: count(value.notChecked) ?? 0,
  };
}

function readAnalysisPart(value: unknown): AiAnalysisPart | null {
  if (!isRecord(value)) return null;
  const scores: AiScoreSuggestions = {};
  const rawScores = value.scores;
  if (isRecord(rawScores)) {
    for (const { key } of SCORE_CATEGORIES) {
      const entry = rawScores[key];
      if (!isRecord(entry)) continue;
      const score = count(entry.score);
      if (score !== null && score >= 1 && score <= 10) scores[key] = { score, rationale: text(entry.rationale) };
    }
  }
  const gatingReasons = Array.isArray(value.gatingReasons)
    ? value.gatingReasons.flatMap((item) => {
        if (!isRecord(item)) return [];
        const flag = text(item.flag);
        const reason = text(item.reason);
        return flag && reason ? [{ flag, reason }] : [];
      })
    : [];
  return {
    summary: text(value.summary),
    confidence: text(value.confidence),
    findings: count(value.findings),
    redFlags: count(value.redFlags),
    gatingReasons,
    scores,
  };
}

/** The `ai` part of a parsed summaryJson; null when the run has none. Every field is optional in the stored JSON. */
export function readAiRunSummary(summaryJson: unknown): AiRunSummary | null {
  if (!isRecord(summaryJson)) return null;
  const ai = summaryJson.ai;
  if (!isRecord(ai)) return null;
  return {
    research: readResearchPart(ai.research),
    verification: readVerificationPart(ai.verification),
    analysis: readAnalysisPart(ai.analysis),
    notes: readTextList(ai.notes),
  };
}
