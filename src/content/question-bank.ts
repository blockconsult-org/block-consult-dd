/**
 * Diligence question bank.
 * 10 sections of issuer/seller/project clarification questions. Used to build
 * the "Due-Diligence Questions" report section and the case question list.
 */

export interface QuestionSection {
  key: string;
  title: string;
  questions: string[];
}

export const QUESTION_BANK: QuestionSection[] = [
  {
    key: "basic_structure",
    title: "Basic structure",
    questions: [
      "What exactly is being offered?",
      "Is the client buying a public token, private token allocation, SAFT, equity, note, fund interest, stablecoin, RWA token, staking product, or another instrument?",
      "Who is the legal issuer?",
      "Who is the legal seller?",
      "Who has authority to sell this instrument?",
      "What legal agreement governs the transaction?",
      "What jurisdiction governs the agreement?",
      "What rights does the investor receive?",
      "Are there lockups or transfer restrictions?",
      "Are there investor qualification requirements?",
    ],
  },
  {
    key: "token_identity",
    title: "Token identity",
    questions: [
      "What is the official token name and ticker?",
      "What is the official contract address?",
      "Which chain(s) are supported?",
      "Which official source confirms the contract address?",
      "Which exchanges list the token?",
      "Are deposits and withdrawals enabled?",
      "Are there jurisdiction restrictions?",
      "Is the offered token the same as the exchange-listed token?",
      "Are there wrapped or bridged versions?",
      "Which version will be delivered to the investor?",
    ],
  },
  {
    key: "tokenomics",
    title: "Tokenomics",
    questions: [
      "What is the total supply?",
      "What is the max supply?",
      "What is the current circulating supply?",
      "Please provide the full allocation table.",
      "Please provide the full vesting/unlock schedule.",
      "What percentage is unlocked today?",
      "What unlocks in the next 3, 6, 12, and 24 months?",
      "Are there cliffs or large unlock dates?",
      "What are the team/founder lockups?",
      "What are the private investor lockups?",
      "At what prices were private rounds completed?",
      "Are there side letters, warrants, options, or future token rights?",
      "Are any tokens loaned to market makers?",
      "Who are the market makers and how many tokens do they control?",
      "Can market makers sell, short, borrow, or rehypothecate tokens?",
      "Which wallets belong to team, treasury, investors, market makers, and exchanges?",
      "What are the top holder concentrations?",
      "Are there future emissions, and how are staking rewards funded?",
      "Does the token have burn, buyback, fee-sharing, or revenue-capture mechanics?",
      "Do token holders have any claim on revenue, assets, equity, liquidation proceeds, or redemption? If not, what gives the token economic value?",
    ],
  },
  {
    key: "market_liquidity",
    title: "Market and liquidity",
    questions: [
      "Which venues have real active trading?",
      "What is the true 24h volume by venue?",
      "What is the order-book depth on each CEX?",
      "What is the DEX liquidity by pool?",
      "What is the estimated slippage for $10k, $50k, $100k, $500k, and $1m?",
      "Is there an OTC desk or market maker available for exits?",
      "Are there transfer restrictions?",
      "Are deposits/withdrawals enabled on exchanges?",
      "Are any liquidity commitments in place?",
      "What happens to liquidity after unlocks?",
    ],
  },
  {
    key: "asset_role",
    title: "Token role in the transaction",
    questions: [
      "Is the token required for this transaction?",
      "Who must buy or hold the token, and who must stake it?",
      "How much must be staked?",
      "Is the token used as collateral, gas, fee payment, validator stake, insurance stake, or governance token?",
      "Which fees are paid in the token?",
      "Does the transaction create direct market demand for the token?",
      "Does the token get burned, locked, bought back, or staked?",
      "Could the same tokenised asset exist without the ecosystem token?",
      "Could settlement happen in fiat or a stablecoin without the ecosystem token?",
    ],
  },
  {
    key: "stablecoin",
    title: "Stablecoin",
    questions: [
      "Is the stablecoin live today?",
      "What is the contract address and which chain is it issued on?",
      "Who is the legal issuer and what jurisdiction governs it?",
      "What is its regulatory classification?",
      "Has it received any authorisation or legal opinion?",
      "Who is legally obligated to redeem it, and can holders redeem 1:1 for fiat?",
      "What are the redemption fees, minimum/maximum amounts, and timeframe?",
      "Can redemption be paused?",
      "What reserves back it (cash, bank deposits, government securities, crypto, real estate, other)?",
      "Where are reserves held, are they segregated, and are they bankruptcy remote?",
      "Are there reserve attestations, and who audits the reserves?",
      "Can wallets be frozen or blacklisted?",
      "What happens if the stablecoin depegs?",
      "Is any real-world asset used as reserve/collateral, or is the stablecoin only a settlement rail?",
    ],
  },
  {
    key: "rwa",
    title: "Real-world asset tokenisation",
    questions: [
      "What exactly is being tokenised — the asset itself, SPV shares, a debt claim, a mortgage, rental income, or another right?",
      "Who owns the asset before tokenisation, and who owns it after?",
      "Will title transfer?",
      "Will any lien, pledge, mortgage, charge, or security interest be created?",
      "Is an SPV used, and who owns and controls it?",
      "Who are the directors/managers?",
      "What rights do token holders receive (income, sale proceeds, enforcement against the asset)?",
      "Who handles custody/trustee/security-agent functions?",
      "Who values the asset, and is there an independent appraisal?",
      "Is there insurance?",
      "What happens in default and in insolvency, and how can the structure be unwound?",
      "Is the token tradable and who provides liquidity?",
      "Are investors retail/professional/qualified/institutional?",
    ],
  },
  {
    key: "legal_regulatory",
    title: "Legal/regulatory",
    questions: [
      "Which law firm reviewed the structure? Please provide the legal opinion or regulatory memo.",
      "Is the token a security/financial instrument?",
      "Is the stablecoin an e-money token or asset-referenced token?",
      "Is a prospectus or private placement exemption required?",
      "Are resale restrictions required?",
      "Are investors required to be qualified/professional?",
      "Which entity performs KYC/AML and which entity provides custody?",
      "Which entity is regulated and in what capacity?",
      "Are there tax memos for the investor and the asset owner?",
      "Are marketing materials approved by counsel?",
    ],
  },
  {
    key: "smart_contracts",
    title: "Smart contracts",
    questions: [
      "Which contracts will be used, are they deployed, verified, and audited?",
      "Please provide audit reports.",
      "Are contracts upgradeable and who controls admin keys?",
      "Is there a multisig and who are the signers? Is there a timelock?",
      "Can transfers be paused, or wallets frozen/blacklisted?",
      "Can tokens be minted after issuance?",
      "Can metadata or legal terms be changed?",
      "What oracles or off-chain data feeds are used?",
    ],
  },
  {
    key: "documents",
    title: "Documents",
    questions: [
      "Please provide the full legal term sheet and purchase/subscription agreement.",
      "Please provide proof of seller authority and confirmation from the official company domain.",
      "Please provide the tokenomics and unlock schedule, wallet labels, and market maker agreement summary.",
      "Please provide the legal opinion/regulatory memo, stablecoin terms and reserve reports, and RWA/SPV documents where applicable.",
      "Please provide audit reports and risk factors.",
    ],
  },
];

export function flattenQuestions(sections: QuestionSection[] = QUESTION_BANK): string[] {
  return sections.flatMap((s) => s.questions);
}
