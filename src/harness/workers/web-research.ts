import type { SourceType } from "@/domain/enums";
import type { Worker } from "../types";
import { emptyResult } from "../types";

const PRIMARY_TYPES: SourceType[] = [
  "primary_official",
  "primary_exchange",
  "primary_chain",
  "primary_registry",
  "primary_counterparty",
];

/**
 * Web Research Worker — executes the plan's top queries via the web connector
 * (manual mode logs that no API key is set) and builds the Source Map from the
 * sources already attached to the case. Flags an over-reliance on weak sources.
 */
export const webResearch: Worker = {
  name: "web-research",
  async run(ctx) {
    const out = emptyResult();
    const { sources, intake } = ctx.snapshot;

    // Demonstrate the connector abstraction; in manual mode this returns ok:false.
    const probe = await ctx.connectors.web.search(`${intake.projectName} ${intake.tickers[0] ?? ""} official`);
    ctx.log(`web connector=${probe.provider} ok=${probe.ok}${probe.note ? ` (${probe.note})` : ""} hits=${probe.hits.length}`);

    const byType = new Map<string, number>();
    let primary = 0;
    let secondary = 0;
    let market = 0;
    let community = 0;
    for (const s of sources) {
      byType.set(s.sourceType, (byType.get(s.sourceType) ?? 0) + 1);
      if (PRIMARY_TYPES.includes(s.sourceType as SourceType)) primary += 1;
      else if (s.sourceType === "secondary_high" || s.sourceType === "secondary_contributor") secondary += 1;
      else if (s.sourceType === "market_aggregator") market += 1;
      else if (s.sourceType === "community" || s.sourceType === "pitch_claim") community += 1;
    }

    const total = sources.length;
    ctx.log(`source map: total=${total} primary=${primary} secondary=${secondary} market=${market} community=${community}`);

    if (total === 0) {
      out.status = "partial";
      out.confidence = "low";
      out.findings.push({
        category: "identity",
        title: "No sources collected yet",
        analysis: "No evidence sources are attached to this case. All conclusions are unsupported until primary sources are added.",
        severity: "high",
        confidence: "high",
        openQuestions: ["Collect official website, docs, explorer and exchange-native sources."],
      });
    } else if (primary === 0) {
      out.confidence = "low";
      out.findings.push({
        category: "identity",
        title: "No primary sources — evidence base is weak",
        analysis: `The case relies on ${secondary} secondary, ${market} market and ${community} community sources with no primary/official, exchange, chain or registry sources. Conclusions must be treated as low-confidence.`,
        severity: "medium",
        confidence: "high",
      });
    }

    out.moduleOutput = {
      connector: { provider: probe.provider, ok: probe.ok, note: probe.note },
      sourceMap: { total, primary, secondary, market, community, byType: Object.fromEntries(byType) },
    };
    return out;
  },
};
