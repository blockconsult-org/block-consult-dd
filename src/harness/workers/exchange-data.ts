import { fmtUsd } from "@/lib/utils";
import type { Worker } from "../types";
import { emptyResult } from "../types";

const SLIPPAGE_SIZES = [10_000, 50_000, 100_000, 500_000, 1_000_000];

/**
 * Exchange Data + Market/Liquidity Worker — aggregates venue data, estimates
 * exit capacity and slippage, and flags liquidity illusions. Uses the market
 * connector where configured, otherwise the manually-entered ExchangeMarket rows.
 */
export const exchangeData: Worker = {
  name: "exchange-data",
  async run(ctx) {
    const out = emptyResult();
    const { intake, markets, liquiditySnaps, tokens } = ctx.snapshot;

    const symbol = intake.tickers[0] ?? "";
    let connectorNote = "manual";
    let livePrice: number | undefined;
    let liveVolume: number | undefined;
    let liveVenues: { exchange: string; pair: string; volume24h?: number }[] = [];
    if (symbol) {
      const md = await ctx.connectors.market.lookup(symbol);
      connectorNote = `${md.provider} ok=${md.ok}`;
      ctx.log(`market connector=${md.provider} ok=${md.ok}${md.note ? ` (${md.note})` : ""}`);
      if (md.ok) {
        livePrice = md.price;
        liveVolume = md.volume24h;
        liveVenues = md.venues ?? [];
      }
    }

    const token = tokens[0];
    const aggVolume = markets.reduce((sum, m) => sum + (m.volume24h ?? 0), 0);
    const volume24h = liveVolume ?? (aggVolume > 0 ? aggVolume : undefined);
    const venueCount = Math.max(markets.length, liveVenues.length);
    const totalDexLiq = liquiditySnaps.reduce((s, l) => s + (l.dexLiquidityUsd ?? 0), 0);

    // Exit-capacity assessment vs 30d volume proxy (use 24h * 30 if no 30d figure).
    const vol30d = volume24h ? volume24h * 30 : undefined;
    const investment = parseUsd(intake.investmentAmount);
    let exitAssessment = "Insufficient data to assess exit capacity.";
    let cannotExit = false;
    if (vol30d && investment) {
      const ratio = investment / vol30d;
      if (ratio > 1.0) {
        exitAssessment = `Intended size ${fmtUsd(investment)} exceeds estimated 30d volume — exit likely impossible without major price impact.`;
        cannotExit = true;
      } else if (ratio > 0.2) {
        exitAssessment = `Intended size is ${(ratio * 100).toFixed(0)}% of estimated 30d volume — HIGH exit risk.`;
        cannotExit = true;
      } else if (ratio > 0.05) {
        exitAssessment = `Intended size is ${(ratio * 100).toFixed(0)}% of estimated 30d volume — moderate exit risk.`;
      } else {
        exitAssessment = `Intended size is ${(ratio * 100).toFixed(1)}% of estimated 30d volume — low exit risk on volume alone.`;
      }
    }

    // Heuristic slippage table (AMM-style) using DEX liquidity if present.
    const slippage = SLIPPAGE_SIZES.map((size) => {
      let estimate: number | null = null;
      if (totalDexLiq > 0) {
        // crude constant-product impact proxy
        estimate = round2(Math.min(99, (size / (totalDexLiq + size)) * 100 * 2));
      }
      return { size, buy: estimate, sell: estimate, method: totalDexLiq > 0 ? "amm_formula" : "heuristic" };
    });

    if (venueCount === 0 && !volume24h) {
      out.status = "partial";
      out.confidence = "low";
      out.findings.push({
        category: "market",
        title: "No market/liquidity data available",
        analysis: "No venues, volume or liquidity data have been collected. Liquidity and exit capacity cannot be assessed.",
        severity: "medium",
        confidence: "high",
        openQuestions: ["Which venues have real active trading?", "What is the true 24h volume by venue?"],
      });
    }

    if (cannotExit) {
      out.gating.marketCannotSupportExit = true;
      out.redFlags.push({
        code: "FRAUD_LIQUIDITY_ILLUSION",
        title: "Market cannot support intended exit size",
        severity: "high",
        evidence: exitAssessment,
        impact: "Position cannot be exited at size without severe slippage; recommendation gated to Wait/monitor or worse.",
        mitigation: "Obtain OTC/market-maker exit commitments or reduce position size.",
        triggered: true,
      });
    }

    // Single-venue dependence.
    if (venueCount === 1) {
      out.findings.push({
        category: "market",
        title: "Single-venue dependence",
        analysis: "Liquidity depends on a single venue; deposit/withdrawal suspension or delisting would strand the position.",
        severity: "medium",
        confidence: "medium",
      });
    }

    out.moduleOutput = {
      connector: connectorNote,
      price: livePrice ?? token?.price ?? null,
      volume24h: volume24h ?? null,
      venueCount,
      venues: markets.map((m) => ({
        venue: m.exchange,
        pair: m.pair ?? `${m.base ?? ""}/${m.quote ?? ""}`,
        marketType: m.marketType,
        volume24h: m.volume24h,
        spreadBps: m.spreadBps,
        depth: m.depthPlus2PctUsd,
        deposit: m.depositStatus,
        withdrawal: m.withdrawalStatus,
      })),
      liveVenues,
      dexLiquidityUsd: totalDexLiq || null,
      slippage,
      exitAssessment,
    };
    out.suggestedScores = { marketLiquidity: scoreLiquidity(venueCount, volume24h, totalDexLiq, cannotExit) };
    return out;
  },
};

function scoreLiquidity(venues: number, vol?: number, dex?: number, cannotExit?: boolean): number {
  let score = 5;
  if (cannotExit) score -= 3;
  if (venues >= 3) score += 1;
  if ((vol ?? 0) > 1_000_000) score += 1;
  if ((dex ?? 0) > 500_000) score += 1;
  if (venues <= 1) score -= 1;
  if (!vol) score -= 1;
  return Math.max(1, Math.min(10, score));
}

function parseUsd(s?: string): number | undefined {
  if (!s) return undefined;
  const n = Number(s.replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
