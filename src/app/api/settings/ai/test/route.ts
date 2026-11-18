import { z } from "zod";
import { ok, parseBody } from "@/lib/api";
import { checkProvider, runTask } from "@/ai/registry";
import { JSON_SCHEMAS, pingSchema } from "@/ai/schemas";
import { AiError, PROVIDER_IDS, type ConnectionCheck } from "@/ai/types";

const testSchema = z.object({
  provider: z.enum(PROVIDER_IDS),
  /** check: credentials and model only, no tokens spent. prompt: a tiny structured request through the full pipeline. */
  mode: z.enum(["check", "prompt"]).default("check"),
});

const CHECK_TIMEOUT_MS = 60_000;
const PROMPT_TIMEOUT_MS = 180_000;

export async function POST(req: Request) {
  const parsed = await parseBody(req, testSchema);
  if ("error" in parsed) return parsed.error;
  const { provider } = parsed.data;
  const mode = parsed.data.mode ?? "check";

  if (mode === "check") {
    const signal = AbortSignal.any([req.signal, AbortSignal.timeout(CHECK_TIMEOUT_MS)]);
    return ok(await checkProvider(provider, signal));
  }

  const signal = AbortSignal.any([req.signal, AbortSignal.timeout(PROMPT_TIMEOUT_MS)]);
  try {
    const result = await runTask(
      {
        purpose: "test",
        system: "You are answering a connection test for a desktop app. Follow the instruction exactly.",
        prompt: 'Return the JSON object {"reply": "ok"}.',
        schemaName: "submit_reply",
        schemaDescription: "Submit the reply.",
        jsonSchema: JSON_SCHEMAS.ping,
        parse: (value) => pingSchema.parse(value),
        web: null,
        effortOverride: "low",
        maxOutputTokens: 4000,
        signal,
      },
      provider,
    );
    const answer: ConnectionCheck = {
      ok: true,
      message: `Test prompt answered by ${result.model || "the default model"}.`,
      detail: [
        `${result.usage.inputTokens + result.usage.outputTokens} tokens`,
        result.usage.costUsd != null ? `about $${result.usage.costUsd.toFixed(4)}` : null,
        ...result.notes,
      ]
        .filter(Boolean)
        .join(" · "),
    };
    return ok(answer);
  } catch (err) {
    const message = err instanceof AiError ? err.message : err instanceof Error ? err.message : String(err);
    return ok({ ok: false, message } satisfies ConnectionCheck);
  }
}
