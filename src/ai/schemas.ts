/**
 * Output contracts for the four AI tasks. Every field is required and every
 * object is closed, because strict structured-output modes demand it. Empty
 * strings and empty arrays stand for "unknown" or "none"; a score of 0 means
 * the evidence does not support a score.
 */
import { z } from "zod/v4";
import {
  CLAIM_CLASS,
  CLAIM_TOPIC,
  CONFIDENCE,
  FINDING_CATEGORY,
  INTAKE_OFFER_TYPE,
  RED_FLAG_SEVERITY,
  SEVERITY,
  SOURCE_TYPE,
} from "@/domain/enums";
import type { GatingFlags, ScoreCategoryKey } from "@/domain/scoring";
import { toStrictJsonSchema } from "./json-schema";

// ---------------------------------------------------------------------------
// Research: sources and quoted claims gathered on the web
// ---------------------------------------------------------------------------

export const researchSourceSchema = z.strictObject({
  ref: z.string().describe('Short id such as "S1", unique within this response.'),
  url: z.string().describe("Full URL of a page you opened or saw in search results. Never construct or guess a URL."),
  title: z.string().describe("Page title."),
  publisher: z.string().describe('Organisation or site that published the page; "" if unknown.'),
  sourceType: z.enum(SOURCE_TYPE).describe("Reliability class of the source."),
  publishedAt: z.string().describe('Publication date as YYYY-MM-DD; "" if unknown.'),
  summary: z.string().describe("One or two sentences on what this page establishes for the case."),
});

export const researchClaimSchema = z.strictObject({
  topic: z.enum(CLAIM_TOPIC),
  claim: z.string().describe("One factual statement, written neutrally, that the source supports."),
  claimClass: z.enum(CLAIM_CLASS),
  sourceRef: z.string().describe('ref of the supporting source, or "" when no source supports the claim.'),
  quote: z
    .string()
    .describe(
      'Exact sentence copied character for character from the source page that supports the claim, at most about 300 characters; "" when there is no source.',
    ),
  confidence: z.enum(CONFIDENCE),
});

export const researchOutputSchema = z.strictObject({
  overview: z.string().describe("Three to six sentences: what the research established and what remains unverified."),
  sources: z.array(researchSourceSchema),
  claims: z.array(researchClaimSchema),
  contradictions: z.array(z.string()).describe("Places where sources, or sources and the intake, disagree."),
  openQuestions: z.array(z.string()).describe("Questions the research could not answer and the analyst should pursue."),
});
export type ResearchOutput = z.infer<typeof researchOutputSchema>;

// ---------------------------------------------------------------------------
// Analysis: findings, red flags, gating flags and suggested scores
// ---------------------------------------------------------------------------

export const SCORE_KEYS = [
  "legalRegulatoryClarity",
  "fraudImpersonationRisk",
  "tokenValueCapture",
  "marketLiquidity",
  "teamFounderQuality",
  "businessFundamentals",
  "valuationAttractiveness",
  "technicalSafety",
  "partnershipCredibility",
  "transparencyDisclosure",
] as const satisfies readonly ScoreCategoryKey[];

export const GATING_KEYS = [
  "legalInstrumentUnknown",
  "tokenomicsUnlocksMissing",
  "stablecoinReserveUnclear",
  "rwaOwnershipUnclear",
  "marketCannotSupportExit",
  "sellerAuthorityUnproven",
  "contractConflictsOfficial",
  "criticalAdminUndisclosed",
  "majorPartnershipUnverified",
  "privateOfferOverpriced",
  "officialEntityDeniesOffer",
  "paymentUnauthenticated",
  "impostorDomainOrWallet",
  "forgedDocuments",
  "guaranteedReturnsUnverified",
] as const satisfies readonly (keyof GatingFlags)[];
export type GatingKey = (typeof GATING_KEYS)[number];

export const RED_FLAG_CODES = [
  "FRAUD_FAKE_PRIVATE_OFFER",
  "FRAUD_IMPOSTOR_DOMAIN",
  "FRAUD_MISLEADING_PARTNERSHIP",
  "FRAUD_TOKENOMICS_OPACITY",
  "FRAUD_LIQUIDITY_ILLUSION",
  "FRAUD_STABLECOIN_RESERVE",
  "FRAUD_RWA_OWNERSHIP",
  "FRAUD_ADMIN_KEY_HIDDEN",
  "FRAUD_TEAM_CREDIBILITY",
  "FRAUD_SALES_PRESSURE",
  "OTHER",
] as const;

const evidenceIds = z.array(z.string()).describe('Evidence ids such as "E3" that support this item.');

export const analysisFindingSchema = z.strictObject({
  category: z.enum(FINDING_CATEGORY),
  severity: z.enum(SEVERITY),
  confidence: z.enum(CONFIDENCE),
  title: z.string().describe("Short, specific title."),
  claim: z.string().describe("The statement or fact being assessed."),
  analysis: z.string().describe("What the evidence shows and why it matters. Cite evidence ids in square brackets, e.g. [E3]."),
  impact: z.string().describe("Consequence for the client if the finding holds."),
  mitigation: z.string().describe('What would resolve or reduce the risk; "" if nothing applies.'),
  evidenceIds,
  openQuestions: z.array(z.string()),
});

