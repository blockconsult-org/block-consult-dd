/**
 * Shared types for the AI layer.
 *
 * Four providers implement `AiProvider`: the Anthropic API and the OpenAI API
 * (each with the user's own key), and the user's installed Claude Code and
 * Codex CLIs, which run on whatever subscription the user signed in with.
 * Every task asks for one JSON object that matches a schema, so the rest of
 * the app never parses free-form model text.
 */

export const PROVIDER_IDS = ["anthropic", "openai", "claude-code", "codex"] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];

export const PROVIDER_LABELS: Record<ProviderId, string> = {
  anthropic: "Claude API",
  openai: "OpenAI API",
  "claude-code": "Claude subscription (Claude Code)",
  codex: "ChatGPT subscription (Codex)",
};

/** Compact labels for the header and badges. */
export const PROVIDER_SHORT_LABELS: Record<ProviderId, string> = {
  anthropic: "Claude API",
  openai: "OpenAI API",
  "claude-code": "Claude plan",
  codex: "ChatGPT plan",
};

export const AI_PURPOSES = ["research", "analysis", "narrative", "intake", "test"] as const;
export type AiPurpose = (typeof AI_PURPOSES)[number];

export const EFFORT_LEVELS = ["low", "medium", "high", "xhigh", "max"] as const;
export type EffortLevel = (typeof EFFORT_LEVELS)[number];

export type JsonSchema = Record<string, unknown>;

export interface AiUsage {
  inputTokens: number;
  outputTokens: number;
  webSearches: number;
  /** Estimated list-price cost; null when unknown or covered by a subscription. */
  costUsd: number | null;
}

export function emptyUsage(): AiUsage {
  return { inputTokens: 0, outputTokens: 0, webSearches: 0, costUsd: null };
}

export function addUsage(a: AiUsage, b: AiUsage): AiUsage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    webSearches: a.webSearches + b.webSearches,
    costUsd: a.costUsd == null && b.costUsd == null ? null : (a.costUsd ?? 0) + (b.costUsd ?? 0),
  };
}

export interface WebBudget {
  maxSearches: number;
  maxFetches: number;
}

export interface StructuredTask<T> {
  purpose: AiPurpose;
  caseId?: string | null;
  system: string;
  prompt: string;
  /** Tool / schema name: lowercase letters, digits and underscores. */
  schemaName: string;
  schemaDescription: string;
  jsonSchema: JsonSchema;
  /** Validates the model's JSON. Throws on mismatch. */
  parse: (value: unknown) => T;
  /** Live web search and page fetching; null for offline tasks. */
  web: WebBudget | null;
  /** Lower effort for small tasks (intake extraction, connection tests). */
  effortOverride?: EffortLevel;
  maxOutputTokens?: number;
  signal?: AbortSignal;
  onProgress?: (message: string) => void;
}

export interface StructuredResult<T> {
  data: T;
  provider: ProviderId;
  model: string;
  usage: AiUsage;
  /** URLs the provider's web tools returned or opened (search results, fetched pages, citations). */
  visitedUrls: string[];
  /** Facts worth surfacing to the analyst, e.g. a fallback model answered. */
  notes: string[];
}

export const AI_ERROR_CODES = [
  "not_configured",
  "auth",
  "rate_limit",
  "bad_request",
  "refusal",
  "truncated",
  "invalid_output",
  "cancelled",
  "timeout",
  "cli_missing",
  "cli_failed",
  "network",
  "unknown",
] as const;
export type AiErrorCode = (typeof AI_ERROR_CODES)[number];

export class AiError extends Error {
  readonly code: AiErrorCode;

  constructor(message: string, code: AiErrorCode, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "AiError";
    this.code = code;
  }
}

export function isAbortError(err: unknown): boolean {
  if (err instanceof AiError) return err.code === "cancelled";
  if (!(err instanceof Error)) return false;
  return err.name === "AbortError" || err.name === "APIUserAbortError" || /aborted/i.test(err.message);
}

export interface ConnectionCheck {
  ok: boolean;
  message: string;
  /** Extra detail such as the CLI version or the signed-in plan. */
  detail?: string;
}

export interface ModelOption {
  id: string;
  label: string;
}

export interface AiProvider {
  readonly id: ProviderId;
  run<T>(task: StructuredTask<T>): Promise<StructuredResult<T>>;
  check(signal?: AbortSignal): Promise<ConnectionCheck>;
  listModels(signal?: AbortSignal): Promise<ModelOption[]>;
}
