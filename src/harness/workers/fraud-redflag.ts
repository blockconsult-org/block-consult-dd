import { RED_FLAG_CATALOG } from "@/content/red-flag-catalog";
import type { Worker, RedFlagDraft } from "../types";
import { emptyResult } from "../types";
import { isPrivateOfferCase } from "../applicability";

const BIG_INSTITUTIONS = ["blackrock", "jpmorgan", "jp morgan", "fidelity", "goldman", "franklin templeton", "visa", "mastercard"];

/**
 * Fraud / Red-Flag Worker — scans intake + evidence text against the fraud
 * catalog and runs explicit structural checks (personal-wallet payment, Telegram
 * sellers, fake partnerships, unsupported institution claims, guaranteed
 * returns). Produces a fraud/impersonation score where 10 = LOWEST fraud risk.
 */
export const fraudRedFlag: Worker = {
  name: "fraud-redflag",
  run(ctx) {
    const out = emptyResult();
    const { intake, corpus, sources } = ctx.snapshot;
    const privateOffer = isPrivateOfferCase(ctx.snapshot);
    const sellerText = `${intake.sellerDetails ?? ""} ${intake.notes ?? ""} ${intake.counterparties.map((c) => `${c.contact} ${c.notes}`).join(" ")}`.toLowerCase();
    const flags: RedFlagDraft[] = [];

    // Keyword-driven catalog scan.
    for (const pattern of RED_FLAG_CATALOG) {
      const hits = pattern.keywords.filter((k) => corpus.includes(k) || sellerText.includes(k));
      if (hits.length > 0) {
        flags.push({
          code: pattern.code,
          title: pattern.title,
          severity: pattern.defaultSeverity,
          evidence: `Matched signals: ${hits.join(", ")}`,
          impact: pattern.signs.slice(0, 3).join("; "),
          mitigation: "Verify against primary sources before proceeding.",
          triggered: true,
        });
        if (pattern.gating) out.gating[pattern.gating] = true;
      }
    }

    // Explicit structural checks (independent of free-text keywords).
    if (/personal wallet|0x[a-f0-9]{6}/.test(sellerText) && privateOffer) {
      out.gating.paymentUnauthenticated = true;
      flags.push({ code: "FRAUD_FAKE_PRIVATE_OFFER", title: "Payment instructions not authenticated", severity: "critical", evidence: "Seller references a wallet/personal payment without official confirmation.", impact: "Funds may be sent to an unauthorised wallet.", mitigation: "Authenticate the wallet via the issuer's official domain before any payment.", triggered: true });
    }
    if (/\btelegram\b|\bwhatsapp\b/.test(sellerText)) {
      out.gating.sellerAuthorityUnproven = out.gating.sellerAuthorityUnproven ?? privateOffer;
      flags.push({ code: "FRAUD_FAKE_PRIVATE_OFFER", title: "Seller operates via Telegram/WhatsApp only", severity: "high", evidence: "Counterparty uses messaging apps rather than official channels.", impact: "Common impersonation vector; authority unproven.", mitigation: "Require confirmation from the issuer's official domain.", triggered: true });
    }
    if (/guarantee|guaranteed|will 4x|risk-free|last chance/.test(corpus + sellerText)) {
      flags.push({ code: "FRAUD_SALES_PRESSURE", title: "Guaranteed-return / pressure language", severity: "critical", evidence: "Marketing uses guaranteed-return or urgency language.", impact: "Strong fraud indicator, especially with an unverified offer.", mitigation: "Treat as scam pattern until independently disproven.", triggered: true });
      if (privateOffer) out.gating.guaranteedReturnsUnverified = true;
    }

    // Unsupported large-institution claims.
    const claimedInstitutions = BIG_INSTITUTIONS.filter((b) => corpus.includes(b) || intake.claimedPartnerships.some((p) => p.toLowerCase().includes(b)));
    const hasPrimaryCounterparty = sources.some((s) => s.sourceType === "primary_counterparty");
    if (claimedInstitutions.length > 0 && !hasPrimaryCounterparty) {
      out.gating.majorPartnershipUnverified = true;
      flags.push({ code: "FRAUD_MISLEADING_PARTNERSHIP", title: `Unverified institution claim: ${claimedInstitutions.join(", ")}`, severity: "high", evidence: "Major institution referenced without primary counterparty confirmation.", impact: "Logo/name-dropping inflates credibility; unconfirmed.", mitigation: "Require signed agreement or confirmation from the counterparty's official domain.", triggered: true });
    }

    // Claimed partnerships with no primary confirmation.
    if (intake.claimedPartnerships.length > 0 && !hasPrimaryCounterparty) {
      flags.push({ code: "FRAUD_MISLEADING_PARTNERSHIP", title: "Claimed partnerships unconfirmed by counterparties", severity: "medium", evidence: `${intake.claimedPartnerships.length} claimed partnership(s); no primary counterparty source on file.`, impact: "Partnerships are one-sided/claimed only until confirmed.", mitigation: "Collect counterparty confirmation for each claimed partnership.", triggered: true });
    }

    // Private offer with no seller authority evidence.
    if (privateOffer && !sources.some((s) => s.sourceType === "primary_counterparty")) {
      out.gating.sellerAuthorityUnproven = true;
      flags.push({ code: "FRAUD_FAKE_PRIVATE_OFFER", title: "Seller authority unproven for private sale", severity: "critical", evidence: "No primary counterparty/authority source for the private offer.", impact: "Cannot confirm the seller is authorised to sell the instrument.", mitigation: "Obtain a seller authority letter / board resolution and confirm via official domain.", triggered: true });
    }

    out.redFlags = flags;

    const fraudScore = scoreFraud(flags, out.gating, privateOffer);
    out.suggestedScores = { fraudImpersonationRisk: fraudScore };
    out.confidence = "medium";
    out.moduleOutput = {
      flags,
      fraudScore,
      scenario:
        flags.some((f) => f.severity === "critical")
          ? "Critical fraud/impersonation indicators present; treat the offer as suspect until primary verification clears them."
          : flags.length > 0
            ? "Some red flags present; verification required before proceeding."
            : "No automated fraud indicators detected from available data (absence of evidence is not proof of safety).",
    };
    return out;
  },
};

function scoreFraud(flags: RedFlagDraft[], gating: Record<string, unknown>, privateOffer: boolean): number {
  let score = privateOffer ? 6 : 8;
  for (const f of flags) {
    if (f.severity === "critical") score -= 3;
    else if (f.severity === "high") score -= 1.5;
    else if (f.severity === "medium") score -= 0.5;
  }
  if (gating.officialEntityDeniesOffer || gating.impostorDomainOrWallet || gating.paymentUnauthenticated) score = Math.min(score, 2);
  return Math.max(1, Math.min(10, Math.round(score)));
}
