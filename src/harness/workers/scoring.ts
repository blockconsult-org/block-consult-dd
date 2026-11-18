/**
 * Scoring aggregator. Collects the per-worker suggested category scores and
 * gating flags into a single ScoreInput + GatingFlags, applying light heuristics
 * for categories no single worker owns. Output is a *suggested* scorecard that
 * the analyst can override in the UI before export.
 */
import type { GatingFlags, ScoreCategoryKey, ScoreInput } from "@/domain/scoring";
import type { WorkerResult } from "../types";

export interface AggregatedScores {
  scores: ScoreInput;
  gating: GatingFlags;
}

export function aggregateSuggestedScores(results: WorkerResult[]): AggregatedScores {
  const buckets = new Map<ScoreCategoryKey, number[]>();
  const gating: GatingFlags = {};

  for (const r of results) {
    for (const [k, v] of Object.entries(r.suggestedScores ?? {})) {
      const key = k as ScoreCategoryKey;
      if (typeof v !== "number") continue;
      const arr = buckets.get(key) ?? [];
      arr.push(v);
      buckets.set(key, arr);
    }
    Object.assign(gating, pickTrue(r.gating));
  }

  const scores: ScoreInput = {};
  for (const [k, arr] of buckets) {
    scores[k] = round1(arr.reduce((a, b) => a + b, 0) / arr.length);
  }

  // Heuristics for categories no worker scores directly.
  if (scores.partnershipCredibility == null) {
    scores.partnershipCredibility = gating.majorPartnershipUnverified ? 3 : 6;
  }
  if (scores.businessFundamentals == null) {
    scores.businessFundamentals = 4; // narrative until revenue/customers proven
  }
  if (scores.valuationAttractiveness == null) {
    scores.valuationAttractiveness = gating.marketCannotSupportExit || gating.privateOfferOverpriced ? 3 : 5;
  }
  if (scores.transparencyDisclosure == null) {
    scores.transparencyDisclosure = 4;
  }

  return { scores, gating };
}

function pickTrue(g: Partial<GatingFlags>): Partial<GatingFlags> {
  const out: Partial<GatingFlags> = {};
  for (const [k, v] of Object.entries(g)) {
    if (v) (out as Record<string, boolean>)[k] = true;
  }
  return out;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
