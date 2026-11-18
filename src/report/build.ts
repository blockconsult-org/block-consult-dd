/**
 * Report assembler. Combines the harness module outputs, scorecard, findings and
 * red flags for a case into a single ReportModel. Narrative prose is generated
 * deterministically in a skeptical, evidence-first tone (no hype, missing data
 * surfaced explicitly).
 */
import { prisma } from "@/lib/db";
import { parseJson, parseStringArray } from "@/domain/json";
import { mergeGating, readResearchGating, readSavedGating } from "@/domain/gating";
import {
  IDENTITY_VERDICT_LABELS,
  RECOMMENDATION_LABELS,
  REPORT_TYPE_LABELS,
  type ReportType,
} from "@/domain/enums";
import {
  computeScorecard,
  SCORE_CATEGORIES,
  type GatingFlags,
  type ScoreCategoryKey,
  type ScoreInput,
} from "@/domain/scoring";
import { DEFAULT_BRANDING, type Branding } from "@/lib/branding";
import { fmtDate, fmtNum, fmtPct, fmtUsd } from "@/lib/utils";
import { QUESTION_BANK } from "@/content/question-bank";
import { DOCUMENT_REQUESTS } from "@/content/document-requests";
import { loadSnapshot } from "@/harness/snapshot";
import { runOfflineResearchNow } from "@/harness/orchestrator";
import { activeJob } from "@/ai/jobs";
import { isRwaCase, isStablecoinCase } from "@/harness/applicability";
import type { CaseSnapshot } from "@/harness/types";
import { readScoreSources } from "@/domain/score-sources";
import { evaluateQa } from "./qa";
import type { ReportModel, ScenarioRow } from "./model";
import { aiDisclosure, applyNarrative, loadNarrative } from "./narrative";

const DISCLAIMER =
  "This report is a due-diligence and risk-assessment document. It is not legal, tax, accounting, or investment advice. Legal, tax, regulatory, custody, and technical specialists should review the final transaction documents before any capital or assets are committed.";

type MO = Record<string, unknown>;
function getMO(outputs: MO, key: string): MO {
  const v = outputs[key];
  return v && typeof v === "object" ? (v as MO) : {};
}
function asArr<T = MO>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}
function asStr(v: unknown, fallback = "—"): string {
  return typeof v === "string" && v ? v : fallback;
}
function asNum(v: unknown): number | null {
  return typeof v === "number" && !Number.isNaN(v) ? v : null;
}

export interface BuiltReport {
  model: ReportModel;
  branding: Branding;
  snapshot: CaseSnapshot;
  /** Completed research run the report was built from. */
  runId: string | null;
}

export interface BuildOptions {
  /** Run the rule-based checks first when the case has no completed run. Default true. */
  ensureRun?: boolean;
  /** Use the saved AI narrative when it matches the current results. Default true. */
  applyNarrative?: boolean;
}

interface RunSummary {
  moduleOutputs?: MO;
  gating?: GatingFlags;
  ai?: { verification?: { checkedSources?: number } };
}

