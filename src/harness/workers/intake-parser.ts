import type { Worker } from "../types";
import { emptyResult } from "../types";
import { isPrivateOfferCase, isRwaCase, isStablecoinCase } from "../applicability";

/**
 * Intake Parser — normalises intake, determines which modules apply, and flags
 * missing core inputs. Sets early gating where the legal instrument is unknown.
 */
export const intakeParser: Worker = {
  name: "intake-parser",
  run(ctx) {
    const out = emptyResult();
    const { intake } = ctx.snapshot;

    const missing: string[] = [];
    if (intake.tickers.length === 0) missing.push("token ticker");
    if (intake.links.length === 0) missing.push("official website/links");
    if (intake.contractAddresses.length === 0) missing.push("contract address(es)");
    if (intake.chains.length === 0) missing.push("chain(s)");
    if (!intake.offerType) missing.push("offer type");
    if (!intake.clientJurisdiction) missing.push("client jurisdiction");

    const stablecoin = isStablecoinCase(ctx.snapshot);
    const rwa = isRwaCase(ctx.snapshot);
    const privateOffer = isPrivateOfferCase(ctx.snapshot);

    ctx.log(`offerType=${intake.offerType ?? "unknown"} stablecoin=${stablecoin} rwa=${rwa} privateOffer=${privateOffer}`);

    if (!intake.offerType) {
      out.gating.legalInstrumentUnknown = true;
      out.findings.push({
        category: "legal",
        title: "Offer type / legal instrument not specified",
        analysis:
          "The intake does not state what instrument is being offered (public token, OTC, private allocation, SAFT, equity, note, fund, RWA, or stablecoin). Until the legal instrument is identified the recommendation is gated to Wait / monitor.",
        severity: "high",
        confidence: "high",
        openQuestions: ["What exactly is being offered?", "Who is the legal issuer and seller?"],
      });
    }

    if (missing.length > 0) {
      out.findings.push({
        category: "identity",
        title: `Incomplete intake: ${missing.length} core field(s) missing`,
        analysis: `Missing intake fields treated as research gaps: ${missing.join(", ")}.`,
        severity: missing.length >= 3 ? "medium" : "low",
        confidence: "high",
        openQuestions: missing.map((m) => `Provide ${m}.`),
      });
    }

    out.confidence = missing.length === 0 ? "high" : "medium";
    out.moduleOutput = {
      offerType: intake.offerType ?? "unknown",
      applies: { stablecoin, rwa, privateOffer },
      missingCoreFields: missing,
      tickers: intake.tickers,
      chains: intake.chains,
      contractRefs: intake.contractAddresses,
      counterparties: intake.counterparties,
    };
    return out;
  },
};
