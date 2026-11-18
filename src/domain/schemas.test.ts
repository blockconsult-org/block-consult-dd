import { describe, it, expect } from "vitest";
import { intakeSchema, scorecardSchema, sourceSchema, findingSchema, caseCreateSchema } from "./schemas";

describe("intakeSchema", () => {
  it("requires a project name and defaults all list fields to empty arrays", () => {
    const r = intakeSchema.parse({ projectName: "Meridian RWA Token" });
    expect(r.projectName).toBe("Meridian RWA Token");
    expect(r.tickers).toEqual([]);
    expect(r.links).toEqual([]);
    expect(r.contractAddresses).toEqual([]);
    expect(r.offerType).toBeUndefined();
  });

  it("rejects a blank project name", () => {
    expect(intakeSchema.safeParse({ projectName: "" }).success).toBe(false);
  });

  it("normalises contract refs and coerces empty optional strings to undefined", () => {
    const r = intakeSchema.parse({
      projectName: "X",
      contractAddresses: [{ chain: "ethereum", address: "0xabc" }],
      offerPrice: "",
    });
    expect(r.contractAddresses[0]).toEqual({ chain: "ethereum", address: "0xabc" });
    expect(r.offerPrice).toBeUndefined();
  });
});

describe("caseCreateSchema", () => {
  it("defaults report type and brand", () => {
    const r = caseCreateSchema.parse({ projectName: "X" });
    expect(r.reportType).toBe("full_institutional");
    expect(r.brand).toBe("Block Consult GmbH");
  });
});

describe("scorecardSchema", () => {
  it("coerces numeric strings and keeps nulls", () => {
    const r = scorecardSchema.parse({ legalRegulatoryClarity: "7", marketLiquidity: null });
    expect(r.legalRegulatoryClarity).toBe(7);
    expect(r.marketLiquidity).toBeNull();
    expect(r.confidenceLevel).toBe("medium");
    expect(r.gating).toBeUndefined();
  });

  it("rejects scores outside 1..10", () => {
    expect(scorecardSchema.safeParse({ fraudImpersonationRisk: 11 }).success).toBe(false);
    expect(scorecardSchema.safeParse({ fraudImpersonationRisk: 0 }).success).toBe(false);
  });

  it("distinguishes omitted blocker choices from an explicit clear", () => {
    expect(scorecardSchema.parse({}).gating).toBeUndefined();
    expect(scorecardSchema.parse({ gating: {} }).gating).toEqual({});
    expect(scorecardSchema.parse({ gating: { forgedDocuments: false } }).gating).toEqual({ forgedDocuments: false });
  });

  it("rejects unknown blocker keys and non-boolean choices", () => {
    expect(scorecardSchema.safeParse({ gating: { unknownBlocker: true } }).success).toBe(false);
    expect(scorecardSchema.safeParse({ gating: { forgedDocuments: "true" } }).success).toBe(false);
  });
});

describe("sourceSchema", () => {
  it("defaults source type and reliability to unknown", () => {
    const r = sourceSchema.parse({ name: "Whitepaper" });
    expect(r.sourceType).toBe("unknown");
    expect(r.reliabilityRating).toBe("unknown");
  });
});

describe("findingSchema", () => {
  it("defaults category, severity and confidence", () => {
    const r = findingSchema.parse({ title: "Admin-key risk" });
    expect(r.category).toBe("other");
    expect(r.severity).toBe("informational");
    expect(r.confidence).toBe("medium");
    expect(r.evidenceIds).toEqual([]);
  });
});