export async function buildReportModel(caseId: string, options: BuildOptions = {}): Promise<BuiltReport> {
  const { ensureRun = true, applyNarrative: useNarrative = true } = options;
  const snapshot = await loadSnapshot(caseId);
  if (!snapshot) throw new Error("case not found");

  let run = await prisma.researchRun.findFirst({
    where: { caseId, status: "completed" },
    orderBy: { createdAt: "desc" },
  });
  if (!run && ensureRun && !activeJob(caseId)) {
    await runOfflineResearchNow(caseId);
    run = await prisma.researchRun.findFirst({ where: { caseId, status: "completed" }, orderBy: { createdAt: "desc" } });
  }

  const summary = parseJson<RunSummary>(run?.summaryJson, {});
  const outputs: MO = summary.moduleOutputs ?? {};

  const [scorecardRow, findings, redFlags] = await Promise.all([
    prisma.scorecard.findUnique({ where: { caseId } }),
    prisma.riskFinding.findMany({ where: { caseId }, orderBy: { severity: "asc" } }),
    prisma.redFlag.findMany({ where: { caseId } }),
  ]);
  const gating = mergeGating(readResearchGating(run?.summaryJson), readSavedGating(scorecardRow?.manualGating));

  const scores: ScoreInput = {};
  for (const cat of SCORE_CATEGORIES) {
    scores[cat.key] = scorecardRow ? ((scorecardRow[cat.key] as number | null) ?? null) : null;
  }
  const scorecard = computeScorecard(scores, gating);

  const branding: Branding = {
    ...DEFAULT_BRANDING,
    brandName: snapshot.caseRow.brand,
    preparedBy: snapshot.caseRow.brand,
  };

  const reportType = snapshot.caseRow.reportType as ReportType;
  const model = assemble(snapshot, outputs, scorecard, findings, redFlags, reportType, branding);
  model.scorecard.sources = readScoreSources(scorecardRow?.scoreSources);

  const narrative = useNarrative ? await loadNarrative(caseId) : null;
  if (narrative) applyNarrative(model, narrative, run?.id ?? null);
  model.meta.aiDisclosure = aiDisclosure({
    research:
      run?.mode === "ai" && run.provider
        ? { provider: run.provider, model: run.model, quotesChecked: (summary.ai?.verification?.checkedSources ?? 0) > 0 }
        : null,
    narrative: narrative && model.meta.narrative === "ai" ? { provider: narrative.provider, model: narrative.model } : null,
  });

  model.qa = evaluateQa(model, {
    sourcesTotal: snapshot.sources.length,
    primaryCount: snapshot.sources.filter((s) => s.sourceType.startsWith("primary")).length,
    weakCount: snapshot.sources.filter((s) => ["community", "pitch_claim", "unknown"].includes(s.sourceType)).length,
    scorecardExists: Boolean(scorecardRow),
  });
  return { model, branding, snapshot, runId: run?.id ?? null };
}

