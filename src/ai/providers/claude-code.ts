/**
 * Claude subscription via the user's installed Claude Code CLI.
 *
 * The app never sees or stores the user's Claude login: it runs
 * `claude -p` in a temporary folder and Claude Code authenticates itself.
 * --safe-mode keeps the user's CLAUDE.md, hooks, plugins and MCP servers out
 * of the run; only the web tools are enabled, and only for research.
 */
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { getAiSettings } from "../settings";
import {
  AiError,
  emptyUsage,
  type AiProvider,
  type ConnectionCheck,
  type ModelOption,
  type StructuredResult,
  type StructuredTask,
} from "../types";
import { cliEnv, extractUrls, resolveBinary, runCli, stderrTail } from "./cli";

const NOT_INSTALLED =
  "Claude Code is not installed, or the app cannot find it. Install it from claude.com/claude-code, sign in by running `claude` once in a terminal, then test the connection again. You can also set the path to the claude program in Settings.";
const NOT_SIGNED_IN =
  "Claude Code is not signed in. Open a terminal, run `claude`, and sign in with your Claude account.";

interface ResultLine {
  type: "result";
  subtype?: string;
  is_error?: boolean;
  result?: string;
  structured_output?: unknown;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
    server_tool_use?: { web_search_requests?: number; web_fetch_requests?: number } | null;
  };
  modelUsage?: Record<string, unknown>;
  errors?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isResultLine(value: unknown): value is ResultLine {
  return isRecord(value) && value.type === "result";
}

function authProblem(text: string): boolean {
  return /not logged in|please run \/login|invalid api key|authentication|oauth token|log in to|login required|401/i.test(text);
}

async function binary(): Promise<string> {
  const settings = (await getAiSettings()).claudeCode;
  const bin = await resolveBinary("claude", settings.binaryPath);
  if (!bin) throw new AiError(NOT_INSTALLED, "cli_missing");
  return bin;
}

/** Report web tool calls as progress and remember the URLs they touched. */
function watchStream(line: string, urls: Set<string>, onProgress?: (msg: string) => void): void {
  let event: unknown;
  try {
    event = JSON.parse(line);
  } catch {
    return;
  }
  if (!isRecord(event) || !isRecord(event.message)) return;
  const content = event.message.content;
  if (!Array.isArray(content)) return;
  for (const block of content) {
    if (!isRecord(block)) continue;
    if (event.type === "assistant" && block.type === "tool_use" && isRecord(block.input)) {
      if (block.name === "WebSearch" && typeof block.input.query === "string") onProgress?.(`Searching: ${block.input.query}`);
      if (block.name === "WebFetch" && typeof block.input.url === "string") {
        urls.add(block.input.url);
        onProgress?.(`Reading ${block.input.url}`);
      }
    }
    if (event.type === "user" && block.type === "tool_result") {
      const text = typeof block.content === "string" ? block.content : JSON.stringify(block.content ?? "");
      for (const url of extractUrls(text)) urls.add(url);
    }
  }
}

