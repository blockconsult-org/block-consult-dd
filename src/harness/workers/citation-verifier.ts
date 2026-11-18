import type { Worker } from "../types";
import { emptyResult } from "../types";

const WEAK_TYPES = new Set(["community", "pitch_claim", "unknown"]);

/**
 * Citation Verifier — checks the evidence base supports the report: material
 * claims should cite a source, sources should not be exclusively weak/community,
 * and corroboration is tracked. Surfaces coverage stats consumed by QA.
 */
export const citationVerifier: Worker = {
  name: "citation-verifier",
  run(ctx) {
    const out = emptyResult();
    const { sources, evidence } = ctx.snapshot;

    const total = sources.length;
    const weak = sources.filter((s) => WEAK_TYPES.has(s.sourceType)).length;
    const allWeak = total > 0 && weak === total;

    const claimsTotal = evidence.length;
    const claimsUncited = evidence.filter((c) => !c.sourceId && !c.sourceUrl).length;
    const claimsCorroborated = evidence.filter((c) => c.corroborated).length;

    if (allWeak) {
      out.findings.push({
        category: "other",
        title: "Evidence base is entirely weak/community sources",
        analysis: "Every source is community/pitch/unknown. The report cannot rest on this; obtain primary/official, exchange, chain or registry sources.",
        severity: "high",
        confidence: "high",
      });
    }
    if (claimsUncited > 0) {
      out.findings.push({
        category: "other",
        title: `${claimsUncited} evidence claim(s) without a linked source`,
        analysis: "Some recorded claims have no source link. Every material claim must cite a source before release.",
        severity: "medium",
        confidence: "high",
      });
    }

    out.moduleOutput = {
      sourcesTotal: total,
      sourcesWeak: weak,
      allWeak,
      claimsTotal,
      claimsUncited,
      claimsCorroborated,
      coveragePct: claimsTotal > 0 ? Math.round(((claimsTotal - claimsUncited) / claimsTotal) * 100) : null,
    };
    out.confidence = "high";
    return out;
  },
};
