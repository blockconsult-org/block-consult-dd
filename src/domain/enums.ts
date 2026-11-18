/**
 * Canonical enums for the Block Consult DD tool.
 * Values are stored as strings in the database and validated with Zod at
 * every API boundary (see src/domain/schemas.ts).
 */

export const CASE_STATUS = ["draft", "qa", "final", "archived"] as const;
export type CaseStatus = (typeof CASE_STATUS)[number];

export const REPORT_TYPE = [
  "full_institutional",
  "quick_screen",
  "tokenomics_only",
  "liquidity_only",
  "stablecoin_rwa",
  "private_offer_verification",
  "founder_team_dossier",
  "red_flag",
  "ic_memo",
  "executive_memo",
] as const;
export type ReportType = (typeof REPORT_TYPE)[number];

export const REPORT_TYPE_LABELS: Record<ReportType, string> = {
  full_institutional: "Full Institutional DD Report",
  quick_screen: "Quick Screen",
  tokenomics_only: "Tokenomics Deep Dive",
  liquidity_only: "Liquidity & Exit Risk Memo",
  stablecoin_rwa: "Stablecoin / RWA / Tokenisation Memo",
  private_offer_verification: "Private Offer Verification Memo",
  founder_team_dossier: "Founder / Team Dossier",
  red_flag: "Red-Flag Report",
  ic_memo: "IC Recommendation Memo",
  executive_memo: "One-Page Executive Memo",
};

/** Source reliability classification (source-policy.md). */
export const SOURCE_TYPE = [
  "primary_official",
  "primary_exchange",
  "primary_chain",
  "primary_registry",
  "primary_counterparty",
  "secondary_high",
  "secondary_contributor",
  "market_aggregator",
  "community",
  "pitch_claim",
  "unknown",
] as const;
export type SourceType = (typeof SOURCE_TYPE)[number];

export const RELIABILITY_RATING = ["high", "medium", "low", "unknown"] as const;
export type ReliabilityRating = (typeof RELIABILITY_RATING)[number];

/** How a single claim relates to the evidence base. */
export const CLAIM_CLASS = [
  "primary",
  "secondary",
  "community",
  "market",
  "unsupported",
] as const;
export type ClaimClass = (typeof CLAIM_CLASS)[number];

export const CONFIDENCE = ["high", "medium", "low"] as const;
export type Confidence = (typeof CONFIDENCE)[number];

export const ENTITY_TYPE = [
  "company",
  "foundation",
  "protocol",
  "dao",
  "exchange",
  "custodian",
  "broker",
  "bank",
  "issuer",
  "spv",
  "unknown",
] as const;
export type EntityType = (typeof ENTITY_TYPE)[number];

export const ALLOCATION_CATEGORY = [
  "team",
  "founders",
  "advisors",
  "private_investors",
  "public_sale",
  "treasury",
  "ecosystem",
  "staking_rewards",
  "market_makers",
  "liquidity",
  "foundation",
  "community",
  "unknown",
] as const;
export type AllocationCategory = (typeof ALLOCATION_CATEGORY)[number];

export const MARKET_TYPE = ["cex_spot", "dex_pool", "derivatives", "unknown"] as const;
export type MarketType = (typeof MARKET_TYPE)[number];

export const STABLECOIN_CLASSIFICATION = [
  "e_money_token",
  "asset_referenced_token",
  "deposit_token",
  "fiat_backed",
  "crypto_backed",
  "algorithmic",
  "unknown",
] as const;
export type StablecoinClassification = (typeof STABLECOIN_CLASSIFICATION)[number];

export const RWA_ASSET_TYPE = [
  "real_estate",
  "receivable",
  "bond",
  "fund",
  "commodity",
  "equity",
  "loan",
  "other",
] as const;
export type RwaAssetType = (typeof RWA_ASSET_TYPE)[number];

export const FINDING_CATEGORY = [
  "identity",
  "entity",
  "team",
  "tokenomics",
  "market",
  "technical",
  "rwa",
  "stablecoin",
  "legal",
  "fraud",
  "valuation",
  "other",
] as const;
export type FindingCategory = (typeof FINDING_CATEGORY)[number];

export const SEVERITY = [
  "critical",
  "high",
  "medium",
  "low",
  "informational",
  "unresolved",
] as const;
export type Severity = (typeof SEVERITY)[number];

