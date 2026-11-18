import type { Worker } from "../types";
import { emptyResult } from "../types";
import { isPrivateOfferCase, isRwaCase, isStablecoinCase } from "../applicability";

interface IssueRow {
  jurisdiction: string;
  issue: string;
  question: string;
}

/**
 * Legal / Regulatory Issue-Spotting Worker — flags issues and counsel questions.
 * NEVER renders legal conclusions as advice; everything is framed as an issue to
 * be confirmed by qualified counsel.
 */
export const legalIssueSpotting: Worker = {
  name: "legal-issue-spotting",
  run(ctx) {
    const out = emptyResult();
    const { intake } = ctx.snapshot;
    const stable = isStablecoinCase(ctx.snapshot);
    const rwa = isRwaCase(ctx.snapshot);
    const privateOffer = isPrivateOfferCase(ctx.snapshot);
    const clientJur = (intake.clientJurisdiction ?? "").toLowerCase();
    const issuerJur = (intake.issuerJurisdiction ?? "").toLowerCase();

    const issues: IssueRow[] = [];
    const counselQuestions: string[] = [];

    issues.push({ jurisdiction: "General", issue: "Instrument classification (security / financial instrument vs utility)", question: "Is the token a security/financial instrument in the relevant jurisdictions?" });
    counselQuestions.push("Confirm instrument classification and any prospectus/exemption requirements.");

    if (/us|united states|usa|america/.test(clientJur + issuerJur)) {
      issues.push({ jurisdiction: "US", issue: "Securities (Howey) and private placement (Reg D/S) exposure", question: "Does the offer rely on a valid US exemption; are resale restrictions and accreditation handled?" });
    }
    if (/eu|europe|german|france|nether|ireland|malta|cyprus|lithuania/.test(clientJur + issuerJur) || stable) {
      issues.push({ jurisdiction: "EU", issue: "MiCA: ART/EMT classification, CASP authorisation, white paper obligations", question: "Is the issuer a MiCA-authorised entity; is the stablecoin an e-money or asset-referenced token?" });
    }
    if (/switz|swiss|finma|zug/.test(clientJur + issuerJur)) {
      issues.push({ jurisdiction: "Switzerland", issue: "FINMA token categorisation and financial-services licensing", question: "Has FINMA categorisation (payment/utility/asset) been obtained?" });
    }
    if (/uk|united kingdom|britain|fca|london/.test(clientJur + issuerJur)) {
      issues.push({ jurisdiction: "UK", issue: "FCA financial-promotion regime and cryptoasset rules", question: "Are marketing materials compliant with the UK financial-promotion regime?" });
    }
    if (privateOffer) {
      issues.push({ jurisdiction: "General", issue: "Private placement: seller authority, transfer restrictions, investor eligibility", question: "Is the seller authorised; are resale restrictions and investor-eligibility checks in place?" });
      counselQuestions.push("Confirm seller authority and the governing law of the sale agreement.");
    }
    if (stable) counselQuestions.push("Confirm stablecoin regulatory classification, authorisation and redemption obligations.");
    if (rwa) counselQuestions.push("Confirm RWA legal wrapper, securities treatment, custody and investor enforcement rights.");
    issues.push({ jurisdiction: "General", issue: "Custody, KYC/AML and source-of-funds responsibility", question: "Which regulated entity performs custody and KYC/AML?" });

    // Legal clarity score — higher when instrument, issuer and basis are documented.
    let score = 5;
    if (!intake.offerType) score -= 2;
    if (!intake.issuerJurisdiction) score -= 1;
    if (stable || rwa) score -= 1; // higher inherent legal complexity until documented
    if (privateOffer && intake.counterparties.length === 0) score -= 1;
    score = Math.max(1, Math.min(10, score));

    out.findings.push({
      category: "legal",
      title: "Regulatory issues identified for counsel review",
      analysis: `Issue-spotting only — not legal advice. ${issues.length} issue area(s) flagged across jurisdictions. Qualified counsel must review final transaction documents before any commitment.`,
      severity: "medium",
      confidence: "medium",
      openQuestions: counselQuestions,
    });

    out.moduleOutput = { issues, counselQuestions, disclaimer: "Issue spotting only; not legal advice. Counsel review required." };
    out.suggestedScores = { legalRegulatoryClarity: score };
    out.confidence = "medium";
    return out;
  },
};
