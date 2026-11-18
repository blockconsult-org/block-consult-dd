/** Maps the validated Intake DTO to/from the JSON-string Prisma columns. */
import { toJson } from "./json";

/** Structurally permissive intake shape (accepts both Zod input and output). */
export interface IntakeLoose {
  projectName?: string;
  tickers?: string[];
  links?: string[];
  contractAddresses?: { chain?: string; address?: string }[];
  chains?: string[];
  claimedPartnerships?: string[];
  claimedExchangeListings?: string[];
  walletAddresses?: string[];
  counterparties?: { name?: string; claimedRole?: string; contact?: string; notes?: string }[];
  documents?: { name?: string; kind?: string; received?: boolean; notes?: string }[];
  questionsToVerify?: string[];
  offerType?: string | null;
  offerPrice?: string;
  investmentAmount?: string;
  lockupVesting?: string;
  sellerDetails?: string;
  clientJurisdiction?: string;
  issuerJurisdiction?: string;
  notes?: string;
}

export function intakeToPrisma(dto: IntakeLoose, projectName: string) {
  return {
    projectName: dto.projectName ?? projectName,
    tickers: toJson(dto.tickers ?? []),
    links: toJson(dto.links ?? []),
    contractAddresses: toJson((dto.contractAddresses ?? []).map((c) => ({ chain: c.chain ?? "", address: c.address ?? "" }))),
    chains: toJson(dto.chains ?? []),
    claimedPartnerships: toJson(dto.claimedPartnerships ?? []),
    claimedExchangeListings: toJson(dto.claimedExchangeListings ?? []),
    walletAddresses: toJson(dto.walletAddresses ?? []),
    counterparties: toJson(dto.counterparties ?? []),
    documents: toJson(dto.documents ?? []),
    questionsToVerify: toJson(dto.questionsToVerify ?? []),
    offerType: dto.offerType ?? null,
    offerPrice: dto.offerPrice ?? null,
    investmentAmount: dto.investmentAmount ?? null,
    lockupVesting: dto.lockupVesting ?? null,
    sellerDetails: dto.sellerDetails ?? null,
    clientJurisdiction: dto.clientJurisdiction ?? null,
    issuerJurisdiction: dto.issuerJurisdiction ?? null,
    notes: dto.notes ?? null,
  };
}
