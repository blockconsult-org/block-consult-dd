import { describe, it, expect } from "vitest";
import {
  computeScorecard,
  recommendationFromScore,
  worseRecommendation,
  SCORE_CATEGORIES,
  type ScoreInput,
} from "./scoring";

/** Build a ScoreInput with the same value for every weighted category. */
function uniform(value: number): ScoreInput {
  const out: ScoreInput = {};
  for (const cat of SCORE_CATEGORIES) out[cat.key] = value;
  return out;
}

describe("recommendationFromScore", () => {
  it("maps score bands to recommendations", () => {
    expect(recommendationFromScore(9)).toBe("invest");
    expect(recommendationFromScore(8)).toBe("invest");
    expect(recommendationFromScore(7)).toBe("strict_conditions");
    expect(recommendationFromScore(5.5)).toBe("wait_monitor");
    expect(recommendationFromScore(3.5)).toBe("reject");
    expect(recommendationFromScore(1)).toBe("reject_likely_scam");
  });
});

describe("worseRecommendation", () => {
  it("returns the more cautious of two recommendations", () => {
    expect(worseRecommendation("invest", "reject")).toBe("reject");
    expect(worseRecommendation("reject", "wait_monitor")).toBe("reject");
    expect(worseRecommendation("strict_conditions", "invest")).toBe("strict_conditions");
  });
});

describe("computeScorecard", () => {
  it("weights sum to 1.00 across the nine weighted categories", () => {
    const total = SCORE_CATEGORIES.filter((c) => !c.informational).reduce((s, c) => s + c.weight, 0);
    expect(total).toBeCloseTo(1, 5);
  });

  it("computes a weighted overall and the matching band recommendation", () => {
    const r = computeScorecard(uniform(8));
    expect(r.overallScore).toBeCloseTo(8, 5);
    expect(r.recommendation).toBe("invest");
    expect(r.gatingApplied).toHaveLength(0);
  });

  it("excludes the informational transparency category from the overall", () => {
    const scores = uniform(8);
    scores.transparencyDisclosure = 1; // weight 0 — must not drag the average down
    expect(computeScorecard(scores).overallScore).toBeCloseTo(8, 5);
  });

  it("normalises by the weight of scored categories only", () => {
    // Only one category scored — overall should equal that score, not be deflated.
    const r = computeScorecard({ legalRegulatoryClarity: 10 });
    expect(r.overallScore).toBeCloseTo(10, 5);
  });

  it("clamps out-of-range inputs to 1..10", () => {
    expect(computeScorecard(uniform(12)).overallScore).toBeCloseTo(10, 5);
    expect(computeScorecard(uniform(-3)).overallScore).toBeCloseTo(1, 5);
  });

  it("returns null overall when nothing is scored", () => {
    const r = computeScorecard({});
    expect(r.overallScore).toBeNull();
    expect(r.recommendation).toBe("wait_monitor");
  });

  it("gating can only downgrade, never upgrade", () => {
    const strong = uniform(9); // band = invest
    const r = computeScorecard(strong, { impostorDomainOrWallet: true });
    expect(r.recommendation).toBe("reject_likely_scam");
    expect(r.gatingApplied).toContain("Impostor domain/wallet confirmed");
  });

  it("takes the worst of multiple triggered ceilings", () => {
    const r = computeScorecard(uniform(9), {
      tokenomicsUnlocksMissing: true, // -> wait_monitor
      sellerAuthorityUnproven: true, // -> reject
    });
    expect(r.recommendation).toBe("reject");
    expect(r.gatingApplied).toHaveLength(2);
  });

  it("never upgrades a weak score via a lenient ceiling", () => {
    // Weak band (reject_likely_scam) with a wait_monitor ceiling stays at the worse band.
    const r = computeScorecard(uniform(2), { tokenomicsUnlocksMissing: true });
    expect(r.recommendation).toBe("reject_likely_scam");
  });
});
