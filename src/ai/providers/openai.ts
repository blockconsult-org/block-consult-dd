/**
 * OpenAI API with the user's own key, through the Responses API.
 *
 * One request per task: strict JSON-schema output, plus OpenAI's hosted web
 * search tool for research. Responses are not stored on OpenAI's side
 * (store: false). If the JSON fails validation, one repair request runs
 * without web access, with the previous answer and the validation error.
 */
import OpenAI from "openai";
import type { ResponseCreateAndStreamParams as ResponseStreamParams } from "openai/lib/responses/ResponseStream";
import type { Response as OpenAiResponse, ResponseInputItem, ResponseOutputItem } from "openai/resources/responses/responses";
import { getSecret } from "@/lib/secrets";
import { getAiSettings, type AiSettings } from "../settings";
import {
  AiError,
  addUsage,
  emptyUsage,
  isAbortError,
  type AiProvider,
  type AiUsage,
  type ConnectionCheck,
  type ModelOption,
  type StructuredResult,
  type StructuredTask,
} from "../types";

export const OPENAI_KEY_SECRET = "openai.apiKey";

const DEFAULT_MAX_OUTPUT_TOKENS = 64_000;

type OpenAiSettings = AiSettings["openai"];

export const OPENAI_MODEL_CHOICES: ModelOption[] = [
  { id: "gpt-6.1-sol", label: "gpt-6.1-sol (recommended)" },
  { id: "gpt-6-astra", label: "gpt-6-astra" },
  { id: "gpt-6.1-terra", label: "gpt-6.1-terra" },
  { id: "gpt-6-luna", label: "gpt-6-luna (lower cost)" },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function createClient(): Promise<OpenAI> {
  let apiKey: string | null;
  try {
    apiKey = await getSecret(OPENAI_KEY_SECRET);
  } catch (err) {
    throw new AiError("The saved OpenAI API key can no longer be read on this computer. Enter it again in Settings.", "not_configured", {
      cause: err,
    });
  }
  if (!apiKey) throw new AiError("Add your OpenAI API key in Settings to use the OpenAI API.", "not_configured");
  // Explicit options so OPENAI_BASE_URL / OPENAI_ORG_ID from the environment cannot redirect the user's key.
  return new OpenAI({ apiKey, baseURL: "https://api.openai.com/v1", organization: null, project: null, maxRetries: 3, timeout: 30 * 60 * 1000 });
}

function apiMessage(err: InstanceType<typeof OpenAI.APIError>): string {
  const body: unknown = err.error;
  if (isRecord(body) && typeof body.message === "string") return body.message;
  return err.message;
}

export function toAiError(err: unknown, model: string): AiError {
  if (err instanceof AiError) return err;
  if (err instanceof OpenAI.APIUserAbortError) return new AiError("Cancelled.", "cancelled", { cause: err });
  if (err instanceof OpenAI.AuthenticationError) {
    return new AiError("OpenAI did not accept the API key. Check it in Settings, or create a new key on platform.openai.com.", "auth", { cause: err });
  }
  if (err instanceof OpenAI.PermissionDeniedError) {
    return new AiError(`This OpenAI key cannot use ${model}: ${apiMessage(err)}`, "auth", { cause: err });
  }
  if (err instanceof OpenAI.NotFoundError) {
    return new AiError(`OpenAI does not offer the model "${model}" to this key. Pick another model in Settings.`, "bad_request", { cause: err });
  }
  if (err instanceof OpenAI.RateLimitError) {
    if (err.code === "insufficient_quota") {
      return new AiError("Your OpenAI account has no remaining quota. Add credit on platform.openai.com, then try again.", "auth", { cause: err });
    }
    return new AiError(`The OpenAI rate limit was reached. Wait a minute and try again. (${apiMessage(err)})`, "rate_limit", { cause: err });
  }
  if (err instanceof OpenAI.BadRequestError || err instanceof OpenAI.UnprocessableEntityError) {
    return new AiError(`OpenAI rejected the request: ${apiMessage(err)}`, "bad_request", { cause: err });
  }
  if (err instanceof OpenAI.InternalServerError) {
    return new AiError(`OpenAI is busy or unavailable right now (status ${err.status}). Try again in a few minutes.`, "network", { cause: err });
  }
  if (err instanceof OpenAI.APIConnectionTimeoutError) return new AiError("OpenAI did not respond in time. Try again.", "timeout", { cause: err });
  if (err instanceof OpenAI.APIConnectionError) {
    return new AiError("Could not reach the OpenAI API. Check your internet connection.", "network", { cause: err });
  }
  if (err instanceof OpenAI.APIError) return new AiError(`OpenAI error: ${apiMessage(err)}`, "unknown", { cause: err });
  if (isAbortError(err)) return new AiError("Cancelled.", "cancelled", { cause: err });
  return new AiError(err instanceof Error ? err.message : String(err), "unknown", { cause: err });
}

function usageOf(response: OpenAiResponse, searches: number): AiUsage {
  const u = response.usage;
  return {
    inputTokens: u?.input_tokens ?? 0,
    outputTokens: u?.output_tokens ?? 0,
    webSearches: searches,
    // No price table for OpenAI models; the Usage page on platform.openai.com has exact costs.
    costUsd: null,
  };
}

interface OutputScan {
  text: string;
  refusal: string | null;
  searches: number;
  urls: string[];
}

function scanOutput(output: ResponseOutputItem[]): OutputScan {
  const scan: OutputScan = { text: "", refusal: null, searches: 0, urls: [] };
  for (const item of output) {
    if (item.type === "web_search_call") {
      if (item.action.type === "search") {
        scan.searches += 1;
        for (const source of item.action.sources ?? []) scan.urls.push(source.url);
      } else if (item.action.type === "open_page" && item.action.url) {
        scan.urls.push(item.action.url);
      }
    } else if (item.type === "message") {
      for (const part of item.content) {
        if (part.type === "output_text") {
          scan.text += part.text;
          for (const annotation of part.annotations) {
            if (annotation.type === "url_citation") scan.urls.push(annotation.url);
          }
        } else if (part.type === "refusal") {
          scan.refusal = part.refusal;
        }
      }
    }
  }
  return scan;
}

function reportProgress(item: ResponseOutputItem, onProgress?: (message: string) => void): void {
  if (!onProgress || item.type !== "web_search_call") return;
  if (item.action.type === "search") {
    const query = item.action.query ?? item.action.queries?.[0];
    if (query) onProgress(`Searching: ${query}`);
  } else if (item.action.type === "open_page" && item.action.url) {
    onProgress(`Reading ${item.action.url}`);
  }
}

function checkResponse(response: OpenAiResponse, scan: OutputScan): void {
  if (scan.refusal) throw new AiError(`The OpenAI model declined this request: ${scan.refusal}`, "refusal");
  if (response.status === "incomplete") {
    const reason = response.incomplete_details?.reason;
    if (reason === "content_filter") throw new AiError("OpenAI's content filter stopped this answer.", "refusal");
    throw new AiError("The answer was cut off at the output limit. Try a quicker research depth or a lower effort.", "truncated");
  }
  if (response.status === "failed" || response.error) {
    throw new AiError(`OpenAI could not finish this request: ${response.error?.message ?? "unknown error"}`, "unknown");
  }
}

function parseJsonText(text: string): unknown {
  return JSON.parse(text.trim().replace(/^```(?:json)?\s*|\s*```$/g, ""));
}

function validate<T>(task: StructuredTask<T>, text: string): { ok: true; data: T } | { ok: false; problem: string } {
  let value: unknown;
  try {
    value = parseJsonText(text);
  } catch {
    return { ok: false, problem: "the reply was not valid JSON" };
  }
  try {
    return { ok: true, data: task.parse(value) };
  } catch (err) {
    return { ok: false, problem: err instanceof Error ? err.message : String(err) };
  }
}

export const openaiProvider: AiProvider = {
  id: "openai",

  async run<T>(task: StructuredTask<T>): Promise<StructuredResult<T>> {
    const settings: OpenAiSettings = (await getAiSettings()).openai;
    const model = settings.model;
    try {
      const client = await createClient();
      const web = task.web;
      const instructions = web
        ? `${task.system}\n\nYou may run up to ${web.maxSearches} web searches and open up to ${web.maxFetches} pages. Answer with the JSON object only.`
        : task.system;
      const format = {
        type: "json_schema" as const,
        name: task.schemaName,
        description: task.schemaDescription,
        schema: task.jsonSchema,
        strict: true,
      };
      const input: ResponseInputItem[] = [{ role: "user", content: task.prompt }];
      const request = (withWeb: boolean, items: ResponseInputItem[]): ResponseStreamParams => ({
        model,
        instructions,
        input: items,
        store: false,
        reasoning: { effort: task.effortOverride ?? settings.effort },
        max_output_tokens: task.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
        text: { format },
        ...(withWeb && web
          ? {
              tools: [{ type: "web_search" as const, search_context_size: "medium" as const }],
              include: ["web_search_call.action.sources" as const],
              max_tool_calls: web.maxSearches + web.maxFetches,
            }
          : {}),
      });

      task.onProgress?.(web ? "OpenAI is researching" : "OpenAI is working");
      let usage = emptyUsage();
      const urls = new Set<string>();

      const once = async (params: ResponseStreamParams): Promise<OutputScan> => {
        const stream = client.responses.stream(params, { signal: task.signal });
        stream.on("response.output_item.done", (event) => reportProgress(event.item, task.onProgress));
        const response = await stream.finalResponse();
        const scan = scanOutput(response.output);
        usage = addUsage(usage, usageOf(response, scan.searches));
        for (const url of scan.urls) urls.add(url);
        checkResponse(response, scan);
        return scan;
      };

      const first = await once(request(true, input));
      let checked = validate(task, first.text);
      if (!checked.ok) {
        task.onProgress?.("Fixing the format of the result");
        const repairInput: ResponseInputItem[] = [
          ...input,
          { role: "assistant", content: first.text.slice(0, 200_000) },
          {
            role: "user",
            content: `That result failed validation: ${checked.problem.slice(0, 2000)}. Reply with the corrected, complete JSON object. Keep every finding and source that was correct.`,
          },
        ];
        const second = await once(request(false, repairInput));
        checked = validate(task, second.text);
        if (!checked.ok) throw new AiError(`OpenAI's result did not match the expected format: ${checked.problem}`, "invalid_output");
      }
      return { data: checked.data, provider: "openai", model, usage, visitedUrls: [...urls], notes: [] };
    } catch (err) {
      throw toAiError(err, model);
    }
  },

  async check(signal?: AbortSignal): Promise<ConnectionCheck> {
    const settings = (await getAiSettings()).openai;
    try {
      const client = await createClient();
      const info = await client.models.retrieve(settings.model, { signal });
      return { ok: true, message: `Connected. ${info.id} is available.`, detail: "Using the API key saved in this app." };
    } catch (err) {
      return { ok: false, message: toAiError(err, settings.model).message };
    }
  },

  async listModels(signal?: AbortSignal): Promise<ModelOption[]> {
    try {
      const client = await createClient();
      const live: string[] = [];
      for await (const model of client.models.list({ signal })) {
        // Chat-capable GPT and o-series models; skip embeddings, audio, image and moderation models.
        if (/^(gpt-|o\d)/.test(model.id) && !/(audio|realtime|transcribe|tts|image|embedding|moderation|search-preview)/.test(model.id)) {
          live.push(model.id);
        }
      }
      if (live.length === 0) return OPENAI_MODEL_CHOICES;
      const curated = OPENAI_MODEL_CHOICES.filter((choice) => live.includes(choice.id));
      const rest = live
        .filter((id) => !curated.some((choice) => choice.id === id))
        .sort()
        .reverse()
        .map((id) => ({ id, label: id }));
      return [...curated, ...rest];
    } catch {
      return OPENAI_MODEL_CHOICES;
    }
  },
};
