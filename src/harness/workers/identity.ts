import type { IdentityVerdict } from "@/domain/enums";
import { IDENTITY_VERDICT_LABELS } from "@/domain/enums";
import type { Worker } from "../types";
import { emptyResult } from "../types";
import { isPrivateOfferCase } from "../applicability";

interface IdentityRow {
  item: string;
  finding: string;
  evidence: string;
  confidence: "high" | "medium" | "low";
}

/**
 * Identity verification — determines exactly what asset/entity/offer is under
 * review and whether the public token matches the private offer. Core principle:
 * an exchange listing of a public token NEVER validates a private OTC offer.
 */
export const identityWorker: Worker = {
  name: "identity",
  run(ctx) {
    const out = emptyResult();
    const { intake, tokens, sources } = ctx.snapshot;

    const hasContract = intake.contractAddresses.some((c) => c.address);
    const officialSource = sources.find((s) => s.sourceType === "primary_official");
    const chainSource = sources.find((s) => s.sourceType === "primary_chain");
    const exchangeSource = sources.find((s) => s.sourceType === "primary_exchange");
    const privateOffer = isPrivateOfferCase(ctx.snapshot);

    const rows: IdentityRow[] = [
      { item: "Project name", finding: intake.projectName, evidence: officialSource?.name ?? "—", confidence: officialSource ? "high" : "low" },
      { item: "Token/ticker", finding: intake.tickers.join(", ") || "—", evidence: officialSource?.name ?? "—", confidence: intake.tickers.length ? "medium" : "low" },
      { item: "Contract address", finding: intake.contractAddresses.map((c) => `${c.chain}:${c.address}`).join("; ") || "—", evidence: chainSource?.name ?? officialSource?.name ?? "—", confidence: hasContract && (chainSource || officialSource) ? "high" : "low" },
      { item: "Chain", finding: intake.chains.join(", ") || "—", evidence: chainSource?.name ?? "—", confidence: intake.chains.length ? "medium" : "low" },
      { item: "Exchange-listed asset", finding: intake.claimedExchangeListings.join(", ") || "—", evidence: exchangeSource?.name ?? "—", confidence: exchangeSource ? "high" : "low" },
      { item: "Offered instrument", finding: intake.offerType ?? "unknown", evidence: privateOffer ? "intake" : "public market", confidence: intake.offerType ? "medium" : "low" },
      { item: "Seller/counterparty", finding: intake.counterparties.map((c) => c.name).filter(Boolean).join(", ") || "—", evidence: "intake", confidence: "low" },
    ];

    // Verdict heuristic — conservative by construction.
    let verdict: IdentityVerdict;
    if (!hasContract && !officialSource) {
      verdict = "unresolved";
    } else if (privateOffer) {
      // Public token may be identifiable, but the private offer is unproven.
      verdict = "partially_verified";
      out.findings.push({
        category: "identity",
        title: "Public token may be identifiable but the private offer is not validated by it",
        analysis:
          "Even where the public token's identity is confirmed, that does not validate a private/OTC offer, the seller's authority, or that the offered instrument is the same asset. These must be verified separately from primary counterparty and issuer sources.",
        severity: "high",
        confidence: "high",
        openQuestions: ["Is the offered token the same as the exchange-listed token?", "Which version will be delivered to the investor?", "Proof of seller authority from the issuer?"],
      });
    } else if (officialSource && (chainSource || exchangeSource)) {
      verdict = "verified";
    } else {
      verdict = "partially_verified";
    }

    if (verdict === "unresolved" || verdict === "partially_verified") {
      out.confidence = "low";
    }

    // Ticker confusion note.
    const confusionNote =
      intake.tickers.length > 0
        ? `Run a full ticker-confusion review for "${intake.tickers.join(", ")}": compare name, contract, chain, website, supply and decimals against similarly named assets. Aggregator pages alone do not confirm identity.`
        : "No ticker provided; ticker-confusion review cannot be scoped.";

    out.moduleOutput = {
      verdict,
      verdictLabel: IDENTITY_VERDICT_LABELS[verdict],
      rows,
      confusionNote,
      tokenCount: tokens.length,
    };
    out.openQuestions.push("Which official source confirms the contract address?");
    return out;
  },
};
