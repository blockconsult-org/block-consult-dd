import { describe, expect, it } from "vitest";
import { sourcesAfterEdit } from "./score-sources";

describe("sourcesAfterEdit", () => {
  it("keeps the source of unchanged scores, credits changed ones to the analyst and drops cleared ones", () => {
    const previous = { marketLiquidity: 6, technicalSafety: 4, teamFounderQuality: 7 };
    const next = { marketLiquidity: 6, technicalSafety: 5, teamFounderQuality: null };
    const sources = { marketLiquidity: "ai", technicalSafety: "worker", teamFounderQuality: "ai" } as const;
    expect(sourcesAfterEdit(previous, next, sources)).toEqual({ marketLiquidity: "ai", technicalSafety: "analyst" });
  });

  it("treats scores saved before sources were tracked as the analyst's", () => {
    expect(sourcesAfterEdit({ marketLiquidity: 6 }, { marketLiquidity: 6 }, {})).toEqual({ marketLiquidity: "analyst" });
  });
});
