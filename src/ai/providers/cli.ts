/**
 * Helpers for running the user's own Claude Code and Codex CLIs.
 *
 * A desktop app started from the Dock or Start menu gets a minimal PATH, so
 * the CLIs are looked up on PATH, on the login shell's PATH, and in the
 * folders their installers use. Children get a cleaned environment: this
 * app's own variables, API keys and nested-session markers are removed, so the
 * CLI runs on the subscription the user signed in with.
 */
import { spawn } from "node:child_process";
import { constants as fsConstants } from "node:fs";
import { access, readdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { AiError } from "../types";

const IS_WINDOWS = process.platform === "win32";

let loginShellPathPromise: Promise<string> | null = null;

/** PATH as the user's login shell sets it (macOS/Linux). Cached per process. */
function loginShellPath(): Promise<string> {
  if (IS_WINDOWS) return Promise.resolve("");
  loginShellPathPromise ??= new Promise((resolve) => {
    const shell = process.env.SHELL || (process.platform === "darwin" ? "/bin/zsh" : "/bin/bash");
    const marker = "__BC_PATH__";
    let out = "";
    try {
      const child = spawn(shell, ["-ilc", `printf '${marker}%s${marker}' "$PATH"`], {
        stdio: ["ignore", "pipe", "ignore"],
        env: { ...process.env, TERM: "dumb" },
        timeout: 8000,
      });
      child.stdout.on("data", (chunk: Buffer) => {
        out += chunk.toString("utf8");
      });
      child.on("error", () => resolve(""));
      child.on("close", () => {
        const match = out.match(new RegExp(`${marker}(.*?)${marker}`, "s"));
        resolve(match?.[1] ?? "");
      });
    } catch {
      resolve("");
    }
  });
  return loginShellPathPromise;
}

async function nvmBinDirs(home: string): Promise<string[]> {
  const root = path.join(home, ".nvm", "versions", "node");
  try {
    const versions = await readdir(root);
    return versions.sort().reverse().map((v) => path.join(root, v, "bin"));
  } catch {
    return [];
  }
}

/**
 * Folders the CLI installers use. Takes the home folder as a parameter: if a
 * variable in this module holds `os.homedir()`, Next's build-time file tracer
 * resolves these paths and scans every one that exists on the build machine.
 * On Windows runners the home folder is on another drive than the project, so
 * the tracer does not treat it as outside the project, and the scan fails with
 * EPERM inside AppData.
 */
async function commonDirs(home: string): Promise<string[]> {
  if (IS_WINDOWS) {
    const appData = process.env.APPDATA ?? path.join(home, "AppData", "Roaming");
    const localAppData = process.env.LOCALAPPDATA ?? path.join(home, "AppData", "Local");
    return [
      path.join(home, ".local", "bin"),
      path.join(appData, "npm"),
      path.join(localAppData, "Programs", "claude"),
      path.join(localAppData, "Microsoft", "WindowsApps"),
      path.join(home, ".bun", "bin"),
      path.join(home, "scoop", "shims"),
    ];
  }
  return [
    path.join(home, ".local", "bin"),
    path.join(home, ".claude", "local"),
    path.join(home, ".npm-global", "bin"),
    path.join(home, ".bun", "bin"),
    path.join(home, ".volta", "bin"),
    path.join(home, ".asdf", "shims"),
    path.join(home, "Library", "pnpm"),
    "/opt/homebrew/bin",
    "/usr/local/bin",
    "/usr/bin",
    "/bin",
    ...(await nvmBinDirs(home)),
  ];
}

function splitPath(value: string | undefined): string[] {
  return (value ?? "").split(path.delimiter).filter(Boolean);
}

/** PATH for child processes: the app's PATH, the login shell's PATH and the common install folders. */
export async function childPath(): Promise<string> {
  const dirs = [...splitPath(process.env.PATH), ...splitPath(await loginShellPath()), ...(await commonDirs(os.homedir()))];
  return [...new Set(dirs)].join(path.delimiter);
}

async function isExecutable(file: string): Promise<boolean> {
  try {
    await access(file, IS_WINDOWS ? fsConstants.F_OK : fsConstants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/** Locate a CLI. Returns null when it is not installed anywhere we look. */
export async function resolveBinary(name: "claude" | "codex", override: string): Promise<string | null> {
  if (override) return (await isExecutable(override)) ? override : null;
  const names = IS_WINDOWS ? [`${name}.exe`, `${name}.cmd`, `${name}.bat`] : [name];
  for (const dir of splitPath(await childPath())) {
    for (const candidate of names) {
      const file = path.join(dir, candidate);
      if (await isExecutable(file)) return file;
    }
  }
  return null;
}

/** Variables never passed to a CLI child process. */
const STRIPPED_ENV = [
  /^BC_/,
  /^DATABASE_URL$/,
  /^STORAGE_DIR$/,
  /^APP_ACCESS_TOKEN$/,
  /^PRISMA_/,
  /^PORT$/,
  /^HOSTNAME$/,
  /^NODE_OPTIONS$/,
  /^NODE_ENV$/,
  /^NEXT_/,
  /^__NEXT/,
  /^ELECTRON_/,
  /^CLAUDECODE$/,
  /^CLAUDE_CODE_/,
  /^ANTHROPIC_(API_KEY|AUTH_TOKEN|BASE_URL)$/,
  /^OPENAI_(API_KEY|BASE_URL|ORG_ID|PROJECT_ID)$/,
];

export async function cliEnv(): Promise<NodeJS.ProcessEnv> {
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const key of Object.keys(env)) {
    if (env[key] === undefined || STRIPPED_ENV.some((re) => re.test(key))) delete env[key];
  }
  env.PATH = await childPath();
  env.NO_COLOR = "1";
  return env;
}

/** Quote one argument for cmd.exe (only used for .cmd/.bat shims on Windows). */
function quoteForCmd(arg: string): string {
  if (arg === "") return '""';
  if (!/[\s"&|<>^%!()]/.test(arg)) return arg;
  return `"${arg.replace(/"/g, '""')}"`;
}

export interface CliRunOptions {
  bin: string;
  args: string[];
  input: string;
  cwd: string;
  env: NodeJS.ProcessEnv;
  timeoutMs: number;
  signal?: AbortSignal;
  onLine?: (line: string) => void;
}

export interface CliRunResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

const MAX_STDOUT = 32 * 1024 * 1024;
const MAX_STDERR = 1024 * 1024;

export function runCli(options: CliRunOptions): Promise<CliRunResult> {
  const { bin, args, input, cwd, env, timeoutMs, signal, onLine } = options;
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new AiError("Cancelled.", "cancelled"));
      return;
    }
    const useShell = IS_WINDOWS && /\.(cmd|bat)$/i.test(bin);
    const child = useShell
      ? spawn([quoteForCmd(bin), ...args.map(quoteForCmd)].join(" "), {
          cwd,
          env,
          shell: true,
          windowsHide: true,
          stdio: ["pipe", "pipe", "pipe"],
        })
      : spawn(bin, args, { cwd, env, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });

    let stdout = "";
    let stderr = "";
    let pending = "";
    let settled = false;
    let timedOut = false;
    let cancelled = false;

    const kill = () => {
      if (child.exitCode !== null || child.killed) return;
      child.kill("SIGTERM");
      setTimeout(() => {
        if (child.exitCode === null) child.kill("SIGKILL");
      }, 5000).unref();
    };
    const timer = setTimeout(() => {
      timedOut = true;
      kill();
    }, timeoutMs);
    const onAbort = () => {
      cancelled = true;
      kill();
    };
    signal?.addEventListener("abort", onAbort, { once: true });

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      fn();
    };

    child.stdout.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      if (stdout.length < MAX_STDOUT) stdout += text;
      if (!onLine) return;
      pending += text;
      let newline = pending.indexOf("\n");
      while (newline >= 0) {
        const lineText = pending.slice(0, newline).trim();
        pending = pending.slice(newline + 1);
        if (lineText) onLine(lineText);
        newline = pending.indexOf("\n");
      }
    });
    child.stderr.on("data", (chunk: Buffer) => {
      if (stderr.length < MAX_STDERR) stderr += chunk.toString("utf8");
    });
    child.on("error", (err) => {
      finish(() => reject(new AiError(`Could not start ${path.basename(bin)}: ${err.message}`, "cli_missing", { cause: err })));
    });
    child.on("close", (code) => {
      if (onLine && pending.trim()) onLine(pending.trim());
      finish(() => {
        if (cancelled) reject(new AiError("Cancelled.", "cancelled"));
        else if (timedOut) reject(new AiError(`${path.basename(bin)} did not finish within ${Math.round(timeoutMs / 60000)} minutes.`, "timeout"));
        else resolve({ code, stdout, stderr });
      });
    });

    child.stdin.on("error", () => {
      /* the process exited before reading all input; the close handler reports it */
    });
    child.stdin.end(input, "utf8");
  });
}

/** Last non-empty lines of stderr, for error messages. */
export function stderrTail(stderr: string, lines = 6): string {
  return stderr
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(-lines)
    .join("\n");
}

/** Pull http(s) URLs out of free text (tool results, search listings). */
export function extractUrls(text: string): string[] {
  const found = text.match(/https?:\/\/[^\s"'<>\])}]+/g) ?? [];
  return found.map((u) => u.replace(/[.,;:]+$/, ""));
}