export const claudeCodeProvider: AiProvider = {
  id: "claude-code",

  async run<T>(task: StructuredTask<T>): Promise<StructuredResult<T>> {
    const settings = (await getAiSettings()).claudeCode;
    const bin = await binary();
    const effort = task.effortOverride ?? settings.effort;
    const dir = await mkdtemp(path.join(os.tmpdir(), "bc-claude-"));
    const urls = new Set<string>();
    try {
      const web = task.web;
      const system = web
        ? `${task.system}\n\nYou may run up to ${web.maxSearches} web searches and fetch up to ${web.maxFetches} pages.`
        : task.system;
      const args = [
        "-p",
        "--output-format",
        "stream-json",
        "--verbose",
        "--json-schema",
        JSON.stringify(task.jsonSchema),
        "--system-prompt",
        system,
        "--no-session-persistence",
        "--safe-mode",
        "--strict-mcp-config",
        "--permission-mode",
        "dontAsk",
        "--tools",
        web ? "WebSearch,WebFetch" : "",
        ...(web ? ["--allowedTools", "WebSearch", "WebFetch"] : []),
        ...(settings.model ? ["--model", settings.model] : []),
        "--effort",
        effort,
      ];
      task.onProgress?.("Claude Code is working");
      const out = await runCli({
        bin,
        args,
        input: task.prompt,
        cwd: dir,
        env: await cliEnv(),
        timeoutMs: (web ? 60 : 15) * 60 * 1000,
        signal: task.signal,
        onLine: (line) => watchStream(line, urls, task.onProgress),
      });

      let result: ResultLine | null = null;
      for (const raw of out.stdout.split("\n").reverse()) {
        if (!raw.trim()) continue;
        try {
          const parsed: unknown = JSON.parse(raw);
          if (isResultLine(parsed)) {
            result = parsed;
            break;
          }
        } catch {
          /* not a JSON line */
        }
      }

      if (!result) {
        const tail = stderrTail(out.stderr) || stderrTail(out.stdout);
        if (authProblem(tail)) throw new AiError(NOT_SIGNED_IN, "auth");
        throw new AiError(`Claude Code exited without a result (exit code ${out.code ?? "none"}). ${tail}`.trim(), "cli_failed");
      }
      if (result.is_error || (result.subtype && result.subtype !== "success")) {
        const message = typeof result.result === "string" && result.result ? result.result : JSON.stringify(result.errors ?? result.subtype);
        if (authProblem(message)) throw new AiError(NOT_SIGNED_IN, "auth");
        if (/usage limit|rate limit|quota/i.test(message)) throw new AiError(`Claude Code reports a usage limit: ${message}`, "rate_limit");
        if (result.subtype === "error_max_turns") throw new AiError("Claude Code stopped before finishing (turn limit).", "truncated");
        throw new AiError(`Claude Code reported an error: ${message}`, "cli_failed");
      }

      let value: unknown = result.structured_output;
      if (value === undefined && typeof result.result === "string") {
        try {
          value = JSON.parse(result.result.replace(/^```(?:json)?\s*|\s*```$/g, ""));
        } catch {
          throw new AiError("Claude Code returned text instead of the expected JSON result.", "invalid_output");
        }
      }
      let data: T;
      try {
        data = task.parse(value);
      } catch (err) {
        throw new AiError(`Claude Code's result did not match the expected format: ${(err as Error).message}`, "invalid_output", { cause: err });
      }

      const usage = emptyUsage();
      const u = result.usage;
      if (u) {
        usage.inputTokens = (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0);
        usage.outputTokens = u.output_tokens ?? 0;
        usage.webSearches = u.server_tool_use?.web_search_requests ?? 0;
      }
      const model = Object.keys(result.modelUsage ?? {})[0] ?? (settings.model || "claude-code-default");
      return { data, provider: "claude-code", model, usage, visitedUrls: [...urls], notes: [] };
    } finally {
      await rm(dir, { recursive: true, force: true }).catch(() => undefined);
    }
  },

  async check(signal?: AbortSignal): Promise<ConnectionCheck> {
    const bin = await binary();
    const env = await cliEnv();
    const version = await runCli({ bin, args: ["--version"], input: "", cwd: os.tmpdir(), env, timeoutMs: 30_000, signal });
    const status = await runCli({ bin, args: ["auth", "status", "--json"], input: "", cwd: os.tmpdir(), env, timeoutMs: 30_000, signal });
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(status.stdout);
    } catch {
      /* older CLI without --json */
    }
    const versionText = version.stdout.trim().split("\n")[0] ?? "";
    if (isRecord(parsed)) {
      if (parsed.loggedIn !== true) return { ok: false, message: NOT_SIGNED_IN, detail: versionText };
      const plan = typeof parsed.subscriptionType === "string" && parsed.subscriptionType ? parsed.subscriptionType : null;
      const method = typeof parsed.authMethod === "string" ? parsed.authMethod : "";
      const how =
        method === "claude.ai"
          ? `Signed in with a Claude${plan ? ` ${plan.charAt(0).toUpperCase()}${plan.slice(1)}` : ""} subscription.`
          : "Signed in to Claude Code.";
      return { ok: true, message: how, detail: versionText };
    }
    if (status.code === 0) return { ok: true, message: "Claude Code is installed and signed in.", detail: versionText };
    return { ok: false, message: NOT_SIGNED_IN, detail: stderrTail(status.stderr) || versionText };
  },

  async listModels(): Promise<ModelOption[]> {
    return [
      { id: "", label: "Claude Code default" },
      { id: "opus", label: "Opus (latest)" },
      { id: "sonnet", label: "Sonnet (latest)" },
      { id: "haiku", label: "Haiku (latest)" },
    ];
  },
};
