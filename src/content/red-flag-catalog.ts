/**
 * Fraud / red-flag catalog.
 * 10 fraud patterns, each with concrete warning signs. The fraud worker scans
 * intake + evidence text against these to raise RedFlag records.
 */
import type { RedFlagSeverity } from "@/domain/enums";
import type { GatingFlags } from "@/domain/scoring";

export interface RedFlagPattern {
  code: string;
  title: string;
  defaultSeverity: RedFlagSeverity;
  signs: string[];
  /** Keywords (lowercased) that, if present in intake/evidence text, suggest this pattern. */
  keywords: string[];
  /** Optional gating flag this pattern can trip when confirmed. */
  gating?: keyof GatingFlags;
}

export const RED_FLAG_CATALOG: RedFlagPattern[] = [
  {
    code: "FRAUD_FAKE_PRIVATE_OFFER",
    title: "Real project, fake private offer",
    defaultSeverity: "critical",
    signs: [
      "Seller uses Telegram/WhatsApp only",
      "Personal email rather than official domain",
      "Payment to personal wallet",
      "No subscription agreement",
      "No KYC/AML",
      "No proof of authority",
      "Offered discount too good to be true",
      "Pressure deadline",
      "Claims of exclusive allocation",
    ],
    keywords: ["telegram", "whatsapp", "personal wallet", "exclusive allocation", "send funds", "gmail", "protonmail"],
    gating: "sellerAuthorityUnproven",
  },
  {
    code: "FRAUD_IMPOSTOR_DOMAIN",
    title: "Impostor domain",
    defaultSeverity: "critical",
    signs: [
      "Slight spelling differences",
      "New domain registration",
      "Different contract address than official docs",
      "Fake docs",
      "Unverified wallet addresses",
      "Broken social links",
    ],
    keywords: ["impostor", "lookalike", "spoof", "different contract", "newly registered"],
    gating: "impostorDomainOrWallet",
  },
  {
    code: "FRAUD_MISLEADING_PARTNERSHIP",
    title: "Misleading partnership claim",
    defaultSeverity: "high",
    signs: [
      "Partner logo in deck only",
      "No counterparty confirmation",
      "Contributor article only",
      "Ecosystem partner vague language",
      "Use of major brand in headline without contract evidence",
    ],
    keywords: ["blackrock", "jpmorgan", "partnership", "backed by", "in partnership with", "powered by"],
    gating: "majorPartnershipUnverified",
  },
  {
    code: "FRAUD_TOKENOMICS_OPACITY",
    title: "Tokenomics opacity",
    defaultSeverity: "high",
    signs: [
      "No allocation table",
      "No unlock schedule",
      "No wallet labels",
      "No market maker disclosure",
      "Supply mismatch between sources",
      "Large insider wallet movements",
    ],
    keywords: ["no allocation", "undisclosed", "no vesting", "no unlock"],
    gating: "tokenomicsUnlocksMissing",
  },
  {
    code: "FRAUD_LIQUIDITY_ILLUSION",
    title: "Liquidity illusion",
    defaultSeverity: "high",
    signs: [
      "High reported volume but shallow book",
      "Most volume on obscure exchanges",
      "Low DEX liquidity",
      "Repetitive trade sizes",
      "Wide spread",
      "Withdrawal disabled",
      "Market cap/FDV high relative to true liquidity",
    ],
    keywords: ["wash", "withdrawal disabled", "shallow", "obscure exchange"],
    gating: "marketCannotSupportExit",
  },
  {
    code: "FRAUD_STABLECOIN_RESERVE",
    title: "Stablecoin reserve ambiguity",
    defaultSeverity: "high",
    signs: [
      "No issuer",
      "No reserve attestation",
      "No redemption terms",
      "Reserves described vaguely",
      "Illiquid collateral presented as stable backing",
      "Stablecoin function not live",
      "Redemptions can be paused without clear rules",
    ],
    keywords: ["reserve", "attestation", "redemption", "depeg", "1:1 backed"],
    gating: "stablecoinReserveUnclear",
  },
  {
    code: "FRAUD_RWA_OWNERSHIP",
    title: "RWA ownership ambiguity",
    defaultSeverity: "high",
    signs: [
      "No title memo",
      "No SPV docs",
      "No lien/security documents",
      "No custodian/trustee agreement",
      "No investor rights explanation",
      "No default waterfall",
      "Backed by real estate with no enforceable claim",
    ],
    keywords: ["spv", "title", "real estate", "collateral", "custodian", "lien"],
    gating: "rwaOwnershipUnclear",
  },
  {
    code: "FRAUD_ADMIN_KEY_HIDDEN",
    title: "Admin-key risk hidden",
    defaultSeverity: "critical",
    signs: [
      "Contract can mint/pause/freeze/upgrade",
      "Single EOA controls contracts",
      "No multisig/timelock",
      "No audit",
      "Audit excludes deployed contract",
      "Blacklist/freeze powers not disclosed",
    ],
    keywords: ["mint", "pause", "freeze", "blacklist", "upgradeable", "owner", "proxy"],
    gating: "criticalAdminUndisclosed",
  },
  {
    code: "FRAUD_TEAM_CREDIBILITY",
    title: "Founder/team credibility issues",
    defaultSeverity: "high",
    signs: [
      "Anonymous team for regulated finance project",
      "Fake advisors",
      "Inflated credentials",
      "Prior rug-pull allegations",
      "Prior enforcement/litigation",
      "Deleted history",
      "No relevant execution track record",
    ],
    keywords: ["anonymous", "rug pull", "enforcement", "litigation", "fake advisor"],
  },
  {
    code: "FRAUD_SALES_PRESSURE",
    title: "Sales pressure and return promises",
    defaultSeverity: "critical",
    signs: [
      "Guaranteed return",
      "Specific price target",
      "\"Will 4x\"",
      "\"Bank already approved, no need to check\"",
      "\"Last chance\"",
      "\"Do not contact company directly\"",
      "\"Send funds first to secure allocation\"",
    ],
    keywords: ["guaranteed", "will 4x", "last chance", "do not contact", "send funds first", "guaranteed return"],
    gating: "guaranteedReturnsUnverified",
  },
];
