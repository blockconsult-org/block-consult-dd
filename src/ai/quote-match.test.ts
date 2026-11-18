import { describe, expect, it } from "vitest";
import { matchQuote } from "./quote-match";

const PAGE = `
  <p>The protocol treasury is held in a 3-of-5 multisig wallet. Contracts were audited by two independent firms in 2025.</p>
  <p>Total supply is fixed at 1,000,000,000 tokens — no further minting is possible.</p>
`;

describe("matchQuote", () => {
  it("verifies quotes that differ only in case, spacing, punctuation or typographic marks", () => {
    expect(matchQuote("total supply is fixed at 1,000,000,000 tokens", PAGE)).toBe("verified");
    expect(matchQuote("“Total  supply is fixed at 1,000,000,000 tokens – no further minting is possible.”", PAGE)).toBe("verified");
  });

  it("treats an elided quote as partial when every piece is on the page", () => {
    expect(matchQuote("The protocol treasury is held in a 3-of-5 multisig … audited by two independent firms", PAGE)).toBe("partial");
  });

  it("rejects quotes that are not on the page", () => {
    expect(matchQuote("Every token is backed one to one by US Treasury bills held at a regulated custodian", PAGE)).toBe("not_found");
    expect(matchQuote("audited by four firms", PAGE)).toBe("not_found");
    expect(matchQuote("   ", PAGE)).toBe("not_found");
  });
});
