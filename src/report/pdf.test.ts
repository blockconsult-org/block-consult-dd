import { describe, expect, it } from "vitest";
import { cssLengthToInches } from "./pdf";

describe("cssLengthToInches", () => {
  it("converts branding margins to the inches Electron's printToPDF expects", () => {
    expect(cssLengthToInches("25.4mm")).toBeCloseTo(1);
    expect(cssLengthToInches("2.54cm")).toBeCloseTo(1);
    expect(cssLengthToInches("72pt")).toBeCloseTo(1);
    expect(cssLengthToInches("96px")).toBeCloseTo(1);
    expect(cssLengthToInches(" 0.5in ")).toBeCloseTo(0.5);
  });

  it("falls back to 1 cm for values it cannot read", () => {
    expect(cssLengthToInches("auto")).toBeCloseTo(1 / 2.54);
    expect(cssLengthToInches("")).toBeCloseTo(1 / 2.54);
  });
});