function assemble(
  s: CaseSnapshot,
  outputs: MO,
  scorecard: ReturnType<typeof computeScorecard>,
  findings: { category: string; title: string; severity: string; confidence: string; analysis: string | null; openQuestions: string }[],
  redFlags: { title: string; severity: string; evidence: string | null; impact: string | null; mitigation: string | null }[],
  reportType: ReportType,
  branding: Branding,
): ReportModel {
  const intake = s.intake;
  const identity = getMO(outputs, "identity");
  const tok = getMO(outputs, "tokenomics");
  const mkt = getMO(outputs, "exchange-data");
  const oc = getMO(outputs, "onchain");
  const et = getMO(outputs, "entity-team");
  const sr = getMO(outputs, "stablecoin-rwa");
  const legal = getMO(outputs, "legal-issue-spotting");
  const fraud = getMO(outputs, "fraud-redflag");

  const stablecoin = isStablecoinCase(s);
  const rwa = isRwaCase(s);

  // ---- Executive ----
  const criticalRisks = [
    ...redFlags.filter((f) => f.severity === "critical" || f.severity === "high").map((f) => f.title),
    ...findings.filter((f) => f.severity === "critical" || f.severity === "high").map((f) => f.title),
  ];
  const risks = uniq(criticalRisks).slice(0, 5);
  const reasonsToProceed = scorecard.contributions
    .filter((c) => !c.informational && (c.score ?? 0) >= 7)
    .map((c) => `${c.label} is a relative strength (${c.score}/10).`);
  if (reasonsToProceed.length === 0) {
    reasonsToProceed.push("No strong positives were identified from the available evidence; this report is risk-led.");
  }
  const nextSteps = uniq([
    ...scorecard.gatingApplied.map((g) => `Resolve blocker: ${g}.`),
    "Obtain the documents in the document-request list and re-run diligence.",
    "Answer the open due-diligence questions with primary sources.",
  ]).slice(0, 3);

  const recLabel = RECOMMENDATION_LABELS[scorecard.recommendation];
  const conclusion = buildConclusion(intake.projectName, scorecard, recLabel, asStr(identity.verdictLabel, "Unresolved"), redFlags.length, criticalRisks.length);

  // ---- Tokenomics ----
  const tokHasData = Boolean(tok.hasData);
  const supply = getMO(tok, "supply");
  const conc = getMO(tok, "concentration");

  // ---- Market ----
  const venues = asArr(mkt.venues);
  const slippage = asArr(mkt.slippage);

  const model: ReportModel = {
    meta: {
      brandName: branding.brandName,
      preparedBy: branding.preparedBy,
      reportKind: branding.reportType,
      reportType,
      reportTypeLabel: REPORT_TYPE_LABELS[reportType],
      projectName: intake.projectName,
      clientName: s.caseRow.clientName ?? "—",
      analyst: s.caseRow.analyst ?? "—",
      date: fmtDate(new Date()),
      status: s.caseRow.status,
      confidentiality: s.caseRow.confidentiality,
      recommendation: scorecard.recommendation,
      recommendationLabel: recLabel,
      overallScore: scorecard.overallScore,
      confidenceLevel: lowestConfidence(findings),
      aiDisclosure: null,
      narrative: "rules",
    },
    disclaimer: DISCLAIMER,
    executive: { conclusion, reasonsToProceed: reasonsToProceed.slice(0, 5), risks, nextSteps },
    identity: {
      verdictLabel: asStr(identity.verdictLabel, IDENTITY_VERDICT_LABELS.unresolved),
      rows: asArr<{ item: string; finding: string; evidence: string; confidence: string }>(identity.rows).map((r) => ({
        item: asStr(r.item),
        finding: asStr(r.finding),
        evidence: asStr(r.evidence),
        confidence: asStr(r.confidence, "low"),
      })),
      confusionNote: asStr(identity.confusionNote, "Ticker-confusion review pending."),
    },
    opportunity: {
      terms: [
        { label: "Instrument", value: intake.offerType ?? "unknown" },
        { label: "Price", value: intake.offerPrice ?? "—" },
        { label: "Size", value: intake.investmentAmount ?? "—" },
        { label: "Lockup / vesting", value: intake.lockupVesting ?? "—" },
        { label: "Counterparty", value: intake.counterparties.map((c) => c.name).filter(Boolean).join(", ") || "—" },
        { label: "Client jurisdiction", value: intake.clientJurisdiction ?? "—" },
        { label: "Issuer jurisdiction", value: intake.issuerJurisdiction ?? "—" },
      ],
      missingInformation: asArr<string>(getMO(outputs, "intake-parser").missingCoreFields).map(String),
    },
    sources: s.sources.map((src, index) => ({
      id: src.id,
      ref: `S${index + 1}`,
      name: src.name,
      type: src.sourceType,
      reliability: src.reliabilityRating,
      url: src.url ?? "",
      use: src.title ?? "",
      notes: src.notes ?? "",
    })),
    entityLegal: {
      entities: asArr<{ name: string; role: string; jurisdiction: string; notes: string }>(et.entities).map((e) => ({
        name: asStr(e.name),
        role: asStr(e.role),
        jurisdiction: asStr(e.jurisdiction),
        evidence: "intake/registry",
        notes: asStr(e.notes, ""),
      })),
      legalStructureNote: asStr(et.legalStructureNote, "Entity structure unmapped."),
    },
    team: {
      summary:
        s.people.length > 0
          ? `${s.people.length} individual(s) recorded. Founder risk score ${asNum(et.founderScore) ?? "—"}/10 (10 = lowest risk).`
          : "No team members identified; treat governance and accountability as unverified.",
      people: asArr<{ name: string; roles: string[]; previous: string[]; reputation: string }>(et.people).map((p) => ({
        name: asStr(p.name),
        role: Array.isArray(p.roles) ? p.roles.join(", ") : "—",
        background: Array.isArray(p.previous) ? p.previous.join(", ") : "—",
        evidence: "public profiles",
        riskNotes: asStr(p.reputation, ""),
      })),
      founderScore: asNum(et.founderScore),
    },
    tokenomics: {
      hasData: tokHasData,
      verdict: asStr(tok.verdict, "Insufficient tokenomics data."),
      supply: [
        { label: "Price", value: fmtUsd(asNum(supply.price)) },
        { label: "Market cap", value: fmtUsd(asNum(supply.marketCap)) },
        { label: "FDV", value: fmtUsd(asNum(supply.fdv)) },
        { label: "Circulating supply", value: fmtNum(asNum(supply.circulatingSupply)) },
        { label: "Total supply", value: fmtNum(asNum(supply.totalSupply)) },
        { label: "Max supply", value: fmtNum(asNum(supply.maxSupply)) },
      ],
      allocations: asArr<{ category: string; amountTokens: number; percentageTotal: number; vesting: string }>(tok.allocations).map((a) => ({
        category: asStr(a.category),
        tokens: fmtNum(asNum(a.amountTokens)),
        percent: fmtPct(asNum(a.percentageTotal)),
        vesting: asStr(a.vesting, "—"),
        notes: "",
      })),
      unlocks: asArr<{ date: string; amountTokens: number; percentageSupply: number; category: string; cliff: boolean }>(tok.unlocks).map((u) => ({
        date: asStr(u.date),
        tokens: fmtNum(asNum(u.amountTokens)),
        percent: fmtPct(asNum(u.percentageSupply)),
        category: asStr(u.category),
        risk: u.cliff ? "Cliff — concentrated unlock" : "Linear",
      })),
      valueCapture: buildValueCapture(tok),
      staking: asArr<string>(tok.utility).length ? `Stated utility: ${asArr<string>(tok.utility).join(", ")}.` : "No live utility documented.",
      risks: buildTokenomicsRisks(conc, asNum(tok.unlockPressureRatio)),
    },
    market: {
      summary: `${asNum(mkt.venueCount) ?? 0} venue(s); 24h volume ${fmtUsd(asNum(mkt.volume24h))}. ${asStr(mkt.exitAssessment, "")}`,
      venues: venues.map((v) => ({
        venue: asStr((v as MO).venue),
        pair: asStr((v as MO).pair),
        volume: fmtUsd(asNum((v as MO).volume24h)),
        spread: (v as MO).spreadBps != null ? `${asNum((v as MO).spreadBps)} bps` : "—",
        depth: fmtUsd(asNum((v as MO).depth)),
        notes: `${asStr((v as MO).deposit, "?")}/${asStr((v as MO).withdrawal, "?")} dep/wd`,
      })),
      slippage: slippage.map((sl) => ({
        size: fmtUsd(asNum((sl as MO).size)),
        buy: (sl as MO).buy != null ? fmtPct(asNum((sl as MO).buy)) : "—",
        sell: (sl as MO).sell != null ? fmtPct(asNum((sl as MO).sell)) : "—",
        route: asStr((sl as MO).method, "heuristic"),
        notes: "",
      })),
      verdict: asStr(mkt.exitAssessment, "Liquidity assessment pending data."),
    },
    technical: {
      contracts: asArr<{ name: string; chain: string; address: string; verified: boolean; adminNotes: string }>(oc.contracts).map((c) => ({
        name: asStr(c.name),
        chain: asStr(c.chain),
        address: asStr(c.address),
        verified: c.verified ? "yes" : "no",
        adminNotes: asStr(c.adminNotes, "—"),
      })),
      analysis: oc.criticalAdminRisk
        ? "Critical admin-key risk detected: dangerous powers without multisig/timelock controls. Treat as high technical risk until independently confirmed renounced or controlled."
        : asArr(oc.contracts).length
          ? "Contract permissions reviewed. See table for verification status and admin powers."
          : "No on-chain contract analysis entered; admin powers and verification status are undisclosed pending review.",
    },
    stablecoinRwa: {
      applicable: stablecoin || rwa,
      applicability: stablecoin && rwa ? "Stablecoin and RWA components apply." : stablecoin ? "Stablecoin component applies." : rwa ? "RWA/tokenisation component applies." : "Not applicable to this opportunity.",
      structure: "Structure must be evidenced by documents (issuer/SPV/custody). It is not assumed.",
      stablecoin: buildStablecoinText(getMO(sr, "stablecoin")),
      rwa: buildRwaText(getMO(sr, "rwa")),
      questions: asArr<string>(sr.questions).map(String),
    },
    businessModel: buildBusinessModel(s),
    competitive: buildCompetitive(stablecoin, rwa),
    legal: {
      analysis: `Issue spotting only — not legal advice. ${asArr(legal.issues).length} issue area(s) identified across jurisdictions; qualified counsel must review final transaction documents before any commitment.`,
      counselQuestions: asArr<string>(legal.counselQuestions).map(String),
    },
    redFlags: redFlags.map((f) => ({
      title: f.title,
      severity: f.severity,
      evidence: f.evidence ?? "—",
      impact: f.impact ?? "—",
      mitigation: f.mitigation ?? "—",
    })),
    investmentCase: buildInvestmentCase(intake.projectName, scorecard, asStr(fraud.scenario, ""), reasonsToProceed, risks),
    valuation: buildValuationScenarios(supply, mkt),
    dueDiligenceQuestions: QUESTION_BANK.filter((q) => filterQuestionSection(q.key, stablecoin, rwa)).map((q) => ({ title: q.title, questions: q.questions })),
    documentRequests: DOCUMENT_REQUESTS.filter((d) => !d.conditional || (d.key === "stablecoin" && stablecoin) || (d.key === "rwa" && rwa)).map((d) => ({ title: d.title, documents: d.documents })),
    scorecard: {
      contributions: scorecard.contributions,
      overallScore: scorecard.overallScore,
      recommendation: scorecard.recommendation,
      recommendationLabel: recLabel,
      gatingApplied: scorecard.gatingApplied,
      sources: {},
    },
    finalRecommendation: buildFinalRecommendation(scorecard, recLabel),
    findings: findings.map((f) => ({
      category: f.category,
      title: f.title,
      severity: f.severity,
      confidence: f.confidence,
      analysis: f.analysis ?? "",
      openQuestions: parseStringArray(f.openQuestions),
    })),
    qa: { sections: [], autoPass: 0, autoFail: 0, manual: 0, blocking: [] },
  };
  return model;
}