export const analysisRedFlagSchema = z.strictObject({
  code: z.enum(RED_FLAG_CODES).describe("Catalog pattern this flag matches, or OTHER."),
  title: z.string(),
  severity: z.enum(RED_FLAG_SEVERITY),
  evidence: z.string().describe("The facts that raise the flag, with evidence ids."),
  impact: z.string(),
  mitigation: z.string(),
  evidenceIds,
});

const scoreEntry = z.strictObject({
  score: z.number().describe("1 (worst) to 10 (best); 0 when the evidence is not enough to score."),
  rationale: z.string().describe("One or two sentences citing evidence ids."),
});

const scoreShape = Object.fromEntries(SCORE_KEYS.map((key) => [key, scoreEntry])) as Record<
  (typeof SCORE_KEYS)[number],
  typeof scoreEntry
>;
const gatingShape = Object.fromEntries(GATING_KEYS.map((key) => [key, z.boolean()])) as Record<
  GatingKey,
  z.ZodBoolean
>;

export const analysisOutputSchema = z.strictObject({
  summary: z.string().describe("Four to eight sentences: the overall risk picture and what drives it."),
  confidence: z.enum(CONFIDENCE).describe("Confidence in the assessment given the evidence available."),
  findings: z.array(analysisFindingSchema),
  redFlags: z.array(analysisRedFlagSchema),
  gating: z.strictObject(gatingShape).describe("Set a flag to true only when the evidence supports it."),
  gatingReasons: z
    .array(z.strictObject({ flag: z.enum(GATING_KEYS), reason: z.string() }))
    .describe("One entry for every gating flag set to true."),
  scores: z.strictObject(scoreShape),
});
export type AnalysisOutput = z.infer<typeof analysisOutputSchema>;

// ---------------------------------------------------------------------------
// Narrative: report prose drafted from the case record
// ---------------------------------------------------------------------------

const paragraph = (what: string) => z.string().describe(`${what} Plain prose, no Markdown headings. "" if the record has nothing to say.`);

export const narrativeOutputSchema = z.strictObject({
  executiveConclusion: paragraph("Two to four sentences stating the conclusion and the main reasons for it."),
  reasonsToProceed: z.array(z.string()).describe("Up to five reasons supported by evidence. Empty if none."),
  keyRisks: z.array(z.string()).describe("Up to six of the most important risks."),
  nextSteps: z.array(z.string()).describe("Up to six concrete next steps for the client."),
  teamSummary: paragraph("Team and founder assessment."),
  tokenomicsVerdict: paragraph("One or two sentences on the token design and supply."),
  valueCapture: paragraph("How, if at all, value accrues to the token."),
  tokenomicsRisks: paragraph("Dilution, unlock, concentration and emissions risks."),
  marketSummary: paragraph("Venues, liquidity and trading quality."),
  marketVerdict: paragraph("Whether the market can absorb the client's intended position and exit."),
  technicalAnalysis: paragraph("Contracts, admin powers, audits and security history."),
  businessModel: paragraph("What the project sells, to whom, and how it earns revenue."),
  competitive: paragraph("Competitors and the project's position against them."),
  legalAnalysis: paragraph("Legal and regulatory issues to raise with counsel. Issue spotting only, not legal advice."),
  investmentCase: z.strictObject({
    bull: paragraph("Bull case."),
    bear: paragraph("Bear case."),
    base: paragraph("Base case."),
    downside: paragraph("Downside case."),
    fraud: paragraph("Fraud or impersonation scenario and its warning signs."),
  }),
});
export type NarrativeOutput = z.infer<typeof narrativeOutputSchema>;

// ---------------------------------------------------------------------------
// Intake: structured fields extracted from pasted offer text
// ---------------------------------------------------------------------------

export const intakeExtractSchema = z.strictObject({
  projectName: z.string(),
  clientName: z.string().describe('The client receiving the offer, if named; "" otherwise.'),
  tickers: z.array(z.string()),
  links: z.array(z.string()).describe("URLs exactly as written in the text."),
  contractAddresses: z.array(z.strictObject({ chain: z.string(), address: z.string() })),
  chains: z.array(z.string()),
  claimedPartnerships: z.array(z.string()),
  claimedExchangeListings: z.array(z.string()),
  walletAddresses: z.array(z.string()).describe("Wallet addresses, including any the seller asks funds to be sent to."),
  counterparties: z.array(
    z.strictObject({ name: z.string(), claimedRole: z.string(), contact: z.string(), notes: z.string() }),
  ),
  questionsToVerify: z.array(z.string()).describe("Claims in the text that need independent verification."),
  offerType: z.enum([...INTAKE_OFFER_TYPE, "unknown"]),
  offerPrice: z.string(),
  investmentAmount: z.string(),
  lockupVesting: z.string(),
  sellerDetails: z.string().describe("Who is selling, how they made contact, and what authority they claim."),
  clientJurisdiction: z.string(),
  issuerJurisdiction: z.string(),
  notes: z.string().describe("Other details relevant to due diligence, such as deadlines or payment instructions."),
});
export type IntakeExtract = z.infer<typeof intakeExtractSchema>;

// ---------------------------------------------------------------------------
// Connection test
// ---------------------------------------------------------------------------

export const pingSchema = z.strictObject({ reply: z.string() });

export const JSON_SCHEMAS = {
  research: toStrictJsonSchema(researchOutputSchema),
  analysis: toStrictJsonSchema(analysisOutputSchema),
  narrative: toStrictJsonSchema(narrativeOutputSchema),
  intake: toStrictJsonSchema(intakeExtractSchema),
  ping: toStrictJsonSchema(pingSchema),
};
