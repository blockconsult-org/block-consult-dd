/**
 * Zod schemas validated at every API boundary (workspace rule: parse, don't
 * assume shapes). Mirrors the Prisma models / data-models.md.
 */
import { z } from "zod";
import { GATING_RULES } from "./scoring";
import {
  ALLOCATION_CATEGORY,
  CASE_STATUS,
  CLAIM_CLASS,
  CONFIDENCE,
  ENTITY_TYPE,
  FINDING_CATEGORY,
  INTAKE_OFFER_TYPE,
  RED_FLAG_SEVERITY,
  RELIABILITY_RATING,
  REPORT_TYPE,
  SEVERITY,
  SOURCE_TYPE,
} from "./enums";

const nonEmpty = z.string().trim().min(1);
const optStr = z.string().trim().optional().or(z.literal("")).transform((v) => (v ? v : undefined));
const strArray = z.array(z.string().trim().min(1)).default([]);

export const contractRefSchema = z.object({
  chain: z.string().trim().default(""),
  address: z.string().trim().default(""),
});

export const counterpartySchema = z.object({
  name: z.string().trim().default(""),
  claimedRole: z.string().trim().default("unknown"),
  contact: z.string().trim().default(""),
  notes: z.string().trim().default(""),
});

export const documentRefSchema = z.object({
  name: z.string().trim().default(""),
  kind: z.string().trim().default(""),
  received: z.boolean().default(false),
  notes: z.string().trim().default(""),
});

export const intakeSchema = z.object({
  projectName: nonEmpty,
  tickers: strArray,
  links: strArray,
  contractAddresses: z.array(contractRefSchema).default([]),
  chains: strArray,
  claimedPartnerships: strArray,
  claimedExchangeListings: strArray,
  walletAddresses: strArray,
  counterparties: z.array(counterpartySchema).default([]),
  documents: z.array(documentRefSchema).default([]),
  questionsToVerify: strArray,
  offerType: z.enum(INTAKE_OFFER_TYPE).optional(),
  offerPrice: optStr,
  investmentAmount: optStr,
  lockupVesting: optStr,
  sellerDetails: optStr,
  clientJurisdiction: optStr,
  issuerJurisdiction: optStr,
  notes: optStr,
});
export type IntakeInputDTO = z.infer<typeof intakeSchema>;

export const caseCreateSchema = z.object({
  projectName: nonEmpty,
  clientName: optStr,
  analyst: optStr,
  reportType: z.enum(REPORT_TYPE).default("full_institutional"),
  brand: z.string().trim().default("Block Consult GmbH"),
  intake: intakeSchema.partial().optional(),
});
export type CaseCreateDTO = z.infer<typeof caseCreateSchema>;

export const caseUpdateSchema = z.object({
  projectName: nonEmpty.optional(),
  clientName: optStr,
  analyst: optStr,
  status: z.enum(CASE_STATUS).optional(),
  reportType: z.enum(REPORT_TYPE).optional(),
  brand: z.string().trim().optional(),
});

export const sourceSchema = z.object({
  name: nonEmpty,
  title: optStr,
  sourceType: z.enum(SOURCE_TYPE).default("unknown"),
  url: optStr,
  finalUrl: optStr,
  retrievedAt: z.coerce.date().optional(),
  retrievedBy: optStr,
  httpStatus: z.coerce.number().int().optional(),
  content: optStr,
  reliabilityRating: z.enum(RELIABILITY_RATING).default("unknown"),
  notes: optStr,
});
export type SourceDTO = z.infer<typeof sourceSchema>;

export const evidenceClaimSchema = z.object({
  claimText: nonEmpty,
  sourceId: optStr,
  sourceUrl: optStr,
  sourceTitle: optStr,
  sourceType: z.enum(SOURCE_TYPE).default("unknown"),
  claimClass: z.enum(CLAIM_CLASS).default("secondary"),
  reliabilityRating: z.enum(RELIABILITY_RATING).default("unknown"),
  confidence: z.enum(CONFIDENCE).default("medium"),
  corroborated: z.boolean().default(false),
  corroboratingIds: strArray,
  notes: optStr,
});
export type EvidenceClaimDTO = z.infer<typeof evidenceClaimSchema>;

export const findingSchema = z.object({
  category: z.enum(FINDING_CATEGORY).default("other"),
  title: nonEmpty,
  claim: optStr,
  evidenceIds: strArray,
  analysis: optStr,
  severity: z.enum(SEVERITY).default("informational"),
  confidence: z.enum(CONFIDENCE).default("medium"),
  impact: optStr,
  mitigation: optStr,
  openQuestions: strArray,
});
export type FindingDTO = z.infer<typeof findingSchema>;

export const redFlagSchema = z.object({
  code: optStr,
  title: nonEmpty,
  severity: z.enum(RED_FLAG_SEVERITY).default("high"),
  evidence: optStr,
  impact: optStr,
  mitigation: optStr,
  evidenceIds: strArray,
  triggered: z.boolean().default(true),
});
export type RedFlagDTO = z.infer<typeof redFlagSchema>;

const scoreField = z.coerce.number().min(1).max(10).nullable().optional();

export const scorecardSchema = z.object({
  legalRegulatoryClarity: scoreField,
  fraudImpersonationRisk: scoreField,
  tokenValueCapture: scoreField,
  marketLiquidity: scoreField,
  teamFounderQuality: scoreField,
  businessFundamentals: scoreField,
  valuationAttractiveness: scoreField,
  technicalSafety: scoreField,
  partnershipCredibility: scoreField,
  transparencyDisclosure: scoreField,
  confidenceLevel: z.enum(CONFIDENCE).default("medium"),
  rationale: z.record(z.string(), z.string()).default({}),
  notes: optStr,
  // Omission keeps saved choices; {} clears manual choices, not research blockers.
  gating: z.record(z.string(), z.boolean()).refine(
    (flags) => Object.keys(flags).every((key) => GATING_RULES.some((rule) => rule.flag === key)),
    { message: "Unknown blocker choice" },
  ).optional(),
});
export type ScorecardDTO = z.infer<typeof scorecardSchema>;

export const allocationSchema = z.object({
  category: z.enum(ALLOCATION_CATEGORY).default("unknown"),
  amountTokens: z.coerce.number().optional(),
  percentageTotal: z.coerce.number().optional(),
  vestingTerms: optStr,
  confidence: z.enum(CONFIDENCE).default("low"),
});

export const entitySchema = z.object({
  name: nonEmpty,
  entityType: z.enum(ENTITY_TYPE).default("unknown"),
  role: optStr,
  jurisdiction: optStr,
  registrationNumber: optStr,
  website: optStr,
  confidence: z.enum(CONFIDENCE).default("low"),
  notes: optStr,
});

export const reportGenerateSchema = z.object({
  reportType: z.enum(REPORT_TYPE).optional(),
  regenerate: z.boolean().default(false),
});
