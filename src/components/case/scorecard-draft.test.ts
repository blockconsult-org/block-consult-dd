import { describe, expect, it } from "vitest";
import { rebaseScorecardDraft, scorecardDraft, scorecardDraftChanged } from "./scorecard-draft";

describe("scorecard draft refresh", () => {
  it("refreshes clean fields while preserving edited scores, notes, and cleared blockers", () => {
    const baseline = scorecardDraft(null);
    baseline.scores.legalRegulatoryClarity = "5";
    baseline.gating = { forgedDocuments: true };
    const draft = { ...baseline, scores: { ...baseline.scores, legalRegulatoryClarity: "8" }, gating: { forgedDocuments: false }, notes: "Review in progress" };
    const incoming = { ...baseline, scores: { ...baseline.scores, legalRegulatoryClarity: "6", marketLiquidity: "7" }, gating: { forgedDocuments: true, marketCannotSupportExit: true }, confidenceLevel: "high" };
    const rebased = rebaseScorecardDraft(draft, baseline, incoming);
    expect(rebased.scores.legalRegulatoryClarity).toBe("8");
    expect(rebased.scores.marketLiquidity).toBe("7");
    expect(rebased.gating).toEqual({ marketCannotSupportExit: true });
    expect(rebased.notes).toBe("Review in progress");
    expect(rebased.confidenceLevel).toBe("high");
    expect(scorecardDraftChanged(rebased, incoming)).toBe(true);
  });

  it("rebases every clean field after a successful save acknowledges the submitted draft", () => {
    const submitted = scorecardDraft(null);
    submitted.scores.marketLiquidity = "7.0";
    submitted.notes = "Reviewed";
    submitted.gating = { marketCannotSupportExit: false };
    const server = { ...submitted, scores: { ...submitted.scores, marketLiquidity: "7" }, gating: {} };
    const rebased = rebaseScorecardDraft(submitted, submitted, server);
    expect(rebased).toEqual(server);
    expect(scorecardDraftChanged(rebased, server)).toBe(false);
  });

  it("keeps edits made after submission dirty when refreshed values arrive", () => {
    const submitted = scorecardDraft(null);
    const current = { ...submitted, notes: "New edit after submitting" };
    const incoming = { ...submitted, confidenceLevel: "high" };
    const rebased = rebaseScorecardDraft(current, submitted, incoming);
    expect(rebased.notes).toBe(current.notes);
    expect(rebased.confidenceLevel).toBe("high");
    expect(scorecardDraftChanged(rebased, incoming)).toBe(true);
  });
});
