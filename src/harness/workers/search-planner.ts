import type { Worker } from "../types";
import { emptyResult } from "../types";
import { isRwaCase, isStablecoinCase } from "../applicability";

interface ResearchTask {
  question: string;
  sourcePriority: "primary" | "secondary" | "market" | "community";
  expectedEvidence: string[];
}

/**
 * Search Planner — converts intake into a structured research plan. Queries are
 * targeted at primary sources first (official site, docs, explorer, registry).
 */
export const searchPlanner: Worker = {
  name: "search-planner",
  run(ctx) {
    const out = emptyResult();
    const { intake } = ctx.snapshot;
    const project = intake.projectName;
    const ticker = intake.tickers[0] ?? "";

    const tasks: ResearchTask[] = [
      { question: `Identify official website and docs for ${project}`, sourcePriority: "primary", expectedEvidence: ["official_website", "docs"] },
      { question: `Confirm official contract address for ${ticker || project} from an official source`, sourcePriority: "primary", expectedEvidence: ["official token page", "block explorer"] },
      { question: `Ticker-confusion search for "${ticker}" across assets, chains and exchanges`, sourcePriority: "primary", expectedEvidence: ["aggregator", "explorer", "scam reports"] },
      { question: `Verify claimed exchange listings from exchange-native pages/API`, sourcePriority: "primary", expectedEvidence: ["exchange listing", "exchange API"] },
      { question: `Identify legal issuer entity and jurisdiction for ${project}`, sourcePriority: "primary", expectedEvidence: ["company registry", "terms/legal pages"] },
      { question: `Collect tokenomics, allocation and unlock schedule`, sourcePriority: "primary", expectedEvidence: ["tokenomics doc", "whitepaper"] },
      { question: `Market data: price, market cap, FDV, 24h volume by venue`, sourcePriority: "market", expectedEvidence: ["CoinGecko", "CoinMarketCap", "DexScreener"] },
      { question: `Founder/team background and prior projects`, sourcePriority: "secondary", expectedEvidence: ["LinkedIn", "GitHub", "media"] },
    ];

    for (const partner of intake.claimedPartnerships) {
      tasks.push({ question: `Verify claimed partnership with ${partner} against primary counterparty sources`, sourcePriority: "primary", expectedEvidence: ["counterparty confirmation", "signed agreement"] });
    }
    if (isStablecoinCase(ctx.snapshot)) {
      tasks.push({ question: `Stablecoin issuer, reserves, redemption terms and attestations`, sourcePriority: "primary", expectedEvidence: ["reserve attestation", "terms of service", "legal opinion"] });
    }
    if (isRwaCase(ctx.snapshot)) {
      tasks.push({ question: `RWA legal wrapper, SPV, custody, title and investor rights`, sourcePriority: "primary", expectedEvidence: ["SPV docs", "title memo", "trustee agreement"] });
    }

    ctx.log(`planned ${tasks.length} research tasks`);
    out.confidence = "high";
    out.moduleOutput = { tasks };
    return out;
  },
};