// ---- Narrative helpers -----------------------------------------------------

function buildConclusion(project: string, sc: ReturnType<typeof computeScorecard>, recLabel: string, verdict: string, flagCount: number, criticalCount: number): string {
  const score = sc.overallScore != null ? `${sc.overallScore}/10` : "not yet scored";
  const gate = sc.gatingApplied.length ? ` ${sc.gatingApplied.length} gating blocker(s) cap the outcome regardless of the average score.` : "";
  return `On the available evidence, ${project} carries an overall investability score of ${score} with an identity verdict of "${verdict}". ${criticalCount} material risk(s) and ${flagCount} red flag(s) were recorded.${gate} The recommendation is "${recLabel}". This is an evidence-led assessment: where data is missing it is treated as risk, not resolved in the project's favour.`;
}

function buildValueCapture(tok: MO): string {
  const vc = asArr<string>(tok.valueCapture);
  const disc = typeof tok.rightsDisclaimer === "string" ? tok.rightsDisclaimer : null;
  if (vc.length === 0 && !disc) return "No clear value-capture mechanism documented; the token may be narrative-driven. Confirm what gives the token economic value.";
  let text = vc.length ? `Stated value capture: ${vc.join(", ")}.` : "Value-capture mechanism not clearly stated.";
  if (disc) text += ` Rights disclaimer present: holders' rights appear limited/indirect ("${disc}").`;
  return text;
}

