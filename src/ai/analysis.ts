/**
 * AI analyst stage: reads the case file, every evidence claim (manual and AI)
 * and the rule-based worker results, and proposes findings, red flags, gating
 * flags and category scores. Evidence is numbered E1..En for the model; the
 * ids it cites are mapped back to EvidenceClaim ids before anything is saved.
 */
import type { EvidenceClaim } from "@prisma/client";
import { QUOTE_VERIFICATION_LABELS, type Confidence, type QuoteVerification } from "@/domain/enums";
import type { GatingFlags, ScoreCategoryKey } from "@/domain/scoring";
import type { CaseSnapshot, FindingDraft, RedFlagDraft, WorkerResult } from "@/harness/types";
import { analysisPrompt, analysisSystem, type EvidenceLine } from "./prompts";
import { runTask } from "./registry";
import { GATING_KEYS, JSON_SCHEMAS, SCORE_KEYS, analysisOutputSchema, type AnalysisOutput, type GatingKey } from "./schemas";
import type { AiUsage, ProviderId } from "./types";

const MAX_EVIDENCE = 300;
const MAX_WORKER_TEXT = 30_000;

export interface AiScore {
  score: number;
  rationale: string;
}

export interface AnalysisStageResult {
  provider: ProviderId;
  model: string;
  summary: string;
  confidence: Confidence;
  findings: FindingDraft[];
  redFlags: RedFlagDraft[];
  gating: Partial<GatingFlags>;
  gatingReasons: { flag: GatingKey; reason: string }[];
  scores: Partial<Record<ScoreCategoryKey, AiScore>>;
  usage: AiUsage;
  notes: string[];
}

function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function isVerification(value: string | null): value is QuoteVerification {
  return value !== null && value in QUOTE_VERIFICATION_LABELS;
}

function evidenceText(claim: EvidenceClaim): string {
  const facts = [
    claim.origin === "ai" ? "AI research" : "analyst",
    claim.sourceType,
    claim.claimClass,
    `confidence ${claim.confidence}`,
    isVerification(claim.verification) ? QUOTE_VERIFICATION_LABELS[claim.verification].toLowerCase() : null,
  ].filter(Boolean);
  const source = claim.sourceTitle || claim.sourceUrl ? ` Source: ${claim.sourceTitle ?? ""}${claim.sourceUrl ? ` <${claim.sourceUrl}>` : ""}.` : "";
  const quote = claim.quote ? ` Quote: "${clip(claim.quote, 300)}"` : "";
  return `${clip(claim.claimText, 600)} (${facts.join(", ")}).${source}${quote}`;
}

/** Number the evidence for the prompt and keep the map back to database ids. */
export function numberEvidence(claims: EvidenceClaim[]): { lines: EvidenceLine[]; idFor: Map<string, string> } {
  const lines: EvidenceLine[] = [];
  const idFor = new Map<string, string>();
  claims.slice(0, MAX_EVIDENCE).forEach((claim, index) => {
    const ref = `E${index + 1}`;
    lines.push({ ref, text: evidenceText(claim) });
    idFor.set(ref, claim.id);
  });
  return { lines, idFor };
}

export function workerResultsText(results: WorkerResult[]): string {
  const blocks: string[] = [];
  for (const r of results) {
    if (r.status === "skipped") continue;
    const lines = [`## ${r.worker} (${r.status}, confidence ${r.confidence})`];
    if (r.error) lines.push(`Error: ${clip(r.error, 300)}`);
    for (const f of r.findings) lines.push(`- Finding [${f.severity}] ${f.title}${f.analysis ? `: ${clip(f.analysis, 300)}` : ""}`);
    for (const flag of r.redFlags) lines.push(`- Red flag [${flag.severity}] ${flag.title}${flag.evidence ? `: ${clip(flag.evidence, 300)}` : ""}`);
    const gates = Object.entries(r.gating)
      .filter(([, on]) => on)
      .map(([key]) => key);
    if (gates.length) lines.push(`- Gating flags raised: ${gates.join(", ")}`);
    for (const q of r.openQuestions.slice(0, 5)) lines.push(`- Open question: ${clip(q, 200)}`);
    blocks.push(lines.join("\n"));
  }
  return clip(blocks.join("\n\n"), MAX_WORKER_TEXT);
}

function mapIds(refs: string[], idFor: Map<string, string>): string[] {
  const ids = refs.map((ref) => idFor.get(ref.trim().replace(/^\[|\]$/g, "").toUpperCase())).filter((id): id is string => Boolean(id));
  return [...new Set(ids)];
}

export function toStageResult(output: AnalysisOutput, idFor: Map<string, string>): Omit<AnalysisStageResult, "provider" | "model" | "usage" | "notes"> {
  const findings: FindingDraft[] = output.findings
    .filter((f) => f.title.trim())
    .map((f) => ({
      category: f.category,
      title: clip(f.title.trim(), 300),
      claim: f.claim || undefined,
      analysis: f.analysis || undefined,
      severity: f.severity,
      confidence: f.confidence,
      impact: f.impact || undefined,
      mitigation: f.mitigation || undefined,
      openQuestions: f.openQuestions.filter(Boolean),
      evidenceIds: mapIds(f.evidenceIds, idFor),
    }));

  const redFlags: RedFlagDraft[] = output.redFlags
    .filter((r) => r.title.trim())
    .map((r) => ({
      code: r.code === "OTHER" ? undefined : r.code,
      title: clip(r.title.trim(), 300),
      severity: r.severity,
      evidence: r.evidence || undefined,
      impact: r.impact || undefined,
      mitigation: r.mitigation || undefined,
      triggered: true,
    }));

  const gating: Partial<GatingFlags> = {};
  for (const key of GATING_KEYS) if (output.gating[key]) gating[key] = true;
  const gatingReasons = output.gatingReasons.filter((g) => gating[g.flag]);

  const scores: Partial<Record<ScoreCategoryKey, AiScore>> = {};
  for (const key of SCORE_KEYS) {
    const entry = output.scores[key];
    if (entry.score >= 1 && entry.score <= 10) scores[key] = { score: Math.round(entry.score * 10) / 10, rationale: entry.rationale };
  }

  return { summary: output.summary, confidence: output.confidence, findings, redFlags, gating, gatingReasons, scores };
}

export async function runAiAnalysis(options: {
  caseId: string;
  snapshot: CaseSnapshot;
  workerResults: WorkerResult[];
  signal: AbortSignal;
  progress: (message: string) => void;
}): Promise<AnalysisStageResult> {
  const { caseId, snapshot, workerResults, signal, progress } = options;
  const { lines, idFor } = numberEvidence(snapshot.evidence);
  const result = await runTask<AnalysisOutput>({
    purpose: "analysis",
    caseId,
    system: analysisSystem(),
    prompt: analysisPrompt(snapshot, lines, workerResultsText(workerResults)),
    schemaName: "submit_analysis",
    schemaDescription: "Submit the assessment: findings, red flags, gating flags with reasons, and category scores.",
    jsonSchema: JSON_SCHEMAS.analysis,
    parse: (value) => analysisOutputSchema.parse(value),
    web: null,
    signal,
    onProgress: progress,
  });
  return { ...toStageResult(result.data, idFor), provider: result.provider, model: result.model, usage: result.usage, notes: result.notes };
}
