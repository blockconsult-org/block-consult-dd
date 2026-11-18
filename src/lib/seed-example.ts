/**
 * Example case: "Meridian RWA Token (MRDN)", a fictional tokenised real-estate
 * fund offered to a family office as a $500k OTC private allocation. The data
 * exercises every module: ticker and contract verification, an unverified
 * Northstar Custody partnership, a cold-introduced "authorised seller", thin DEX
 * liquidity, admin-key risk and ambiguous RWA redemption rights. The rule-based
 * checks should raise red flags and gate the recommendation down.
 *
 * All people, organisations, identifiers and market data are illustrative.
 * Source links use reserved .example domains and are not live evidence.
 *
 * Used by `npm run db:seed` and by the "Load example case" button.
 */
import type { Prisma } from "@prisma/client";

export const EXAMPLE_PROJECT_NAME = "Meridian RWA Token";

const J = (v: unknown): string => JSON.stringify(v);

/** Create the example case with its sources, evidence and records. Returns the new case id. */
export async function createExampleCase(db: Prisma.TransactionClient): Promise<string> {
  const projectName = EXAMPLE_PROJECT_NAME;
  const c = await db.dDCase.create({
    data: {
      projectName,
      clientName: "Example Family Office",
      analyst: "Example analyst",
      reportType: "full_institutional",
      status: "draft",
      brand: "Block Consult GmbH",
      intake: {
        create: {
          projectName,
          tickers: J(["MRDN"]),
          links: J(["https://meridian-rwa.example", "https://docs.meridian-rwa.example", "https://meridian-offer.example"]),
          contractAddresses: J([{ chain: "ethereum", address: "0x9f3aC21b4e7790Db52a1c6e0F0B2d4A8c91Ec21b" }]),
          chains: J(["ethereum"]),
          claimedPartnerships: J(["Northstar Custody (asset custody)", "Harbor Wallets (wallet infrastructure)", "Lighthouse Feeds (price feeds)"]),
          claimedExchangeListings: J(["Example Swap", "Example Exchange"]),
          walletAddresses: J(["0x5b1eA9c4f2D0B8a37c6E1f90aa12C3b4D5e6F7a8"]),
          counterparties: J([
            { name: "Meridian Capital Partners Ltd", claimedRole: "Authorised OTC seller", contact: "Telegram @meridian_otc", notes: "Cold-introduced; no prior relationship" },
          ]),
          documents: J([
            { name: "Token Sale Agreement (draft)", kind: "contract", received: true, notes: "Unsigned PDF" },
            { name: "Reserve / asset attestation", kind: "attestation", received: false, notes: "Requested, not provided" },
          ]),
          questionsToVerify: J([
            "Is the contract address on the official site identical to the one quoted in the offer?",
            "Is Meridian Capital Partners actually authorised to sell foundation tokens?",
            "Does Northstar Custody confirm any custody relationship?",
            "What legally enforceable redemption rights exist to the underlying real estate?",
            "Is on-chain liquidity sufficient to exit a $500k position without severe slippage?",
          ]),
          offerType: "otc",
          offerPrice: "$0.85 per MRDN",
          investmentAmount: "$500,000",
          lockupVesting: "6-month cliff, then 18-month linear",
          sellerDetails:
            "Introduced via Telegram by a person claiming to represent 'Meridian Capital Partners Ltd', presented as the foundation's authorised OTC desk. Requested payment in USDT to a personal-looking wallet, not a named corporate account.",
          clientJurisdiction: "Germany",
          issuerJurisdiction: "British Virgin Islands",
          notes: "Fictional example case with sample data. Client is weighing a $500k allocation and wants independent verification before wiring any funds.",
        },
      },
    },
  });
  const caseId = c.id;

  // --- Sources -------------------------------------------------------------
  const sOfficial = await db.source.create({
    data: {
      caseId, name: "Meridian RWA — official website", title: "meridian-rwa.example", sourceType: "primary_official",
      url: "https://meridian-rwa.example", reliabilityRating: "high",
      content: "Official site lists the MRDN contract on Ethereum as 0x9f3aC21b...c21b and describes a tokenised portfolio of European commercial real estate held via a BVI SPV.",
    },
  });
  const sWhitepaper = await db.source.create({
    data: {
      caseId, name: "MRDN whitepaper v1.3", title: "Tokenomics & structure", sourceType: "primary_official",
      url: "https://docs.meridian-rwa.example/whitepaper", reliabilityRating: "medium",
      content: "Total supply 500,000,000 MRDN. Allocations: team 18%, private investors 22%, treasury 15%, ecosystem 20%, public sale 25%. Vesting described narratively; no per-date unlock table provided.",
    },
  });
  const sChain = await db.source.create({
    data: {
      caseId, name: "Example explorer — MRDN token contract", title: "0x9f3a…c21b", sourceType: "primary_chain",
      url: "https://explorer.example/address/0x9f3aC21b4e7790Db52a1c6e0F0B2d4A8c91Ec21b", reliabilityRating: "high",
      content: "Verified source. Upgradeable (UUPS proxy). Owner is an externally-owned account, not a multisig. Functions include mint() and pause(), callable by owner. No timelock.",
    },
  });
  const sMarket = await db.source.create({
    data: {
      caseId, name: "Example market feed — MRDN market data", title: "Market overview", sourceType: "market_aggregator",
      url: "https://market-data.example/coins/meridian-rwa", reliabilityRating: "medium",
      content: "Price $0.21. 24h volume ~$38,000, almost entirely on a single Example Swap pool. Reported FDV ~$105m on a thin float.",
    },
  });
  const sTelegram = await db.source.create({
    data: {
      caseId, name: "Telegram message from 'authorised seller'", title: "@meridian_otc", sourceType: "community",
      reliabilityRating: "low",
      content: "Seller claims a guaranteed 3x within 12 months, custody by Northstar Custody, and offers MRDN at $0.85 — a ~4x premium to the $0.21 screen price. Payment requested in USDT to a personal wallet.",
    },
  });
  const sRegistry = await db.source.create({
    data: {
      caseId, name: "Illustrative company registry extract", title: "Meridian RWA Foundation", sourceType: "primary_registry",
      reliabilityRating: "medium",
      content: "A 'Meridian RWA Foundation' is registered in the BVI. No record found for 'Meridian Capital Partners Ltd' as a related or authorised entity.",
    },
  });

  // --- Evidence claims -----------------------------------------------------
  await db.evidenceClaim.createMany({
    data: [
      { caseId, sourceId: sOfficial.id, claimText: "Official MRDN contract on Ethereum is 0x9f3a…c21b.", sourceType: "primary_official", claimClass: "primary", reliabilityRating: "high", confidence: "high", corroborated: true },
      { caseId, sourceId: sWhitepaper.id, claimText: "Total supply is 500,000,000 MRDN with 18% to team and 22% to private investors; no per-date unlock table is published.", sourceType: "primary_official", claimClass: "secondary", reliabilityRating: "medium", confidence: "medium", corroborated: false },
      { caseId, sourceId: sChain.id, claimText: "Token contract is an upgradeable proxy with mint and pause controlled by a single EOA owner; no timelock.", sourceType: "primary_chain", claimClass: "primary", reliabilityRating: "high", confidence: "high", corroborated: false },
      { caseId, sourceId: sMarket.id, claimText: "24h volume is ~$38k, concentrated in one Example Swap pool.", sourceType: "market_aggregator", claimClass: "market", reliabilityRating: "medium", confidence: "medium", corroborated: false },
      { caseId, sourceId: sTelegram.id, claimText: "Seller offers MRDN at $0.85 vs a $0.21 screen price and guarantees 3x returns.", sourceType: "community", claimClass: "unsupported", reliabilityRating: "low", confidence: "low", corroborated: false },
      { caseId, sourceId: sRegistry.id, claimText: "No registry record links 'Meridian Capital Partners Ltd' to the foundation.", sourceType: "primary_registry", claimClass: "primary", reliabilityRating: "medium", confidence: "medium", corroborated: false },
    ],
  });

  // --- Entities & people ---------------------------------------------------
  await db.entity.createMany({
    data: [
      { caseId, name: "Meridian RWA Foundation", entityType: "foundation", role: "Issuer", jurisdiction: "British Virgin Islands", registrationNumber: "BVI-2043118", website: "https://meridian-rwa.example", confidence: "medium", notes: "Fictional registry entry for this example; not independently verified." },
      { caseId, name: "Meridian Capital Partners Ltd", entityType: "company", role: "Claimed authorised seller", jurisdiction: "Unknown", confidence: "low", notes: "No registry record found linking it to the foundation." },
      { caseId, name: "Helvetia Custody AG", entityType: "custodian", role: "Claimed custodian", jurisdiction: "Switzerland", confidence: "low", notes: "Mentioned in pitch; unverified." },
    ],
  });
  await db.person.createMany({
    data: [
      { caseId, fullName: "Dr. Lena Hoffmann", roles: J(["Founder", "CEO"]), confidence: "medium", reputationNotes: "Real-estate finance background per the whitepaper bio; no independent profile checked yet." },
      { caseId, fullName: "Marco Ferraro", roles: J(["CTO"]), confidence: "low", reputationNotes: "Sparse public footprint; no code history matching the claimed protocol work." },
    ],
  });

  // --- Token + allocations + unlocks --------------------------------------
  await db.token.create({
    data: {
      caseId, name: "Meridian RWA Token", symbol: "MRDN", chain: "ethereum",
      contractAddress: "0x9f3aC21b4e7790Db52a1c6e0F0B2d4A8c91Ec21b", tokenStandard: "ERC-20", decimals: 18,
      price: 0.21, marketCap: 22_050_000, fdv: 105_000_000, circulatingSupply: 105_000_000, totalSupply: 500_000_000, maxSupply: 500_000_000,
      utility: J(["governance", "fee discount", "pro-rata net rental yield (claimed)"]),
      valueCapture: J(["claimed quarterly yield distribution"]),
      rightsDisclaimer: "Whitepaper states tokens convey an economic interest but explicitly disclaims direct legal title to the properties.",
      vestingNotes: "Vesting described narratively only; no per-date unlock table published.",
      allocations: {
        create: [
          { category: "team", percentageTotal: 18, vestingTerms: "6m cliff, 18m linear", confidence: "medium" },
          { category: "private_investors", percentageTotal: 22, vestingTerms: "6m cliff, 18m linear", confidence: "medium" },
          { category: "treasury", percentageTotal: 15, confidence: "low" },
          { category: "ecosystem", percentageTotal: 20, confidence: "low" },
          { category: "public_sale", percentageTotal: 25, confidence: "medium" },
        ],
      },
      unlocks: {
        create: [
          { date: "2026-01-01", percentageSupply: 4, category: "private_investors", cliff: true, source: "whitepaper" },
          { date: "2026-04-01", percentageSupply: 3, category: "team", linear: true, source: "whitepaper" },
        ],
      },
    },
  });

  // --- Contract (admin-key risk) ------------------------------------------
  await db.tokenContract.create({
    data: {
      caseId, chain: "ethereum", address: "0x9f3aC21b4e7790Db52a1c6e0F0B2d4A8c91Ec21b", name: "MeridianRWAToken (proxy)",
      verified: true, proxy: true, implementationAddress: "0x77d1...A0e4", ownerAddress: "0x5b1eA9c4...F7a8",
      canMint: true, canPause: true, canUpgrade: true, multisig: false, timelock: false,
      securityNotes: "Single-EOA owner can mint, pause and upgrade with no timelock or multisig — material centralisation / admin-key risk.",
    },
  });

  // --- Markets & liquidity -------------------------------------------------
  await db.exchangeMarket.createMany({
    data: [
      { caseId, exchange: "Example Swap", marketType: "dex_pool", base: "MRDN", quote: "USDC", pair: "MRDN/USDC", url: "https://swap.example", price: 0.21, volume24h: 34_000, depthPlus2PctUsd: 9_500, depthMinus2PctUsd: 8_200, trustScore: "low" },
      { caseId, exchange: "Example Exchange", marketType: "cex_spot", base: "MRDN", quote: "USDT", pair: "MRDN/USDT", price: 0.205, volume24h: 4_000, depositStatus: "enabled", withdrawalStatus: "enabled", trustScore: "low" },
    ],
  });
  await db.liquiditySnapshot.create({
    data: { caseId, totalLiquidityUsd: 180_000, dexLiquidityUsd: 176_000, cexLiquidityUsd: 4_000, volume24h: 38_000, venueCount: 2, source: "CoinGecko + Uniswap", notes: "A $500k exit would dwarf available depth — severe slippage / no clean exit." },
  });
  await db.holderSnapshot.create({
    data: { caseId, totalHolders: 412, top10Pct: 78, top50Pct: 94, source: "Etherscan holders tab", notes: "Highly concentrated; top 10 wallets hold ~78%." },
  });

  // --- RWA profile ---------------------------------------------------------
  await db.rWAAssetProfile.create({
    data: {
      caseId, assetDescription: "Portfolio of European commercial real estate (claimed) held via a BVI SPV", assetType: "real_estate",
      jurisdiction: "British Virgin Islands / Germany", legalOwnerBefore: "Meridian RWA Foundation (claimed)", legalOwnerAfter: "BVI SPV (claimed)",
      investorRights: J(["claimed pro-rata economic interest", "governance voting"]),
      redemptionRights: "No clear, legally enforceable redemption mechanism documented. Whitepaper disclaims direct title.",
      cashflowRights: "Quarterly net-rental distribution is claimed but not contractually evidenced.",
      valuationMethod: "Sponsor-asserted NAV; no third-party appraisal provided.",
    },
  });

  // --- A couple of analyst-authored findings ------------------------------
  await db.riskFinding.createMany({
    data: [
      { caseId, category: "fraud", title: "Seller authority unproven and payment routing suspicious", severity: "critical", confidence: "medium", source: "manual",
        analysis: "The offer arrived cold via Telegram from 'Meridian Capital Partners Ltd', which no registry record links to the foundation. Payment was requested in USDT to a personal-looking wallet. Authority to sell foundation tokens is unproven.",
        impact: "Risk of paying an impostor with no recourse.", mitigation: "Require written confirmation from the foundation's verified domain and a named corporate settlement account before any funds move." },
      { caseId, category: "market", title: "On-chain liquidity cannot support the intended exit", severity: "high", confidence: "high", source: "manual",
        analysis: "Total liquidity is ~$180k across two venues with ~$38k daily volume. A $500k position cannot be exited without severe slippage or moving the market.",
        impact: "Effective lock-in regardless of stated vesting.", mitigation: "Size to realistic depth or negotiate issuer-backed redemption with enforceable terms." },
    ],
  });

  return caseId;
}