function buildTokenomicsRisks(conc: MO, unlockRatio: number | null): string {
  const parts: string[] = [];
  const insider = asNum(conc.insiderPct);
  if (insider != null) parts.push(`Insider allocation ~${insider.toFixed(0)}%.`);
  if (asNum(conc.mmPct) != null) parts.push(`Market-maker allocation ~${asNum(conc.mmPct)?.toFixed(0)}%.`);
  if (unlockRatio != null) parts.push(`Next-90-day unlock pressure ratio ${unlockRatio} (unlock value / ~90d volume).`);
  if (parts.length === 0) parts.push("Insufficient data to quantify dilution/unlock risk; obtain allocation and unlock schedule.");
  return parts.join(" ");
}

function buildStablecoinText(sc: MO): string {
  if (!sc || Object.keys(sc).length === 0) return "Not applicable.";
  const reserves = asArr<string>(sc.reserves);
  return `Issuer: ${asStr(sc.issuer)}. Classification: ${asStr(sc.classification)}. Reserves: ${reserves.length ? reserves.join(", ") : "undocumented"}. Redemption: ${asStr(sc.redemptionTerms)}. Reserve/redemption confirmation is required before relying on any peg.`;
}

function buildRwaText(rwa: MO): string {
  if (!rwa || Object.keys(rwa).length === 0) return "Not applicable.";
  const rights = asArr<string>(rwa.investorRights);
  return `Asset: ${asStr(rwa.assetDescription)} (${asStr(rwa.assetType)}). Owner before/after: ${asStr(rwa.ownerBefore)} → ${asStr(rwa.ownerAfter)}. SPV: ${asStr(rwa.spv)}. Investor rights: ${rights.length ? rights.join(", ") : "undocumented"}. Enforceable claim on the asset must be evidenced by legal documents.`;
}

