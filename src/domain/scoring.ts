/**
 * Scoring engine — scoring-framework.md.
 *
 * Each category is scored 1..10 (10 = strong / low risk; for fraud/impersonation
 * risk 10 = LOWEST fraud risk). The overall score is the weighted sum. Gating
 * overrides can only DOWNGRADE the recommendation, never upgrade it — a high
 * average must never override a critical blocker.
 */

import { RECOMMENDATION_LABELS, type Recommendation } from "./enums";

export type ScoreCategoryKey =
  | "legalRegulatoryClarity"
  | "fraudImpersonationRisk"
  | "tokenValueCapture"
  | "marketLiquidity"
  | "teamFounderQuality"
  | "businessFundamentals"
  | "valuationAttractiveness"
  | "technicalSafety"
  | "partnershipCredibility"
  | "transparencyDisclosure";

export interface ScoreCategoryMeta {
  key: ScoreCategoryKey;
  label: string;
  weight: number; // 0..1; transparencyDisclosure is informational (0)
  informational?: boolean;
}

/** Ordered category metadata. Weights sum to 1.00 across the 9 weighted rows. */
export const SCORE_CATEGORIES: ScoreCategoryMeta[] = [
  { key: "legalRegulatoryClarity", label: "Legal/regulatory clarity", weight: 0.15 },
  { key: "fraudImpersonationRisk", label: "Fraud/impersonation risk", weight: 0.15 },
  { key: "tokenValueCapture", label: "Token value capture", weight: 0.15 },
  { key: "marketLiquidity", label: "Market liquidity", weight: 0.15 },
  { key: "teamFounderQuality", label: "Team/founder quality", weight: 0.1 },
  { key: "businessFundamentals", label: "Business fundamentals", weight: 0.1 },
  { key: "valuationAttractiveness", label: "Valuation attractiveness", weight: 0.1 },
  { key: "technicalSafety", label: "Technical/smart contract safety", weight: 0.05 },
  { key: "partnershipCredibility", label: "Partnership credibility", weight: 0.05 },
  {
    key: "transparencyDisclosure",
    label: "Transparency/disclosure quality",
    weight: 0,
    informational: true,
  },
];

export type ScoreInput = Partial<Record<ScoreCategoryKey, number | null>>;

export interface WeightedContribution {
  key: ScoreCategoryKey;
  label: string;
  score: number | null;
  weight: number;
  weighted: number | null;
  informational: boolean;
}

/** Recommendation ordering from best to worst (used to take the worst of N). */
const RECOMMENDATION_ORDER: Recommendation[] = [
  "invest",
  "strict_conditions",
  "wait_monitor",
  "reject",
  "reject_likely_scam",
];

export function worseRecommendation(a: Recommendation, b: Recommendation): Recommendation {
  return RECOMMENDATION_ORDER.indexOf(a) >= RECOMMENDATION_ORDER.indexOf(b) ? a : b;
}

/** Map a raw overall score (1..10) to the default recommendation band. */
export function recommendationFromScore(overall: number): Recommendation {
  if (overall >= 8.0) return "invest";
  if (overall >= 6.5) return "strict_conditions";
  if (overall >= 5.0) return "wait_monitor";
  if (overall >= 3.0) return "reject";
  return "reject_likely_scam";
}

/**
 * Gating overrides. Each flag, when true, imposes a CEILING recommendation
 * (the best the case is allowed to receive). Grouped by the tier the spec
 * assigns. The final recommendation is the worst of the score band and every
 * triggered ceiling.
 */
export interface GatingFlags {
  // -> wait_monitor or worse
  legalInstrumentUnknown?: boolean;
  tokenomicsUnlocksMissing?: boolean;
  stablecoinReserveUnclear?: boolean;
  rwaOwnershipUnclear?: boolean;
  marketCannotSupportExit?: boolean;
  // -> reject or worse
  sellerAuthorityUnproven?: boolean;
  contractConflictsOfficial?: boolean;
  criticalAdminUndisclosed?: boolean;
  majorPartnershipUnverified?: boolean;
  privateOfferOverpriced?: boolean;
  // -> reject_likely_scam
  officialEntityDeniesOffer?: boolean;
  paymentUnauthenticated?: boolean;
  impostorDomainOrWallet?: boolean;
  forgedDocuments?: boolean;
  guaranteedReturnsUnverified?: boolean;
}

