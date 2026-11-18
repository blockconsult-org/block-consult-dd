/**
 * Provider lookup and the single entry point for AI calls. Every call is
 * recorded in AiCall (purpose, provider, model, tokens, searches, estimated
 * cost, duration, outcome) so the user can see what their key or plan spent.
 * Prompts and outputs are never written to that table.
 */
import { prisma } from "@/lib/db";
import { anthropicProvider } from "./providers/anthropic";
import { claudeCodeProvider } from "./providers/claude-code";
import { codexProvider } from "./providers/codex";
import { openaiProvider } from "./providers/openai";
import { getAiSettings, PROVIDER_SECTION } from "./settings";
import {
  AiError,
  emptyUsage,
  isAbortError,
  PROVIDER_LABELS,
  type AiProvider,
  type AiUsage,
  type ConnectionCheck,
  type ProviderId,
  type StructuredResult,
  type StructuredTask,
} from "./types";

const PROVIDERS: Record<ProviderId, AiProvider> = {
  anthropic: anthropicProvider,
  openai: openaiProvider,
  "claude-code": claudeCodeProvider,
  codex: codexProvider,
};

export function getProvider(id: ProviderId): AiProvider {
  return PROVIDERS[id];
}

export interface ActiveProvider {
  provider: AiProvider;
  id: ProviderId;
  label: string;
  /** Model the settings ask for; "" means the CLI's own default. */
  model: string;
}

/** The provider chosen in Settings, or a not_configured error that says what to do. */
export async function getActiveProvider(): Promise<ActiveProvider> {
  const settings = await getAiSettings();
  const id = settings.activeProvider;
  if (!id) throw new AiError("Choose an AI provider in Settings before running AI research.", "not_configured");
  return { provider: PROVIDERS[id], id, label: PROVIDER_LABELS[id], model: settings[PROVIDER_SECTION[id]].model };
}

function asAiError(err: unknown): AiError {
  if (err instanceof AiError) return err;
  if (isAbortError(err)) return new AiError("Cancelled.", "cancelled", { cause: err });
  return new AiError(err instanceof Error ? err.message : String(err), "unknown", { cause: err });
}

async function recordCall(entry: {
  task: StructuredTask<unknown>;
  provider: ProviderId;
  model: string;
  status: "ok" | "failed" | "cancelled";
  usage: AiUsage;
  durationMs: number;
  error?: string;
}): Promise<void> {
  try {
    await prisma.aiCall.create({
      data: {
        caseId: entry.task.caseId ?? null,
        purpose: entry.task.purpose,
        provider: entry.provider,
        model: entry.model || "default",
        status: entry.status,
        inputTokens: entry.usage.inputTokens,
        outputTokens: entry.usage.outputTokens,
        webSearches: entry.usage.webSearches,
        costUsd: entry.usage.costUsd,
        durationMs: entry.durationMs,
        error: entry.error?.slice(0, 2000) ?? null,
      },
    });
  } catch {
    // Usage logging must never fail the task itself.
  }
}

/**
 * Run a structured task on the active provider (or the one given) and log it.
 * Always throws AiError on failure.
 */
export async function runTask<T>(task: StructuredTask<T>, providerId?: ProviderId): Promise<StructuredResult<T>> {
  const active = providerId ? null : await getActiveProvider();
  const id = providerId ?? active?.id;
  if (!id) throw new AiError("Choose an AI provider in Settings first.", "not_configured");
  const provider = PROVIDERS[id];
  const started = Date.now();
  try {
    const result = await provider.run(task);
    await recordCall({ task, provider: id, model: result.model, status: "ok", usage: result.usage, durationMs: Date.now() - started });
    return result;
  } catch (err) {
    const error = asAiError(err);
    const settings = await getAiSettings();
    await recordCall({
      task,
      provider: id,
      model: settings[PROVIDER_SECTION[id]].model,
      status: error.code === "cancelled" ? "cancelled" : "failed",
      usage: emptyUsage(),
      durationMs: Date.now() - started,
      error: error.message,
    });
    throw error;
  }
}

/** Connection test for Settings. Never throws; failures come back as { ok: false }. */
export async function checkProvider(id: ProviderId, signal?: AbortSignal): Promise<ConnectionCheck> {
  try {
    return await PROVIDERS[id].check(signal);
  } catch (err) {
    return { ok: false, message: asAiError(err).message };
  }
}