function buildBusinessModel(s: CaseSnapshot): string {
  const hasRevenue = /revenue|customers|fees|tvl|aum/.test(s.corpus);
  return hasRevenue
    ? "The materials reference revenue/customers/TVL. Distinguish announced pipeline and TVL from realised, audited revenue; require methodology and signed customer contracts."
    : "No evidence of customers, revenue or live product was found in the available materials. Treat the business as narrative-stage until traction is evidenced.";
}

function buildCompetitive(stablecoin: boolean, rwa: boolean): string {
  if (rwa || stablecoin) {
    return "Relevant comparables in tokenisation/RWA include Securitize, Ondo, Backed Finance, Centrifuge, Maple, Franklin Templeton tokenised funds, BlackRock BUIDL ecosystem, WisdomTree Prime, and institutional infrastructure (JPMorgan/Kinexys-style), alongside traditional custodians, broker/dealers, private banks, fund administrators and transfer agents. Assess moat across regulatory licences, banking/custody, originator network, distribution, liquidity, infrastructure, brand and compliance tooling.";
  }
  return "Define the market category and main competitors, then compare on product, regulation, traction, liquidity and token value capture. Distinguish defensible moats from narrative positioning.";
}

function buildInvestmentCase(project: string, sc: ReturnType<typeof computeScorecard>, fraudScenario: string, reasons: string[], risks: string[]): ReportModel["investmentCase"] {
  return {
    bull: `Bull case: ${reasons.slice(0, 3).join(" ") || "Limited evidence-based positives."} Upside requires the open questions to resolve favourably with primary evidence.`,
    bear: `Bear case: ${risks.slice(0, 3).join("; ") || "Key risks unquantified due to missing data."}`,
    base: `Base case: on current evidence the recommendation is "${RECOMMENDATION_LABELS[sc.recommendation]}". Treat unresolved items as unresolved.`,
    downside: "Downside case: illiquid exit, insider unlock overhang, and/or unverified counterparty leave capital impaired with limited recourse.",
    fraud: fraudScenario || "Fraud/impersonation case: verify seller authority, official domains, contract address and payment instructions from primary sources before any transfer.",
  };
}

function buildValuationScenarios(supply: MO, _mkt: MO): ScenarioRow[] {
  const price = asNum(supply.price);
  const fdv = asNum(supply.fdv);
  const has = price != null || fdv != null;
  const base = has ? `Anchored to current price ${fmtUsd(price)} / FDV ${fmtUsd(fdv)}.` : "Requires market metrics to quantify.";
  return [
    { name: "Conservative", assumptions: "Thin liquidity persists; unlocks weigh on price; no new traction.", outcome: has ? "Material drawdown vs entry after lockup." : "Quantify once metrics provided.", probability: "—", notes: base },
    { name: "Base", assumptions: "Status quo execution; modest demand; scheduled unlocks absorbed slowly.", outcome: "Range-bound; lockup-adjusted return below headline.", probability: "—", notes: "Sensitivity tool only — not a forecast." },
    { name: "Upside", assumptions: "Real adoption/revenue materialises; value capture proven; liquidity deepens.", outcome: "Re-rating possible if open questions resolve with primary evidence.", probability: "—", notes: base },
    { name: "Disaster", assumptions: "Impersonation/admin-key/exit-liquidity risk realises.", outcome: "Capital largely impaired; limited recourse.", probability: "—", notes: "Weight per red-flag severity." },
  ];
}

function buildFinalRecommendation(sc: ReturnType<typeof computeScorecard>, recLabel: string): string {
  const gate = sc.gatingApplied.length
    ? ` The following blocker(s) cap the recommendation: ${sc.gatingApplied.join("; ")}.`
    : " No automatic gating blockers were triggered.";
  return `Final recommendation: ${recLabel} (overall ${sc.overallScore ?? "—"}/10).${gate} The recommendation must move only as the underlying evidence changes — clearing a blocker requires primary-source proof, not assurances.`;
}

function filterQuestionSection(key: string, stablecoin: boolean, rwa: boolean): boolean {
  if (key === "stablecoin") return stablecoin;
  if (key === "rwa") return rwa;
  return true;
}

function uniq(arr: string[]): string[] {
  return Array.from(new Set(arr.filter(Boolean)));
}

function lowestConfidence(findings: { confidence: string }[]): string {
  if (findings.some((f) => f.confidence === "low")) return "low";
  if (findings.some((f) => f.confidence === "medium")) return "medium";
  return findings.length ? "high" : "medium";
}

export type { ScoreCategoryKey };