interface GatingRule {
  flag: keyof GatingFlags;
  ceiling: Recommendation;
  label: string;
}

export const GATING_RULES: GatingRule[] = [
  { flag: "legalInstrumentUnknown", ceiling: "wait_monitor", label: "Actual legal instrument unknown" },
  { flag: "tokenomicsUnlocksMissing", ceiling: "wait_monitor", label: "Tokenomics / unlocks missing" },
  { flag: "stablecoinReserveUnclear", ceiling: "wait_monitor", label: "Stablecoin reserve/redemption unclear and central to thesis" },
  { flag: "rwaOwnershipUnclear", ceiling: "wait_monitor", label: "RWA ownership/collateral unclear and central to thesis" },
  { flag: "marketCannotSupportExit", ceiling: "wait_monitor", label: "Market cannot support intended exit size" },
  { flag: "sellerAuthorityUnproven", ceiling: "reject", label: "Seller authority unproven for private sale" },
  { flag: "contractConflictsOfficial", ceiling: "reject", label: "Contract address conflicts with official source" },
  { flag: "criticalAdminUndisclosed", ceiling: "reject", label: "Critical admin controls undisclosed" },
  { flag: "majorPartnershipUnverified", ceiling: "reject", label: "Major partnership central to thesis but unverified" },
  { flag: "privateOfferOverpriced", ceiling: "reject", label: "Private offer materially overpriced vs market/liquidity" },
  { flag: "officialEntityDeniesOffer", ceiling: "reject_likely_scam", label: "Official entity denies the offer" },
  { flag: "paymentUnauthenticated", ceiling: "reject_likely_scam", label: "Payment instructions unauthenticated" },
  { flag: "impostorDomainOrWallet", ceiling: "reject_likely_scam", label: "Impostor domain/wallet confirmed" },
  { flag: "forgedDocuments", ceiling: "reject_likely_scam", label: "Forged documents detected" },
  { flag: "guaranteedReturnsUnverified", ceiling: "reject_likely_scam", label: "Guaranteed returns paired with unverified offer" },
];

export interface ScorecardResult {
  overallScore: number | null;
  recommendation: Recommendation;
  recommendationLabel: string;
  contributions: WeightedContribution[];
  gatingApplied: string[];
  scoreBandRecommendation: Recommendation | null;
}

/**
 * Compute the weighted overall score and the gated recommendation.
 * The overall is normalised by the total weight of the categories that actually
 * have a score, so a few missing inputs don't deflate the result off-scale.
 */
export function computeScorecard(scores: ScoreInput, gating: GatingFlags = {}): ScorecardResult {
  const contributions: WeightedContribution[] = SCORE_CATEGORIES.map((cat) => {
    const raw = scores[cat.key];
    const score = typeof raw === "number" && !Number.isNaN(raw) ? clamp(raw, 1, 10) : null;
    const weighted = score != null && cat.weight > 0 ? round2(score * cat.weight) : null;
    return {
      key: cat.key,
      label: cat.label,
      score,
      weight: cat.weight,
      weighted,
      informational: Boolean(cat.informational),
    };
  });

  let weightSum = 0;
  let weightedTotal = 0;
  for (const c of contributions) {
    if (c.informational || c.score == null) continue;
    weightSum += c.weight;
    weightedTotal += (c.weighted ?? 0);
  }
  const overallScore = weightSum > 0 ? round2(weightedTotal / weightSum) : null;

  const scoreBand = overallScore != null ? recommendationFromScore(overallScore) : null;

  // Start from the score band (or the most cautious band if unscored), then
  // apply every triggered gating ceiling, always taking the worse outcome.
  let recommendation: Recommendation = scoreBand ?? "wait_monitor";
  const gatingApplied: string[] = [];
  for (const rule of GATING_RULES) {
    if (gating[rule.flag]) {
      recommendation = worseRecommendation(recommendation, rule.ceiling);
      gatingApplied.push(rule.label);
    }
  }

  return {
    overallScore,
    recommendation,
    recommendationLabel: RECOMMENDATION_LABELS[recommendation],
    contributions,
    gatingApplied,
    scoreBandRecommendation: scoreBand,
  };
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
