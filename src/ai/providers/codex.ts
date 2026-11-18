/**
 * ChatGPT subscription via the user's installed Codex CLI.
 *
 * Runs `codex exec` in a temporary folder with a read-only sandbox, no user
 * config, no saved session, and the output schema written to a file. Codex
 * signs in on its own (`codex login`); the app never handles that login.
 */
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
import { cliEnv, resolveBinary, runCli, stderrTail } from "./cli";

const NOT_INSTALLED =
  "Codex is not installed, or the app cannot find it. Install it with `npm install -g @openai/codex`, run `codex login` in a terminal, then test the connection again. You can also set the path to the codex program in Settings.";
const NOT_SIGNED_IN = "Codex is not signed in. Run `codex login` in a terminal and sign in with your ChatGPT account.";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function authProblem(text: string): boolean {
  return /not logged in|codex login|unauthorized|401|token.*expired|sign in/i.test(text);
}

async function binary(): Promise<string> {
  const settings = (await getAiSettings()).codex;
  const bin = await resolveBinary("codex", settings.binaryPath);
  if (!bin) throw new AiError(NOT_INSTALLED, "cli_missing");
  return bin;
}

interface CodexEvents {
  lastAgentMessage: string;
  error: string;
  inputTokens: number;
  outputTokens: number;
  searches: number;
}

function watchEvent(line: string, state: CodexEvents, onProgress?: (msg: string) => void): void {
  let event: unknown;
  try {
    event = JSON.parse(line);
  } catch {
    return;
  }
  if (!isRecord(event)) return;
  const item = isRecord(event.item) ? event.item : null;
  if (item && item.type === "web_search" && event.type === "item.started") {
    state.searches += 1;
    if (typeof item.query === "string" && item.query) onProgress?.(`Searching: ${item.query}`);
  }
  if (item && item.type === "agent_message" && event.type === "item.completed" && typeof item.text === "string") {
    state.lastAgentMessage = item.text;
  }
  if (event.type === "turn.completed" && isRecord(event.usage)) {
    const u = event.usage;
    state.inputTokens += typeof u.input_tokens === "number" ? u.input_tokens : 0;
    state.outputTokens += typeof u.output_tokens === "number" ? u.output_tokens : 0;
  }
  if (event.type === "turn.failed" && isRecord(event.error) && typeof event.error.message === "string") {
    state.error = event.error.message;
  }
  if (event.type === "error" && typeof event.message === "string") state.error = event.message;
}

export const codexProvider: AiProvider = {
  id: "codex",

  async run<T>(task: StructuredTask<T>): Promise<StructuredResult<T>> {
    const settings = (await getAiSettings()).codex;
    const bin = await binary();
    const effort = task.effortOverride ?? settings.effort;
    const dir = await mkdtemp(path.join(os.tmpdir(), "bc-codex-"));
    try {
      const schemaPath = path.join(dir, "output-schema.json");
      const lastMessagePath = path.join(dir, "last-message.json");
      await writeFile(schemaPath, JSON.stringify(task.jsonSchema), "utf8");

      const web = task.web;
      const budget = web ? `\n\nYou may run up to ${web.maxSearches} web searches.` : "";
      const input = `${task.system}${budget}\n\n${task.prompt}\n\nReply with the JSON object only.`;
      const args = [
        "exec",
        "--skip-git-repo-check",
        "--ephemeral",
        "--ignore-user-config",
        "--ignore-rules",
        // Keep the user's hooks, plugins, connected apps and sub-agents out of the run.
        "--disable",
        "hooks",
        "--disable",
        "plugins",
        "--disable",
        "apps",
        "--disable",
        "multi_agent",
        "--sandbox",
        "read-only",
        "--cd",
        dir,
        "--output-schema",
        schemaPath,
        "--output-last-message",
        lastMessagePath,
        "--json",
        "--color",
        "never",
        "-c",
        `web_search=${web ? "live" : "disabled"}`,
        "-c",
        `model_reasoning_effort=${effort}`,
        ...(settings.model ? ["--model", settings.model] : []),
        "-",
      ];

      const state: CodexEvents = { lastAgentMessage: "", error: "", inputTokens: 0, outputTokens: 0, searches: 0 };
      task.onProgress?.("Codex is working");
      const out = await runCli({
        bin,
        args,
        input,
        cwd: dir,
        env: await cliEnv(),
        timeoutMs: (web ? 60 : 15) * 60 * 1000,
        signal: task.signal,
        onLine: (line) => watchEvent(line, state, task.onProgress),
      });

      let text = await readFile(lastMessagePath, "utf8").catch(() => "");
      if (!text.trim()) text = state.lastAgentMessage;
      if (!text.trim()) {
        const reason = state.error || stderrTail(out.stderr);
        if (authProblem(reason)) throw new AiError(NOT_SIGNED_IN, "auth");
        if (/usage limit|rate limit|quota/i.test(reason)) throw new AiError(`Codex reports a usage limit: ${reason}`, "rate_limit");
        throw new AiError(`Codex finished without a result (exit code ${out.code ?? "none"}). ${reason}`.trim(), "cli_failed");
      }

      let value: unknown;
      try {
        value = JSON.parse(text.trim().replace(/^```(?:json)?\s*|\s*```$/g, ""));
      } catch {
        throw new AiError("Codex returned text instead of the expected JSON result.", "invalid_output");
      }
      let data: T;
      try {
        data = task.parse(value);
      } catch (err) {
        throw new AiError(`Codex's result did not match the expected format: ${(err as Error).message}`, "invalid_output", { cause: err });
      }

      const usage = emptyUsage();
      usage.inputTokens = state.inputTokens;
      usage.outputTokens = state.outputTokens;
      usage.webSearches = state.searches;
      return {
        data,
        provider: "codex",
        model: settings.model || "codex-default",
        usage,
        // Codex does not report which pages its searches returned.
        visitedUrls: [],
        notes: [],
      };
    } finally {
      await rm(dir, { recursive: true, force: true }).catch(() => undefined);
    }
  },

  async check(signal?: AbortSignal): Promise<ConnectionCheck> {
    const bin = await binary();
    const env = await cliEnv();
    const version = await runCli({ bin, args: ["--version"], input: "", cwd: os.tmpdir(), env, timeoutMs: 30_000, signal });
    const status = await runCli({ bin, args: ["login", "status"], input: "", cwd: os.tmpdir(), env, timeoutMs: 30_000, signal });
    const text = `${status.stdout}\n${status.stderr}`;
    const versionText = version.stdout.trim().split("\n")[0] ?? "";
    if (status.code === 0 && /logged in/i.test(text)) {
      const viaChatGpt = /chatgpt/i.test(text);
      return {
        ok: true,
        message: viaChatGpt ? "Signed in with a ChatGPT account." : "Codex is signed in with an API key, so usage is billed to that key.",
        detail: versionText,
      };
    }
    return { ok: false, message: NOT_SIGNED_IN, detail: stderrTail(text) || versionText };
  },

  async listModels(): Promise<ModelOption[]> {
    return [
      { id: "", label: "Codex default" },
      { id: "gpt-6.1-sol", label: "gpt-6.1-sol" },
      { id: "gpt-6-astra", label: "gpt-6-astra" },
      { id: "gpt-6.1-terra", label: "gpt-6.1-terra" },
      { id: "gpt-6-luna", label: "gpt-6-luna" },
    ];
  },
};
