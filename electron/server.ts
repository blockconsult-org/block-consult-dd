/**
 * Runs the Next.js standalone server inside the Electron main process.
 *
 * This mirrors the server.js that `next build` writes into .next/standalone
 * (Next 15.5): the same config (required-server-files.json with distDir
 * "./.next"), process.chdir into the server folder, require("next"), then
 * startServer(). server.js itself is not loaded because Next calls
 * process.exit on startup errors; here those calls become a rejected promise so
 * main.ts can show an error dialog instead of the app vanishing.
 */
import fs from "node:fs";
import { createRequire } from "node:module";
import net from "node:net";
import path from "node:path";

interface StartServerOptions {
  dir: string;
  isDev: boolean;
  config: Record<string, unknown>;
  hostname: string;
  port: number;
  allowRetry: boolean;
  keepAliveTimeout?: number;
}

interface StartServerModule {
  startServer(options: StartServerOptions): Promise<unknown>;
}

export interface HealthStatus {
  /** Whether route handlers saw globalThis.__bcDesktop. */
  desktop: boolean;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStartServerModule(value: unknown): value is StartServerModule {
  return isRecord(value) && typeof value.startServer === "function";
}

/** Raised when Next.js calls process.exit while the server is starting. */
export class ServerExitError extends Error {
  readonly exitCode: string;

  constructor(code: number | string | null | undefined) {
    super(`The Next.js server stopped while starting (exit code ${String(code ?? 0)}). The log shows the cause.`);
    this.name = "ServerExitError";
    this.exitCode = String(code ?? 0);
  }
}

/** Asks the OS for a free TCP port on `host`, then releases it for the server. */
export function findFreePort(host: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.unref();
    probe.once("error", reject);
    probe.listen(0, host, () => {
      const address = probe.address();
      const port = typeof address === "object" && address ? address.port : 0;
      probe.close(() => (port > 0 ? resolve(port) : reject(new Error("Could not find a free port"))));
    });
  });
}

/**
 * The Next config that standalone server.js embeds, with one change: the server
 * folder is part of the installed (and on macOS, signed) app, so Next must not
 * write to it. With isrFlushToDisk off, Next keeps its image-optimizer and
 * ISR/fetch caches in memory instead of writing them to <server>/.next/cache.
 */
export function readStandaloneConfig(serverDir: string): Record<string, unknown> {
  const manifestPath = path.join(serverDir, ".next", "required-server-files.json");
  const manifest: unknown = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  if (!isRecord(manifest) || !isRecord(manifest.config)) {
    throw new Error(`${manifestPath} has no "config" object`);
  }
  const config = manifest.config;
  const experimental = isRecord(config.experimental) ? config.experimental : {};
  return { ...config, distDir: "./.next", experimental: { ...experimental, isrFlushToDisk: false } };
}

/** Absolute path of the Prisma query engine library for this OS and CPU, if present. */
export function findPrismaEngine(serverDir: string): string | null {
  const clientDir = path.join(serverDir, "node_modules", ".prisma", "client");
  let names: string[];
  try {
    names = fs.readdirSync(clientDir);
  } catch {
    return null;
  }
  const engines = names.filter((name) => /^(lib)?query_engine-.+\.node$/.test(name));
  const expected =
    process.platform === "darwin"
      ? process.arch === "arm64"
        ? "libquery_engine-darwin-arm64.dylib.node"
        : "libquery_engine-darwin.dylib.node"
      : process.platform === "win32"
        ? "query_engine-windows.dll.node"
        : null;
  if (expected && engines.includes(expected)) return path.join(clientDir, expected);
  const only = engines.length === 1 ? engines[0] : undefined;
  return only ? path.join(clientDir, only) : null;
}

export async function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Starts the server. Callers must set process.env (NODE_ENV, PORT, DATABASE_URL,
 * ...) and globalThis.__bcDesktop before calling this.
 */
export async function startNextServer(options: { serverDir: string; hostname: string; port: number }): Promise<void> {
  const { serverDir, hostname, port } = options;
  const config = readStandaloneConfig(serverDir);
  process.env.__NEXT_PRIVATE_STANDALONE_CONFIG = JSON.stringify(config);
  process.chdir(serverDir);
  const serverRequire = createRequire(path.join(serverDir, "server.js"));

  const originalExit = process.exit;
  let rejectStartup: ((error: Error) => void) | undefined;
  const exitRequested = new Promise<never>((_, reject) => {
    rejectStartup = reject;
  });
  process.exit = (code?: number | string | null): never => {
    const error = new ServerExitError(code);
    rejectStartup?.(error);
    throw error;
  };

  try {
    serverRequire("next");
    const startServerModule: unknown = serverRequire("next/dist/server/lib/start-server");
    if (!isStartServerModule(startServerModule)) {
      throw new Error("next/dist/server/lib/start-server does not export startServer");
    }
    const keepAlive = Number.parseInt(process.env.KEEP_ALIVE_TIMEOUT ?? "", 10);
    await Promise.race([
      startServerModule.startServer({
        dir: serverDir,
        isDev: false,
        config,
        hostname,
        port,
        allowRetry: false,
        keepAliveTimeout: Number.isFinite(keepAlive) && keepAlive >= 0 ? keepAlive : undefined,
      }),
      exitRequested,
    ]);
  } finally {
    process.exit = originalExit;
  }
}

/** Polls GET /api/health with the session cookie until it reports ok. */
export async function waitForHealth(
  origin: string,
  cookieHeader: string,
  timeoutMs: number,
  fetchImpl: typeof fetch,
): Promise<HealthStatus> {
  const deadline = Date.now() + timeoutMs;
  let lastProblem = "no response yet";
  while (Date.now() < deadline) {
    try {
      const response = await fetchImpl(`${origin}/api/health`, {
        headers: { cookie: cookieHeader },
        signal: AbortSignal.timeout(5_000),
      });
      const body: unknown = await response.json().catch(() => null);
      if (response.ok && isRecord(body) && body.ok === true) return { desktop: body.desktop === true };
      const detail = isRecord(body) && typeof body.error === "string" ? `: ${body.error}` : "";
      lastProblem = `HTTP ${response.status}${detail}`;
    } catch (error) {
      lastProblem = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`The server did not report healthy within ${Math.round(timeoutMs / 1000)} s (last result: ${lastProblem}).`);
}
