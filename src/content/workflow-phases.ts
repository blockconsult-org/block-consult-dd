/**
 * Master research workflow.
 * 14 sequential phases. Each maps to one or more harness workers.
 */

export interface WorkflowPhase {
  key: string;
  title: string;
  workers: string[];
}

export const WORKFLOW_PHASES: WorkflowPhase[] = [
  { key: "intake", title: "Intake and scope", workers: ["intake-parser"] },
  { key: "identity", title: "Identity verification", workers: ["search-planner", "web-research", "identity"] },
  { key: "source_map", title: "Source map", workers: ["web-research", "citation-verifier"] },
  { key: "entity", title: "Entity and legal structure", workers: ["entity-team"] },
  { key: "team", title: "Founder and team", workers: ["entity-team"] },
  { key: "tokenomics", title: "Tokenomics", workers: ["tokenomics"] },
  { key: "market", title: "Market and liquidity", workers: ["exchange-data", "market-liquidity"] },
  { key: "onchain", title: "On-chain and smart contracts", workers: ["onchain-data", "onchain"] },
  { key: "stablecoin_rwa", title: "Stablecoin/RWA, if applicable", workers: ["stablecoin-rwa"] },
  { key: "partnerships", title: "Partnerships and claims", workers: ["fraud-redflag"] },
  { key: "legal", title: "Legal/regulatory issue spotting", workers: ["legal-issue-spotting"] },
  { key: "fraud", title: "Fraud/red flags", workers: ["fraud-redflag"] },
  { key: "scoring", title: "Scoring and recommendation", workers: ["scoring"] },
  { key: "report", title: "Report production", workers: ["report-writer", "qa-reviewer"] },
];
