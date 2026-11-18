import { parseStringArray } from "@/domain/json";
import type { Worker } from "../types";
import { emptyResult } from "../types";
import { isRwaCase, isStablecoinCase } from "../applicability";

/**
 * Stablecoin / RWA / Tokenisation Worker — only runs when applicable. Builds the
 * issuer/reserve/redemption table and the RWA legal-rights table, and refuses to
 * assume structure without documents (gates when reserve/ownership is unclear).
 */
export const stablecoinRwaWorker: Worker = {
  name: "stablecoin-rwa",
  applies: (s) => isStablecoinCase(s) || isRwaCase(s),
  run(ctx) {
    const out = emptyResult();
    const { stablecoins, rwaAssets } = ctx.snapshot;
    const isStable = isStablecoinCase(ctx.snapshot);
    const isRwa = isRwaCase(ctx.snapshot);

    let stablecoinTable: Record<string, unknown> | null = null;
    if (isStable) {
      const sc = stablecoins[0];
      const attestations = sc ? parseStringArray(sc.attestations) : [];
      const reserves = sc ? parseStringArray(sc.reserveAssets) : [];
      const unclear = !sc || attestations.length === 0 || !sc.redemptionTerms || reserves.length === 0;
      if (unclear) {
        out.gating.stablecoinReserveUnclear = true;
        out.redFlags.push({
          code: "FRAUD_STABLECOIN_RESERVE",
          title: "Stablecoin reserve / redemption unclear",
          severity: "high",
          evidence: "Issuer, reserve composition, attestations or redemption terms are not documented.",
          impact: "Backing and 1:1 redemption cannot be confirmed; central to a stablecoin thesis. Gated to Wait/monitor.",
          mitigation: "Obtain issuer legal entity docs, reserve attestation/audit, and redemption policy.",
          triggered: true,
        });
      }
      stablecoinTable = {
        name: sc?.name ?? "—",
        issuer: sc?.issuerEntityId ?? "—",
        jurisdiction: sc?.jurisdiction ?? "—",
        classification: sc?.classification ?? "unknown",
        reserves,
        custodians: sc ? parseStringArray(sc.reserveCustodians) : [],
        redemptionParty: sc?.redemptionParty ?? "—",
        redemptionTerms: sc?.redemptionTerms ?? "—",
        attestations,
        canPauseRedemptions: sc?.canPauseRedemptions ?? null,
        freezeBlacklist: sc?.blacklistFreeze ?? null,
      };
    }

    let rwaTable: Record<string, unknown> | null = null;
    if (isRwa) {
      const asset = rwaAssets[0];
      const rights = asset ? parseStringArray(asset.investorRights) : [];
      const unclear = !asset || !asset.legalOwnerAfter || !asset.spvEntityId || rights.length === 0;
      if (unclear) {
        out.gating.rwaOwnershipUnclear = true;
        out.redFlags.push({
          code: "FRAUD_RWA_OWNERSHIP",
          title: "RWA ownership / legal wrapper unclear",
          severity: "high",
          evidence: "Title transfer, SPV control, custody, investor rights or default waterfall are not documented.",
          impact: "Whether token holders have any enforceable claim on the asset cannot be confirmed. Gated to Wait/monitor.",
          mitigation: "Obtain title memo, SPV docs, custody/trustee agreement and investor-rights/default waterfall.",
          triggered: true,
        });
      }
      rwaTable = {
        assetDescription: asset?.assetDescription ?? "—",
        assetType: asset?.assetType ?? "other",
        ownerBefore: asset?.legalOwnerBefore ?? "—",
        ownerAfter: asset?.legalOwnerAfter ?? "—",
        spv: asset?.spvEntityId ?? "—",
        custodian: asset?.custodianEntityId ?? "—",
        investorRights: rights,
        redemptionRights: asset?.redemptionRights ?? "—",
        cashflowRights: asset?.cashflowRights ?? "—",
        valuation: asset?.valuationMethod ?? "—",
      };
    }

    out.moduleOutput = {
      applicability: { stablecoin: isStable, rwa: isRwa },
      stablecoin: stablecoinTable,
      rwa: rwaTable,
      questions: [
        "Who is legally obligated to redeem, and can holders redeem 1:1 for fiat?",
        "What backs the instrument and where are reserves/assets held and segregated?",
        "What rights do token holders have in default and insolvency?",
      ],
    };
    out.confidence = "low";
    return out;
  },
};
