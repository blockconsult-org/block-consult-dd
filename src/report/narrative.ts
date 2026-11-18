/**
 * AI-drafted report prose, applied over the rule-built text.
 *
 * Drafts cite sources as [S1]..[Sn]. The source ids behind those refs are
 * stored with the draft, so a citation still points at the right row after
 * sources are added or removed. A draft is used only while the results it was
 * written from are unchanged: the same research run, recommendation, score,
 * gating blockers and finding and red-flag counts. Otherwise the report falls
 * back to the rule-built text and the case shows the draft as out of date.
 */
import { z } from "zod/v4";
import { prisma } from "@/lib/db";
import { parseJson } from "@/domain/json";
import { narrativeOutputSchema, type NarrativeOutput } from "@/ai/schemas";
import { PROVIDER_IDS, PROVIDER_LABELS, type ProviderId } from "@/ai/types";
import type { ReportModel } from "./model";

const storedDraftSchema = z.object({
  version: z.literal(1),
  output: narrativeOutputSchema,
  /** Source ids in citation order when the draft was written: sourceIds[0] was S1. */
  sourceIds: z.array(z.string()),
  basis: z.string(),
});
export type NarrativeDraft = z.infer<typeof storedDraftSchema>;

export interface StoredNarrative extends NarrativeDraft {
  provider: string;
  model: string;
  updatedAt: Date;
}

export function providerLabel(provider: string): string {
  return (PROVIDER_IDS as readonly string[]).includes(provider) ? PROVIDER_LABELS[provider as ProviderId] : provider;
}

/** Fingerprint of the results a draft explains. A draft whose basis differs is out of date. */
export function narrativeBasis(runId: string | null, model: ReportModel): string {
  const sc = model.scorecard;
  return [
    `run:${runId ?? "none"}`,
    `rec:${sc.recommendation}`,
    `score:${sc.overallScore ?? "none"}`,
    `gates:${[...sc.gatingApplied].sort().join("|")}`,
    `findings:${model.findings.length}`,
    `flags:${model.redFlags.length}`,
  ].join(";");
}

export function draftContent(output: NarrativeOutput, sourceIds: string[], basis: string): NarrativeDraft {
  return { version: 1, output, sourceIds, basis };
}

export async function loadNarrative(caseId: string): Promise<StoredNarrative | null> {
  const row = await prisma.caseNarrative.findUnique({ where: { caseId } });
  if (!row) return null;
  const parsed = storedDraftSchema.safeParse(parseJson<unknown>(row.contentJson, null));
  if (!parsed.success) return null;
  return { ...parsed.data, provider: row.provider, model: row.model, updatedAt: row.updatedAt };
}

const CITATION = /\s?\[((?:[SE]\d+)(?:\s*[,;]\s*[SE]\d+)*)\]/g;

/**
 * Rewrite a draft's [S#] refs to the report's current numbering. Refs to
 * sources that no longer exist, and any [E#] evidence refs, are dropped.
 */
export function remapCitations(text: string, draftSourceIds: string[], currentRefs: Map<string, string>): string {
  return text.replace(CITATION, (match: string, inner: string) => {
    const refs = inner
      .split(/\s*[,;]\s*/)
      .map((ref) => {
        if (!ref.startsWith("S")) return null;
        const id = draftSourceIds[Number(ref.slice(1)) - 1];
        return id ? (currentRefs.get(id) ?? null) : null;
      })
      .filter((ref): ref is string => ref !== null);
    const unique = [...new Set(refs)];
    if (unique.length === 0) return "";
    return `${/^\s/.test(match) ? " " : ""}[${unique.join(", ")}]`;
  });
}

/** Put the draft's prose into the model when it still matches the results. Empty draft fields keep the rule-built text. */
export function applyNarrative(model: ReportModel, stored: StoredNarrative, runId: string | null): void {
  if (stored.basis !== narrativeBasis(runId, model)) {
    model.meta.narrative = "ai_stale";
    return;
  }
  const refs = new Map(model.sources.map((s) => [s.id, s.ref]));
  const fix = (text: string) => remapCitations(text.trim(), stored.sourceIds, refs).trim();
  const pick = (current: string, next: string) => fix(next) || current;
  const pickList = (current: string[], next: string[], max: number) => {
    const values = next.map(fix).filter(Boolean);
    return values.length ? values.slice(0, max) : current;
  };
  const o = stored.output;

  model.executive.conclusion = pick(model.executive.conclusion, o.executiveConclusion);
  model.executive.reasonsToProceed = pickList(model.executive.reasonsToProceed, o.reasonsToProceed, 5);
  model.executive.risks = pickList(model.executive.risks, o.keyRisks, 6);
  model.executive.nextSteps = pickList(model.executive.nextSteps, o.nextSteps, 6);
  model.team.summary = pick(model.team.summary, o.teamSummary);
  model.tokenomics.verdict = pick(model.tokenomics.verdict, o.tokenomicsVerdict);
  model.tokenomics.valueCapture = pick(model.tokenomics.valueCapture, o.valueCapture);
  model.tokenomics.risks = pick(model.tokenomics.risks, o.tokenomicsRisks);
  model.market.summary = pick(model.market.summary, o.marketSummary);
  model.market.verdict = pick(model.market.verdict, o.marketVerdict);
  model.technical.analysis = pick(model.technical.analysis, o.technicalAnalysis);
  model.businessModel = pick(model.businessModel, o.businessModel);
  model.competitive = pick(model.competitive, o.competitive);
  const legal = fix(o.legalAnalysis);
  if (legal) model.legal.analysis = /not legal advice/i.test(legal) ? legal : `Issue spotting only, not legal advice. ${legal}`;
  for (const key of ["bull", "bear", "base", "downside", "fraud"] as const) {
    model.investmentCase[key] = pick(model.investmentCase[key], o.investmentCase[key]);
  }
  model.meta.narrative = "ai";
}

export interface DisclosureInput {
  research: { provider: string; model: string | null; quotesChecked: boolean } | null;
  narrative: { provider: string; model: string } | null;
}

/** Plain statement of where AI was used, printed under the report's notice. */
export function aiDisclosure({ research, narrative }: DisclosureInput): string | null {
  const parts: string[] = [];
  if (research) {
    const who = `${providerLabel(research.provider)}${research.model ? ` (${research.model})` : ""}`;
    parts.push(
      `Web research and evidence analysis used ${who}. The model proposed findings, red flags and category scores; scores entered by the analyst take precedence, and the gating rules apply to every score.`,
    );
    parts.push(
      research.quotesChecked
        ? "Claims the model found are labelled in the case file, and their quotes were checked against the cited pages where those pages could be retrieved."
        : "Claims the model found are labelled in the case file.",
    );
  }
  if (narrative) {
    parts.push(
      `Narrative sections were drafted by ${providerLabel(narrative.provider)} (${narrative.model}) from the case record. The recommendation comes from the scoring model and its gating rules.`,
    );
  }
  return parts.length ? parts.join(" ") : null;
}
