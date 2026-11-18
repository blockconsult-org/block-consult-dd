/**
 * Drafts the report's narrative sections with the active AI provider. The
 * model sees the rule-built report model, the numbered source list and the
 * evidence; it writes prose only and cannot change scores, gating or the
 * recommendation. The draft is stored with the source ids it cited and a
 * fingerprint of the results, so src/report/narrative.ts can tell when it is
 * out of date.
 */
import type { EvidenceClaim } from "@prisma/client";
import { prisma } from "@/lib/db";
import { toJson } from "@/domain/json";
import { QUOTE_VERIFICATION_LABELS, type QuoteVerification } from "@/domain/enums";
import { buildReportModel } from "@/report/build";
import type { ReportModel } from "@/report/model";
import { draftContent, narrativeBasis } from "@/report/narrative";
import { NARRATIVE_SYSTEM, narrativePrompt } from "./prompts";
import { runTask } from "./registry";
import { JSON_SCHEMAS, narrativeOutputSchema, type NarrativeOutput } from "./schemas";
import type { AiUsage, ProviderId } from "./types";

const MAX_EVIDENCE = 250;
const MAX_DATA_CHARS = 150_000;

export interface NarrativeResult {
  provider: ProviderId;
  model: string;
  usage: AiUsage;
  notes: string[];
  updatedAt: Date;
}

function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function verificationLabel(value: string | null): string | null {
  return value !== null && value in QUOTE_VERIFICATION_LABELS
    ? QUOTE_VERIFICATION_LABELS[value as QuoteVerification].toLowerCase()
    : null;
}

function evidenceLines(evidence: EvidenceClaim[], refs: Map<string, string>): string[] {
  return evidence.slice(0, MAX_EVIDENCE).map((claim) => {
    const ref = claim.sourceId ? refs.get(claim.sourceId) : undefined;
    const facts = [
      claim.origin === "ai" ? "found by AI research" : "entered by the analyst",
      claim.claimClass,
      `confidence ${claim.confidence}`,
      verificationLabel(claim.verification),
    ].filter(Boolean);
    return `- ${clip(claim.claimText, 500)} (${facts.join(", ")})${ref ? ` [${ref}]` : ""}`;
  });
}

function reportData(model: ReportModel, evidence: string[]): string {
  const data = {
    project: model.meta.projectName,
    client: model.meta.clientName,
    reportType: model.meta.reportTypeLabel,
    date: model.meta.date,
    recommendation: model.scorecard.recommendationLabel,
    overallScore: model.scorecard.overallScore,
    gatingBlockers: model.scorecard.gatingApplied,
    scores: model.scorecard.contributions.map((c) => ({
      category: c.label,
      score: c.score,
      weight: c.weight,
      informational: c.informational,
    })),
    identity: model.identity,
    opportunity: model.opportunity,
    sources: model.sources.map((s) => ({
      id: s.ref,
      name: s.name,
      type: s.type,
      reliability: s.reliability,
      url: s.url || undefined,
      title: s.use || undefined,
    })),
    findings: model.findings.map((f) => ({ ...f, analysis: clip(f.analysis, 800) })),
    redFlags: model.redFlags,
    entities: model.entityLegal.entities,
    legalStructure: model.entityLegal.legalStructureNote,
    team: model.team.people,
    founderRiskScore: model.team.founderScore,
    tokenomics: {
      hasData: model.tokenomics.hasData,
      supply: model.tokenomics.supply,
      allocations: model.tokenomics.allocations,
      unlocks: model.tokenomics.unlocks,
      utility: model.tokenomics.staking,
      ruleBasedRisks: model.tokenomics.risks,
    },
    market: { venues: model.market.venues, slippage: model.market.slippage, ruleBasedSummary: model.market.summary },
    contracts: model.technical.contracts,
    ruleBasedTechnicalNote: model.technical.analysis,
    stablecoinRwa: model.stablecoinRwa.applicable ? model.stablecoinRwa : { applicable: false },
    counselQuestions: model.legal.counselQuestions,
  };
  return `${clip(JSON.stringify(data, null, 1), MAX_DATA_CHARS)}

Evidence (a trailing [S#] is the source the claim came from):
${evidence.length ? evidence.join("\n") : "(none recorded)"}`;
}

/** Draft and save the narrative for a case. Throws AiError when the provider fails. */
export async function generateNarrative(caseId: string, signal?: AbortSignal): Promise<NarrativeResult> {
  const { model, snapshot, runId } = await buildReportModel(caseId, { applyNarrative: false });
  const refs = new Map(model.sources.map((s) => [s.id, s.ref]));
  const result = await runTask<NarrativeOutput>({
    purpose: "narrative",
    caseId,
    system: NARRATIVE_SYSTEM,
    prompt: narrativePrompt(reportData(model, evidenceLines(snapshot.evidence, refs))),
    schemaName: "submit_narrative",
    schemaDescription: "Submit the narrative sections of the due-diligence report.",
    jsonSchema: JSON_SCHEMAS.narrative,
    parse: (value) => narrativeOutputSchema.parse(value),
    web: null,
    signal,
  });

  const content = toJson(
    draftContent(
      result.data,
      model.sources.map((s) => s.id),
      narrativeBasis(runId, model),
    ),
  );
  const fields = { contentJson: content, provider: result.provider, model: result.model, usageJson: toJson(result.usage) };
  const row = await prisma.caseNarrative.upsert({
    where: { caseId },
    create: { caseId, ...fields },
    update: fields,
  });
  return { provider: result.provider, model: result.model, usage: result.usage, notes: result.notes, updatedAt: row.updatedAt };
}
