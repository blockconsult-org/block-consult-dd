import { describe, expect, it } from "vitest";
import { mergeGating, readGating, readResearchGating, readSavedGating, savedGatingAfterEdit } from "./gating";

describe("blocker choices", () => {
  it("reads only known, true flags and tolerates invalid stored JSON", () => {
    expect(readGating({ forgedDocuments: true, paymentUnauthenticated: "true", unknown: true })).toEqual({ forgedDocuments: true });
    expect(readSavedGating("not json")).toEqual({});
    expect(readSavedGating('["forgedDocuments"]')).toEqual({});
    expect(readResearchGating('{"gating":{"forgedDocuments":true}}')).toEqual({ forgedDocuments: true });
    expect(readResearchGating("null")).toEqual({});
  });

  it("keeps a research blocker active when the reviewer clears their own choice", () => {
    expect(mergeGating({ forgedDocuments: true }, { forgedDocuments: false, legalInstrumentUnknown: true })).toEqual({ forgedDocuments: true, legalInstrumentUnknown: true });
  });

  it("preserves omitted choices and supports an explicit clear", () => {
    const stored = '{"forgedDocuments":true}';
    expect(savedGatingAfterEdit(stored, undefined)).toEqual({ forgedDocuments: true });
    expect(savedGatingAfterEdit(stored, {})).toEqual({});
    expect(savedGatingAfterEdit(stored, { forgedDocuments: false })).toEqual({});
  });
});