export const RED_FLAG_SEVERITY = [
  "critical",
  "high",
  "medium",
  "low",
  "unresolved",
] as const;
export type RedFlagSeverity = (typeof RED_FLAG_SEVERITY)[number];

/** Final investability recommendation (scoring-framework.md). */
export const RECOMMENDATION = [
  "invest",
  "strict_conditions",
  "wait_monitor",
  "reject",
  "reject_likely_scam",
] as const;
export type Recommendation = (typeof RECOMMENDATION)[number];

export const RECOMMENDATION_LABELS: Record<Recommendation, string> = {
  invest: "Invest",
  strict_conditions: "Invest only under strict conditions",
  wait_monitor: "Wait / monitor",
  reject: "Reject",
  reject_likely_scam: "Reject as likely scam/impersonation",
};

/** Identity verdicts (identity-verification.md). */
export const IDENTITY_VERDICT = [
  "verified",
  "partially_verified",
  "unresolved",
  "contradicted",
  "likely_impersonation",
] as const;
export type IdentityVerdict = (typeof IDENTITY_VERDICT)[number];

export const IDENTITY_VERDICT_LABELS: Record<IdentityVerdict, string> = {
  verified: "Verified",
  partially_verified: "Partially verified",
  unresolved: "Unresolved",
  contradicted: "Contradicted",
  likely_impersonation: "Likely impersonation",
};

/** Exchange listing status (identity-verification.md). */
export const LISTING_STATUS = [
  "confirmed_spot",
  "confirmed_wallet_support",
  "delisted",
  "unverified",
  "misleading",
] as const;
export type ListingStatus = (typeof LISTING_STATUS)[number];

/** Partnership classification (research-workflow.md). */
export const PARTNERSHIP_CLASS = [
  "confirmed_primary",
  "confirmed_one_sided",
  "reported_secondary",
  "social_signal",
  "claimed_only",
  "unverified",
  "contradicted",
] as const;
export type PartnershipClass = (typeof PARTNERSHIP_CLASS)[number];

/** Valuation scenarios (valuation-framework.md). */
export const VALUATION_SCENARIO = ["conservative", "base", "upside", "disaster"] as const;
export type ValuationScenario = (typeof VALUATION_SCENARIO)[number];

export const INTAKE_OFFER_TYPE = [
  "public_token",
  "otc",
  "private_allocation",
  "saft",
  "equity",
  "note",
  "fund",
  "rwa",
  "stablecoin",
  "staking",
  "other",
] as const;
export type IntakeOfferType = (typeof INTAKE_OFFER_TYPE)[number];

export const WORKER_STATUS = ["ok", "partial", "failed", "skipped"] as const;
export type WorkerStatus = (typeof WORKER_STATUS)[number];

export const RESEARCH_RUN_STATUS = ["queued", "running", "completed", "failed", "cancelled"] as const;
export type ResearchRunStatus = (typeof RESEARCH_RUN_STATUS)[number];

/** offline = rule-based workers only; ai = AI research + verification + analysis, then the workers. */
export const RESEARCH_MODE = ["offline", "ai"] as const;
export type ResearchMode = (typeof RESEARCH_MODE)[number];

/** Who created a source, claim, finding or red flag. */
export const RECORD_ORIGIN = ["manual", "ai"] as const;
export type RecordOrigin = (typeof RECORD_ORIGIN)[number];

/** Subject area of an evidence claim gathered by AI research. */
export const CLAIM_TOPIC = [
  "identity",
  "entity",
  "team",
  "tokenomics",
  "market",
  "onchain",
  "legal",
  "partnership",
  "security",
  "business",
  "stablecoin",
  "rwa",
  "other",
] as const;
export type ClaimTopic = (typeof CLAIM_TOPIC)[number];

/** Result of checking a claim's quote against the fetched source page. */
export const QUOTE_VERIFICATION = ["verified", "partial", "not_found", "unreachable", "blocked"] as const;
export type QuoteVerification = (typeof QUOTE_VERIFICATION)[number];

export const QUOTE_VERIFICATION_LABELS: Record<QuoteVerification, string> = {
  verified: "Quote found on page",
  partial: "Quote partly matches",
  not_found: "Quote not on page",
  unreachable: "Page unreachable",
  blocked: "Not fetched (blocked address)",
};
