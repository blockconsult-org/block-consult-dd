/**
 * Report templates — which sections render for each report type. The 9 report
 * deliverables in the brief map onto these section sets.
 */
import type { ReportType } from "@/domain/enums";

export type SectionKey =
  | "executive"
  | "identity"
  | "opportunity"
  | "sourceMap"
  | "entityLegal"
  | "team"
  | "tokenomics"
  | "market"
  | "technical"
  | "stablecoinRwa"
  | "businessModel"
  | "competitive"
  | "legal"
  | "redFlags"
  | "investmentCase"
  | "valuation"
  | "dueDiligence"
  | "documentRequests"
  | "scorecard"
  | "finalRecommendation"
  | "findings"
  | "appendix"
  | "qa";

export const SECTION_ORDER: SectionKey[] = [
  "executive",
  "identity",
  "opportunity",
  "sourceMap",
  "entityLegal",
  "team",
  "tokenomics",
  "market",
  "technical",
  "stablecoinRwa",
  "businessModel",
  "competitive",
  "legal",
  "redFlags",
  "investmentCase",
  "valuation",
  "dueDiligence",
  "documentRequests",
  "scorecard",
  "finalRecommendation",
  "findings",
  "appendix",
  "qa",
];

const FULL: SectionKey[] = SECTION_ORDER;

const TEMPLATES: Record<ReportType, SectionKey[]> = {
  full_institutional: FULL,
  ic_memo: FULL,
  executive_memo: ["executive", "identity", "redFlags", "scorecard", "finalRecommendation"],
  quick_screen: ["executive", "identity", "redFlags", "scorecard", "finalRecommendation", "dueDiligence", "documentRequests"],
  tokenomics_only: ["executive", "identity", "tokenomics", "redFlags", "scorecard", "finalRecommendation", "dueDiligence", "documentRequests", "appendix"],
  liquidity_only: ["executive", "identity", "market", "redFlags", "finalRecommendation", "appendix"],
  stablecoin_rwa: ["executive", "identity", "entityLegal", "stablecoinRwa", "legal", "redFlags", "scorecard", "finalRecommendation", "dueDiligence", "documentRequests", "appendix"],
  private_offer_verification: ["executive", "identity", "opportunity", "entityLegal", "redFlags", "legal", "finalRecommendation", "documentRequests", "appendix"],
  founder_team_dossier: ["executive", "entityLegal", "team", "redFlags", "finalRecommendation", "appendix"],
  red_flag: ["executive", "redFlags", "scorecard", "finalRecommendation", "appendix"],
};

export function sectionsFor(reportType: ReportType): Set<SectionKey> {
  return new Set(TEMPLATES[reportType] ?? FULL);
}
