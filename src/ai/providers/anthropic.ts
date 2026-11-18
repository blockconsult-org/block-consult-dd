/**
 * Claude API with the user's own key, or the credentials already set up on
 * this computer (ANTHROPIC_API_KEY or an `ant auth login` profile).
 *
 * Web research runs a tool loop: Anthropic's server-side web search and web
 * fetch tools plus a strict submit tool whose input is the result. Structured
 * outputs cannot be combined with web citations, so the submit tool carries
 * the schema there. Tasks without web access use output_config.format.
 * Every result is validated with Zod by the caller's `parse`.
 */
import Anthropic from "@anthropic-ai/sdk";
import type {
  BetaContentBlock,
  BetaMessage,
  BetaMessageParam,
  BetaMessageStreamParams,
  BetaToolResultBlockParam,
  BetaToolUnion,
  BetaToolUseBlock,
} from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { getSecret } from "@/lib/secrets";
import { ANTHROPIC_MODEL_CHOICES, anthropicCost } from "../pricing";
import { getAiSettings, type AiSettings } from "../settings";
import {
  AiError,
  addUsage,
  emptyUsage,
  isAbortError,
  type AiProvider,
  type AiUsage,
  type ConnectionCheck,
  type EffortLevel,
  type ModelOption,
  type StructuredResult,
  type StructuredTask,
} from "../types";

export const ANTHROPIC_KEY_SECRET = "anthropic.apiKey";

const FALLBACK_BETA = "server-side-fallback-2026-07-01";
const DEFAULT_MAX_TOKENS = 64_000;
/** Requests in one research loop, counting pause_turn continuations and repairs. */
const MAX_TURNS = 14;
const MAX_REPAIRS = 2;
const MAX_NUDGES = 2;
const MAX_JSON_RETRIES = 2;
/** Upper bound on one fetched page, so a single huge document cannot fill the context. */
const MAX_FETCH_TOKENS = 40_000;

