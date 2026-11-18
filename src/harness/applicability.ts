/** Shared predicates for which modules apply to a given case. */
import type { CaseSnapshot } from "./types";

export function isStablecoinCase(s: CaseSnapshot): boolean {
  if (s.stablecoins.length > 0) return true;
  if (s.intake.offerType === "stablecoin") return true;
  if (s.caseRow.reportType === "stablecoin_rwa") return true;
  return /stablecoin|e-money|asset-referenced|peg(ged)?\b|reserve attestation/.test(s.corpus);
}

export function isRwaCase(s: CaseSnapshot): boolean {
  if (s.rwaAssets.length > 0) return true;
  if (s.intake.offerType === "rwa") return true;
  if (s.caseRow.reportType === "stablecoin_rwa") return true;
  return /real[- ]world asset|tokeni[sz]ation|\bspv\b|real estate|receivable|title deed|rental income/.test(s.corpus);
}

export function isPrivateOfferCase(s: CaseSnapshot): boolean {
  if (s.caseRow.reportType === "private_offer_verification") return true;
  if (s.intake.counterparties.length > 0) return true;
  return ["otc", "private_allocation", "saft", "note", "equity", "fund"].includes(s.intake.offerType ?? "");
}

export function corpusHas(s: CaseSnapshot, keywords: string[]): string[] {
  return keywords.filter((k) => s.corpus.includes(k.toLowerCase()));
}
