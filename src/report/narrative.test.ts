import { describe, expect, it } from "vitest";
import { remapCitations } from "./narrative";

// The draft was written when the report listed sources a, b, c as S1..S3.
// Since then b was removed and the order changed: c is now S1, a is S2.
const draftSourceIds = ["a", "b", "c"];
const currentRefs = new Map([
  ["c", "S1"],
  ["a", "S2"],
]);

describe("remapCitations", () => {
  it("renumbers refs to the report's current source numbers", () => {
    expect(remapCitations("Revenue is unaudited [S1].", draftSourceIds, currentRefs)).toBe("Revenue is unaudited [S2].");
    expect(remapCitations("Two sources agree [S1, S3].", draftSourceIds, currentRefs)).toBe("Two sources agree [S2, S1].");
  });

  it("drops refs to removed sources, evidence refs and duplicates", () => {
    expect(remapCitations("The team claims a licence [S2].", draftSourceIds, currentRefs)).toBe("The team claims a licence.");
    expect(remapCitations("Confirmed in filings [S2; S3, E4].", draftSourceIds, currentRefs)).toBe("Confirmed in filings [S1].");
    expect(remapCitations("Per the deck [E4].", draftSourceIds, currentRefs)).toBe("Per the deck.");
    expect(remapCitations("Repeated [S1, S1].", draftSourceIds, currentRefs)).toBe("Repeated [S2].");
    expect(remapCitations("Out of range [S9].", draftSourceIds, currentRefs)).toBe("Out of range.");
  });
});