type AnthropicSettings = AiSettings["anthropic"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function createClient(settings: AnthropicSettings): Promise<Anthropic> {
  const options = { maxRetries: 3, timeout: 15 * 60 * 1000 };
  if (settings.authMode === "environment") return new Anthropic(options);
  let apiKey: string | null;
  try {
    apiKey = await getSecret(ANTHROPIC_KEY_SECRET);
  } catch (err) {
    throw new AiError(
      "The saved Claude API key can no longer be read on this computer. Enter it again in Settings.",
      "not_configured",
      { cause: err },
    );
  }
  if (!apiKey) throw new AiError("Add your Claude API key in Settings to use the Claude API.", "not_configured");
  return new Anthropic({ ...options, apiKey });
}

/** Haiku has no server-side fallback; every other current model accepts `fallbacks: "default"`. */
function fallbacksAllowed(settings: AnthropicSettings): boolean {
  return settings.fallbacks && !/haiku/i.test(settings.model);
}

function apiMessage(err: InstanceType<typeof Anthropic.APIError>): string {
  const body: unknown = err.error;
  if (isRecord(body) && isRecord(body.error) && typeof body.error.message === "string") return body.error.message;
  return err.message;
}

export function toAiError(err: unknown, model: string): AiError {
  if (err instanceof AiError) return err;
  if (err instanceof Anthropic.APIUserAbortError) return new AiError("Cancelled.", "cancelled", { cause: err });
  if (err instanceof Anthropic.AuthenticationError) {
    return new AiError("The Claude API did not accept the key. Check it in Settings, or create a new key in the Claude Console.", "auth", { cause: err });
  }
  if (err instanceof Anthropic.PermissionDeniedError) {
    return new AiError(`This key cannot use ${model}: ${apiMessage(err)}`, "auth", { cause: err });
  }
  if (err instanceof Anthropic.NotFoundError) {
    return new AiError(`The Claude API does not know the model "${model}". Pick another model in Settings.`, "bad_request", { cause: err });
  }
  if (err instanceof Anthropic.RateLimitError) {
    return new AiError(`The Claude API rate limit was reached. Wait a minute and try again. (${apiMessage(err)})`, "rate_limit", { cause: err });
  }
  if (err instanceof Anthropic.BadRequestError) {
    const message = apiMessage(err);
    if (/credit balance/i.test(message)) {
      return new AiError("Your Anthropic account is out of credit. Add credit in the Claude Console, then try again.", "auth", { cause: err });
    }
    return new AiError(`The Claude API rejected the request: ${message}`, "bad_request", { cause: err });
  }
  if (err instanceof Anthropic.InternalServerError) {
    return new AiError(`The Claude API is busy or unavailable right now (status ${err.status}). Try again in a few minutes.`, "network", { cause: err });
  }
  if (err instanceof Anthropic.APIConnectionTimeoutError) {
    return new AiError("The Claude API did not respond in time. Try again.", "timeout", { cause: err });
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return new AiError("Could not reach the Claude API. Check your internet connection.", "network", { cause: err });
  }
  if (err instanceof Anthropic.APIError) return new AiError(`Claude API error: ${apiMessage(err)}`, "unknown", { cause: err });
  if (isAbortError(err)) return new AiError("Cancelled.", "cancelled", { cause: err });
  if (err instanceof Error && /could not resolve authentication method/i.test(err.message)) {
    return new AiError(
      "No Claude credentials were found on this computer. Set ANTHROPIC_API_KEY, run `ant auth login`, or save an API key in Settings.",
      "not_configured",
      { cause: err },
    );
  }
  return new AiError(err instanceof Error ? err.message : String(err), "unknown", { cause: err });
}

interface RunState {
  model: string;
  useFallbacks: boolean;
  usage: AiUsage;
  urls: Set<string>;
  notes: string[];
}

function usageOf(msg: BetaMessage): AiUsage {
  const u = msg.usage;
  const cacheWrite = u.cache_creation_input_tokens ?? 0;
  const cacheRead = u.cache_read_input_tokens ?? 0;
  const searches = u.server_tool_use?.web_search_requests ?? 0;
  return {
    inputTokens: u.input_tokens + cacheWrite + cacheRead,
    outputTokens: u.output_tokens,
    webSearches: searches,
    costUsd: anthropicCost(msg.model, { input: u.input_tokens, cacheWrite, cacheRead, output: u.output_tokens, searches }),
  };
}

/** Pages the server tools returned or opened, and pages Claude cited. */
function collectUrls(content: BetaContentBlock[], urls: Set<string>): void {
  for (const block of content) {
    if (block.type === "web_search_tool_result" && Array.isArray(block.content)) {
      for (const result of block.content) urls.add(result.url);
    } else if (block.type === "web_fetch_tool_result" && block.content.type === "web_fetch_result") {
      urls.add(block.content.url);
    } else if (block.type === "text" && block.citations) {
      for (const citation of block.citations) {
        if (citation.type === "web_search_result_location") urls.add(citation.url);
      }
    }
  }
}

function recordFallbacks(msg: BetaMessage, state: RunState): void {
  let switched = false;
  for (const block of msg.content) {
    if (block.type !== "fallback") continue;
    switched = true;
    const note = `${block.from.model} declined part of this request, so ${block.to.model} completed it.`;
    if (!state.notes.includes(note)) state.notes.push(note);
  }
  const servedByFallback = (msg.usage.iterations ?? []).some((entry) => entry.type === "fallback_message");
  if (servedByFallback && !switched) {
    const note = `${msg.model} answered as the fallback model.`;
    if (!state.notes.includes(note)) state.notes.push(note);
  }
}

function record(msg: BetaMessage, state: RunState): void {
  state.usage = addUsage(state.usage, usageOf(msg));
  collectUrls(msg.content, state.urls);
  recordFallbacks(msg, state);
}

const ECHOED_BEFORE_FALLBACK = new Set(["text", "server_tool_use", "web_search_tool_result", "web_fetch_tool_result", "fallback"]);

/**
 * Assistant content to send back on the next turn. Unchanged, except after a
 * mid-output fallback: blocks the declining model produced before the last
 * fallback marker are dropped when the API says not to echo them (thinking,
 * client tool calls, server tool calls without their results).
 */
function echoContent(content: BetaContentBlock[]): BetaContentBlock[] {
  const boundary = content.map((block) => block.type).lastIndexOf("fallback");
  if (boundary < 0) return content;
  const answered = new Set<string>();
  for (const block of content) {
    if (block.type === "web_search_tool_result" || block.type === "web_fetch_tool_result") answered.add(block.tool_use_id);
  }
  return content.filter((block, index) => {
    if (index >= boundary) return true;
    if (block.type === "server_tool_use") return answered.has(block.id);
    return ECHOED_BEFORE_FALLBACK.has(block.type);
  });
}

function textOf(msg: BetaMessage): string {
  return msg.content
    .flatMap((block) => (block.type === "text" ? [block.text] : []))
    .join("")
    .trim();
}

function parseJsonText(text: string): unknown {
  const unfenced = text.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
  return JSON.parse(unfenced);
}

function refusalError(msg: BetaMessage): AiError {
  const details = msg.stop_details;
  const why = details?.explanation ? ` ${details.explanation}` : "";
  return new AiError(`Claude declined this request.${why}`, "refusal");
}

function checkStop(msg: BetaMessage): void {
  if (msg.stop_reason === "refusal") throw refusalError(msg);
  if (msg.stop_reason === "max_tokens") {
    throw new AiError("Claude's answer was cut off at the output limit. Try a quicker research depth or a lower effort.", "truncated");
  }
  if (msg.stop_reason === "model_context_window_exceeded") {
    throw new AiError("The research grew past the model's context window. Try a quicker research depth.", "truncated");
  }
}

interface RequestBase {
  model: string;
  system: string;
  effort: EffortLevel;
  maxTokens: number;
}

/**
 * One streamed request. Adds the fallback opt-in when allowed, and drops it
 * for the rest of the run if the API rejects it for this model or account.
 */
async function send(
  client: Anthropic,
  params: BetaMessageStreamParams,
  state: RunState,
  signal: AbortSignal | undefined,
  onBlock?: (block: BetaContentBlock) => void,
): Promise<BetaMessage> {
  for (;;) {
    const body: BetaMessageStreamParams = state.useFallbacks ? { ...params, betas: [FALLBACK_BETA], fallbacks: "default" } : params;
    try {
      const stream = client.beta.messages.stream(body, { signal });
      if (onBlock) stream.on("contentBlock", onBlock);
      return await stream.finalMessage();
    } catch (err) {
      if (state.useFallbacks && err instanceof Anthropic.BadRequestError && /fallback/i.test(apiMessage(err))) {
        state.useFallbacks = false;
        state.notes.push("Fallback models are not available for this model or account, so the request ran without them.");
        continue;
      }
      throw err;
    }
  }
}

function result<T>(data: T, state: RunState): StructuredResult<T> {
  return {
    data,
    provider: "anthropic",
    model: state.model,
    usage: state.usage,
    visitedUrls: [...state.urls],
    notes: state.notes,
  };
}

function validate<T>(task: StructuredTask<T>, value: unknown): { ok: true; data: T } | { ok: false; problem: string } {
  try {
    return { ok: true, data: task.parse(value) };
  } catch (err) {
    return { ok: false, problem: err instanceof Error ? err.message : String(err) };
  }
}

/** Offline tasks: one request with structured output. */
async function runWithFormat<T>(client: Anthropic, task: StructuredTask<T>, base: RequestBase, state: RunState): Promise<StructuredResult<T>> {
  const msg = await send(
    client,
    {
      model: base.model,
      max_tokens: base.maxTokens,
      system: base.system,
      messages: [{ role: "user", content: task.prompt }],
      thinking: { type: "adaptive" },
      output_config: { effort: base.effort, format: { type: "json_schema", schema: task.jsonSchema } },
    },
    state,
    task.signal,
  );
  record(msg, state);
  checkStop(msg);
  let value: unknown;
  try {
    value = parseJsonText(textOf(msg));
  } catch {
    throw new AiError("Claude returned text instead of the expected JSON result.", "invalid_output");
  }
  const checked = validate(task, value);
  if (!checked.ok) throw new AiError(`Claude's result did not match the expected format: ${checked.problem}`, "invalid_output");
  return result(checked.data, state);
}

function webInstructions(task: StructuredTask<unknown>, maxSearches: number, maxFetches: number): string {
  return [
    `You have the web_search and web_fetch tools. Use at most ${maxSearches} searches and ${maxFetches} page fetches in total.`,
    `When your research is complete, call the ${task.schemaName} tool exactly once with the complete result.`,
    "Do not write the result as a text reply; only the tool call is recorded.",
  ].join(" ");
}

/** Web research: server tools plus a strict submit tool, run until Claude submits a valid result. */
async function runWithTools<T>(client: Anthropic, task: StructuredTask<T>, base: RequestBase, state: RunState): Promise<StructuredResult<T>> {
  const web = task.web;
  if (!web) throw new AiError("Web research was requested without a web budget.", "bad_request");
  const tools: BetaToolUnion[] = [
    { type: "web_search_20260209", name: "web_search", max_uses: web.maxSearches },
    { type: "web_fetch_20260209", name: "web_fetch", max_uses: web.maxFetches, max_content_tokens: MAX_FETCH_TOKENS },
    {
      name: task.schemaName,
      description: task.schemaDescription,
      input_schema: { ...task.jsonSchema, type: "object" },
      strict: true,
      eager_input_streaming: true,
    },
  ];
  const system = `${base.system}\n\n${webInstructions(task, web.maxSearches, web.maxFetches)}`;
  // Cache breakpoint on the case file, so continuations and repairs reread it at the cache price.
  const messages: BetaMessageParam[] = [
    { role: "user", content: [{ type: "text", text: task.prompt, cache_control: { type: "ephemeral" } }] },
  ];

  const onBlock = (block: BetaContentBlock) => {
    if (block.type === "server_tool_use") {
      const input = block.input;
      if (block.name === "web_search" && typeof input.query === "string") task.onProgress?.(`Searching: ${input.query}`);
      if (block.name === "web_fetch" && typeof input.url === "string") task.onProgress?.(`Reading ${input.url}`);
    } else if (block.type === "tool_use" && block.name === task.schemaName) {
      task.onProgress?.("Writing up the findings");
    }
  };

  let repairs = 0;
  let nudges = 0;
  let jsonRetries = 0;
  for (let turn = 0; turn < MAX_TURNS; turn++) {
    let msg: BetaMessage;
    try {
      msg = await send(
        client,
        {
          model: base.model,
          max_tokens: base.maxTokens,
          system,
          messages,
          tools,
          thinking: { type: "adaptive" },
          output_config: { effort: base.effort },
        },
        state,
        task.signal,
        onBlock,
      );
      jsonRetries = 0;
    } catch (err) {
      // With eager input streaming, a tool input that cannot be parsed at all
      // rejects finalMessage(). Re-issue that turn; API errors are rethrown.
      if (err instanceof Anthropic.APIError || err instanceof AiError || isAbortError(err) || jsonRetries >= MAX_JSON_RETRIES) throw err;
      jsonRetries += 1;
      continue;
    }
    record(msg, state);
    checkStop(msg);

    if (msg.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: echoContent(msg.content) });
      continue;
    }

    const toolUses = msg.content.filter((block): block is BetaToolUseBlock => block.type === "tool_use");
    const submit = toolUses.find((block) => block.name === task.schemaName);
    if (submit) {
      const checked = validate(task, submit.input);
      if (checked.ok) return result(checked.data, state);
      if (repairs >= MAX_REPAIRS) {
        throw new AiError(`Claude's result did not match the expected format: ${checked.problem}`, "invalid_output");
      }
      repairs += 1;
      task.onProgress?.("Fixing the format of the findings");
      messages.push({ role: "assistant", content: echoContent(msg.content) });
      messages.push({
        role: "user",
        content: toolUses.map(
          (block): BetaToolResultBlockParam => ({
            type: "tool_result",
            tool_use_id: block.id,
            is_error: true,
            content:
              block.id === submit.id
                ? `The result did not match the schema: ${checked.problem.slice(0, 2000)}. Call ${task.schemaName} again with the corrected, complete result.`
                : `There is no tool named ${block.name}.`,
          }),
        ),
      });
      continue;
    }

    if (toolUses.length > 0) {
      messages.push({ role: "assistant", content: echoContent(msg.content) });
      messages.push({
        role: "user",
        content: toolUses.map(
          (block): BetaToolResultBlockParam => ({
            type: "tool_result",
            tool_use_id: block.id,
            is_error: true,
            content: `There is no tool named ${block.name}. Submit your result with ${task.schemaName}.`,
          }),
        ),
      });
      continue;
    }

    // Finished without the submit tool. Accept a valid JSON reply; otherwise ask again.
    const text = textOf(msg);
    if (text) {
      try {
        const checked = validate(task, parseJsonText(text));
        if (checked.ok) return result(checked.data, state);
      } catch {
        /* not JSON; ask for the tool call */
      }
    }
    if (nudges >= MAX_NUDGES) throw new AiError("Claude finished without submitting a result.", "invalid_output");
    nudges += 1;
    messages.push({ role: "assistant", content: echoContent(msg.content) });
    messages.push({ role: "user", content: `Call the ${task.schemaName} tool now with your complete result. Do not reply in text.` });
  }
  throw new AiError("Claude did not finish the research within the request limit.", "truncated");
}

