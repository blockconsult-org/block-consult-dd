/**
 * Harness contract. Every analysis worker implements `Worker`: a pure-ish
 * function with an input snapshot, structured output, failure handling, evidence
 * handling, a confidence rating, and logs/traces. The orchestrator persists the
 * findings/red-flags and stores the structured module output for the report.
 */
import type {
  DDCase,
  Entity,
  EvidenceClaim,
  ExchangeMarket,
  HolderSnapshot,
  IntakeInput,
  LiquiditySnapshot,
  Person,
  RWAAssetProfile,
  Source,
  StablecoinProfile,
  Token,
  TokenAllocation,
  TokenContract,
  UnlockEvent,
} from "@prisma/client";
import type { Confidence, FindingCategory, RedFlagSeverity, Severity, WorkerStatus } from "@/domain/enums";
import type { GatingFlags } from "@/domain/scoring";
import type { IntakeInputDTO } from "@/domain/schemas";
import type { Connectors } from "./connectors/types";

export type TokenWithChildren = Token & {
  allocations: TokenAllocation[];
  unlocks: UnlockEvent[];
};

/** Read-only snapshot of a case handed to each worker. */
export interface CaseSnapshot {
  caseRow: DDCase;
  intakeRow: IntakeInput | null;
  intake: IntakeInputDTO;
  sources: Source[];
  evidence: EvidenceClaim[];
  entities: Entity[];
  people: Person[];
  tokens: TokenWithChildren[];
  contracts: TokenContract[];
  markets: ExchangeMarket[];
  holderSnaps: HolderSnapshot[];
  liquiditySnaps: LiquiditySnapshot[];
  stablecoins: StablecoinProfile[];
  rwaAssets: RWAAssetProfile[];
  /** Concatenated lowercased text of all source content + intake notes, for scanning. */
  corpus: string;
}

export interface FindingDraft {
  category: FindingCategory;
  title: string;
  claim?: string;
  analysis?: string;
  severity: Severity;
  confidence: Confidence;
  impact?: string;
  mitigation?: string;
  openQuestions?: string[];
  evidenceIds?: string[];
}

export interface RedFlagDraft {
  code?: string;
  title: string;
  severity: RedFlagSeverity;
  evidence?: string;
  impact?: string;
  mitigation?: string;
  triggered: boolean;
}

export interface WorkerResult {
  worker: string;
  status: WorkerStatus;
  confidence: Confidence;
  logs: string[];
  findings: FindingDraft[];
  redFlags: RedFlagDraft[];
  openQuestions: string[];
  gating: Partial<GatingFlags>;
  /** Structured data for the report writer, keyed by worker name. */
  moduleOutput: Record<string, unknown>;
  /** Optional partial category scores (1..10) this worker can suggest. */
  suggestedScores?: Record<string, number>;
  error?: string;
}

export interface WorkerContext {
  snapshot: CaseSnapshot;
  connectors: Connectors;
  log: (msg: string) => void;
}

export interface Worker {
  name: string;
  /** When false for a given snapshot, the worker is skipped (e.g. no stablecoin). */
  applies?: (snapshot: CaseSnapshot) => boolean;
  run: (ctx: WorkerContext) => Promise<Omit<WorkerResult, "worker" | "logs">> | Omit<WorkerResult, "worker" | "logs">;
}

/** Convenience: empty result a worker can spread into. */
export function emptyResult(): Omit<WorkerResult, "worker" | "logs"> {
  return {
    status: "ok",
    confidence: "medium",
    findings: [],
    redFlags: [],
    openQuestions: [],
    gating: {},
    moduleOutput: {},
  };
}
