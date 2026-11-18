/** Structured report model consumed by the HTML/Markdown renderers. */
import type { Recommendation, ReportType, Severity } from "@/domain/enums";
import type { ScoreSources } from "@/domain/score-sources";
import type { WeightedContribution } from "@/domain/scoring";

export interface ReportMeta {
  brandName: string;
  preparedBy: string;
  reportKind: string;
  reportType: ReportType;
  reportTypeLabel: string;
  projectName: string;
  clientName: string;
  analyst: string;
  date: string;
  status: string;
  confidentiality: string;
  recommendation: Recommendation | null;
  recommendationLabel: string;
  overallScore: number | null;
  confidenceLevel: string;
  /** Which AI tools gathered evidence or drafted prose; null when the report is fully rule-based. */
  aiDisclosure: string | null;
  narrative: NarrativeState;
}

/** rules: built-in prose. ai: an AI draft that matches the current results. ai_stale: a draft exists but the results changed since. */
export type NarrativeState = "rules" | "ai" | "ai_stale";

export interface SourceRow {
  id: string;
  /** Citation id used in the report text, e.g. "S3". */
  ref: string;
  name: string;
  type: string;
  reliability: string;
  url: string;
  use: string;
  notes: string;
}

export interface RedFlagRow {
  title: string;
  severity: string;
  evidence: string;
  impact: string;
  mitigation: string;
}

export interface FindingRow {
  category: string;
  title: string;
  severity: Severity | string;
  confidence: string;
  analysis: string;
  openQuestions: string[];
}

export interface ScenarioRow {
  name: string;
  assumptions: string;
  outcome: string;
  probability: string;
  notes: string;
}

export interface QaResultItem {
  key: string;
  label: string;
  status: "pass" | "fail" | "manual";
  detail?: string;
}
export interface QaResultSection {
  key: string;
  title: string;
  items: QaResultItem[];
}
export interface QaResult {
  sections: QaResultSection[];
  autoPass: number;
  autoFail: number;
  manual: number;
  blocking: string[];
}

export interface ReportModel {
  meta: ReportMeta;
  disclaimer: string;
  executive: {
    conclusion: string;
    reasonsToProceed: string[];
    risks: string[];
    nextSteps: string[];
  };
  identity: {
    verdictLabel: string;
    rows: { item: string; finding: string; evidence: string; confidence: string }[];
    confusionNote: string;
  };
  opportunity: { terms: { label: string; value: string }[]; missingInformation: string[] };
  sources: SourceRow[];
  entityLegal: {
    entities: { name: string; role: string; jurisdiction: string; evidence: string; notes: string }[];
    legalStructureNote: string;
  };
  team: {
    summary: string;
    people: { name: string; role: string; background: string; evidence: string; riskNotes: string }[];
    founderScore: number | null;
  };
  tokenomics: {
    hasData: boolean;
    verdict: string;
    supply: { label: string; value: string }[];
    allocations: { category: string; tokens: string; percent: string; vesting: string; notes: string }[];
    unlocks: { date: string; tokens: string; percent: string; category: string; risk: string }[];
    valueCapture: string;
    staking: string;
    risks: string;
  };
  market: {
    summary: string;
    venues: { venue: string; pair: string; volume: string; spread: string; depth: string; notes: string }[];
    slippage: { size: string; buy: string; sell: string; route: string; notes: string }[];
    verdict: string;
  };
  technical: {
    contracts: { name: string; chain: string; address: string; verified: string; adminNotes: string }[];
    analysis: string;
  };
  stablecoinRwa: {
    applicable: boolean;
    applicability: string;
    structure: string;
    stablecoin: string;
    rwa: string;
    questions: string[];
  };
  businessModel: string;
  competitive: string;
  legal: { analysis: string; counselQuestions: string[] };
  redFlags: RedFlagRow[];
  investmentCase: { bull: string; bear: string; base: string; downside: string; fraud: string };
  valuation: ScenarioRow[];
  dueDiligenceQuestions: { title: string; questions: string[] }[];
  documentRequests: { title: string; documents: string[] }[];
  scorecard: {
    contributions: WeightedContribution[];
    overallScore: number | null;
    recommendation: Recommendation;
    recommendationLabel: string;
    gatingApplied: string[];
    /** Who set each category score: analyst, rule-based checks or AI. */
    sources: ScoreSources;
  };
  finalRecommendation: string;
  findings: FindingRow[];
  qa: QaResult;
}