function supportsApp(model: Anthropic.ModelInfo): boolean {
  const caps = model.capabilities;
  if (!caps) return ANTHROPIC_MODEL_CHOICES.some((choice) => choice.id === model.id);
  return caps.structured_outputs.supported && caps.effort.supported && caps.thinking.supported;
}

export const anthropicProvider: AiProvider = {
  id: "anthropic",

  async run<T>(task: StructuredTask<T>): Promise<StructuredResult<T>> {
    const settings = (await getAiSettings()).anthropic;
    const state: RunState = {
      model: settings.model,
      useFallbacks: fallbacksAllowed(settings),
      usage: emptyUsage(),
      urls: new Set(),
      notes: [],
    };
    const base: RequestBase = {
      model: settings.model,
      system: task.system,
      effort: task.effortOverride ?? settings.effort,
      maxTokens: task.maxOutputTokens ?? DEFAULT_MAX_TOKENS,
    };
    try {
      const client = await createClient(settings);
      task.onProgress?.(task.web ? "Claude is researching" : "Claude is working");
      return task.web ? await runWithTools(client, task, base, state) : await runWithFormat(client, task, base, state);
    } catch (err) {
      throw toAiError(err, settings.model);
    }
  },

  async check(signal?: AbortSignal): Promise<ConnectionCheck> {
    const settings = (await getAiSettings()).anthropic;
    try {
      const client = await createClient(settings);
      const info = await client.models.retrieve(settings.model, null, { signal });
      const source = settings.authMode === "environment" ? "Using the Claude credentials set up on this computer." : "Using the API key saved in this app.";
      return {
        ok: true,
        message: `Connected. ${info.display_name} is available.`,
        detail: settings.fallbacks && !/haiku/i.test(settings.model) ? `${source} Fallback models are on.` : source,
      };
    } catch (err) {
      return { ok: false, message: toAiError(err, settings.model).message };
    }
  },

  async listModels(signal?: AbortSignal): Promise<ModelOption[]> {
    const settings = (await getAiSettings()).anthropic;
    try {
      const client = await createClient(settings);
      const live: ModelOption[] = [];
      for await (const model of client.models.list({ limit: 100 }, { signal })) {
        if (supportsApp(model)) live.push({ id: model.id, label: model.display_name });
      }
      const curated = ANTHROPIC_MODEL_CHOICES.filter((choice) => live.some((model) => model.id === choice.id));
      const rest = live.filter((model) => !curated.some((choice) => choice.id === model.id));
      return curated.length > 0 || rest.length > 0 ? [...curated, ...rest] : ANTHROPIC_MODEL_CHOICES;
    } catch {
      return ANTHROPIC_MODEL_CHOICES;
    }
  },
};
