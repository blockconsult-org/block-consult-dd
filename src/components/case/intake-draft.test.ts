import { describe, expect, it } from "vitest";
import { intakeDraft, intakePayload } from "./intake-draft";

describe("intake editing", () => {
  it("preserves structured counterparties, documents and unchanged arrays when one field changes", () => {
    const original = {
      projectName: "Meridian",
      tickers: ["MER,Series A"],
      contractAddresses: [{ chain: "ethereum", address: "0x123" }, { chain: "base", address: "" }],
      counterparties: [{ name: "Example seller", claimedRole: "Agent", contact: "seller@example.invalid", notes: "Authority unverified" }],
      documents: [{ name: "Term sheet", kind: "Offer", received: true, notes: "Draft copy" }],
      offerPrice: "$0.04",
    };
    const edited = { ...intakeDraft(original, "Meridian"), offerPrice: "$0.05" };
    const payload = intakePayload(edited, original);
    expect(payload.offerPrice).toBe("$0.05");
    expect(payload.counterparties).toEqual(original.counterparties);
    expect(payload.documents).toEqual(original.documents);
    expect(payload.contractAddresses).toEqual(original.contractAddresses);
    expect(payload.tickers).toEqual(original.tickers);
  });

  it("clears optional values and parses edited addresses without changing the case contract", () => {
    const original = { projectName: "Meridian", offerType: "private_token_offer", notes: "Old note" };
    const edited = { ...intakeDraft(original, "Meridian"), projectName: "Meridian review", notes: "", offerType: "", contractAddresses: "ethereum:0x123\n0x456" };
    const payload = intakePayload(edited, original);
    expect(payload.projectName).toBe("Meridian review");
    expect(payload.notes).toBeUndefined();
    expect(payload.offerType).toBeUndefined();
    expect(payload.contractAddresses).toEqual([{ chain: "ethereum", address: "0x123" }, { chain: "", address: "0x456" }]);
  });
});
