/**
 * BC_SMOKE_TEST=1: checks the in-process server and the desktop bridge without
 * showing a window, then writes JSON to <userData>/logs/smoke-test.json and to
 * stdout. main.ts exits with 0 when every check passed, 1 otherwise.
 */
import fs from "node:fs";
import { once } from "node:events";
import http from "node:http";
import path from "node:path";
import { BrowserWindow, app } from "electron";
import type { DesktopBridge } from "../src/lib/desktop-bridge";
import { isRecord, withTimeout } from "./server";
import { protectUnsavedChanges } from "./window-behavior";

export type KeychainMode = "mock" | "system";

export interface SmokeContext {
  origin: string;
  port: number;
  cookieHeader: string;
  bridge: DesktopBridge;
  databaseFile: string;
  logsDir: string;
  /** Folder the Next.js server runs from; the app must not write to it. */
  serverDir: string;
  keychain: KeychainMode;
  webPreferences: Electron.WebPreferences;
  fetchImpl: typeof fetch;
}

export interface SmokeCheck {
  name: string;
  ok: boolean;
  skipped: boolean;
  detail: string;
  ms: number;
}

export interface SmokeResult {
  ok: boolean;
  /** HTTP status of GET / with the session cookie (0 if never reached). */
  status: number;
  /** Milliseconds since the main process started. */
  ms: number;
  appVersion: string;
  electron: string;
  node: string;
  platform: string;
  arch: string;
  packaged: boolean;
  keychain: KeychainMode;
  checks: SmokeCheck[];
  error?: string;
}

const SAMPLE_HTML = `<!doctype html><html><head><meta charset="utf-8"><title>Smoke test</title>
<style>@page { size: A4; margin: 20mm } body { font-family: sans-serif }</style></head>
<body><h1>Block Consult DD</h1><p>PDF smoke test.</p>
<img alt="" src="https://example.invalid/blocked.png"></body></html>`;

class SkipCheck extends Error {}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function check(name: string, run: () => Promise<string>): Promise<SmokeCheck> {
  const started = Date.now();
  try {
    const detail = await run();
    return { name, ok: true, skipped: false, detail, ms: Date.now() - started };
  } catch (error) {
    const skipped = error instanceof SkipCheck;
    return { name, ok: skipped, skipped, detail: message(error), ms: Date.now() - started };
  }
}

/** Entries under `dir` (node_modules skipped) modified at or after `sinceMs`. */
function changedSince(dir: string, sinceMs: number, limit = 5): string[] {
  const changed: string[] = [];
  const walk = (current: string): void => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (changed.length >= limit || entry.name === "node_modules") continue;
      const full = path.join(current, entry.name);
      if (fs.lstatSync(full).mtimeMs >= sinceMs) changed.push(path.relative(dir, full));
      if (entry.isDirectory()) walk(full);
    }
  };
  walk(dir);
  return changed;
}

function statusWithHostHeader(port: number, host: string, pathname: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const request = http.request({ host: "127.0.0.1", port, path: pathname, method: "GET", headers: { host } }, (response) => {
      response.resume();
      resolve(response.statusCode ?? 0);
    });
    request.setTimeout(10_000, () => request.destroy(new Error("request timed out")));
    request.on("error", reject);
    request.end();
  });
}

async function checkWindow(ctx: SmokeContext): Promise<string> {
  const win = new BrowserWindow({ show: false, width: 1440, height: 900, webPreferences: ctx.webPreferences });
  try {
    await withTimeout(win.loadURL(`${ctx.origin}/`), 30_000, "the app window did not finish loading within 30 s");
    const probe: unknown = await win.webContents.executeJavaScript(
      `({ isDesktop: window.bcDesktop?.isDesktop === true, platform: window.bcDesktop?.platform,
          appVersion: window.bcDesktop?.appVersion, title: document.title,
          textLength: document.body ? document.body.innerText.length : 0 })`,
    );
    if (!isRecord(probe) || probe.isDesktop !== true) throw new Error(`window.bcDesktop is missing: ${JSON.stringify(probe)}`);
    if (typeof probe.textLength !== "number" || probe.textLength === 0) throw new Error("the page rendered no text");
    // The screenshot is a debugging aid; hidden windows may never paint, so it is optional.
    const image = await withTimeout(win.webContents.capturePage(), 10_000, "capturePage timed out").catch(() => null);
    if (image && !image.isEmpty()) fs.writeFileSync(path.join(ctx.logsDir, "smoke-window.png"), image.toPNG());
    return `title "${String(probe.title)}", bcDesktop ${String(probe.platform)} ${String(probe.appVersion)}`;
  } finally {
    if (!win.isDestroyed()) win.destroy();
  }
}

function describeRuntime(keychain: KeychainMode): Omit<SmokeResult, "ok" | "status" | "ms" | "checks" | "error"> {
  return {
    appVersion: app.getVersion(),
    electron: process.versions.electron,
    node: process.versions.node,
    platform: process.platform,
    arch: process.arch,
    packaged: app.isPackaged,
    keychain,
  };
}

async function checkUnsavedChanges(ctx: SmokeContext): Promise<string> {
  const win = new BrowserWindow({ show: false, webPreferences: ctx.webPreferences });
  let choices = 0;
  protectUnsavedChanges(win, () => ++choices === 2);
  try {
    await withTimeout(win.loadURL(`${ctx.origin}/`), 30_000, "draft-check window did not load");
    await win.webContents.executeJavaScript(`window.addEventListener("beforeunload", event => {
      event.preventDefault(); event.returnValue = "";
    });`);
    const prevented = once(win.webContents, "will-prevent-unload");
    win.close();
    await withTimeout(prevented, 5_000, "unsaved edits did not request a close choice");
    if (win.isDestroyed() || choices !== 1) throw new Error("Keep editing did not preserve the window");
    // Round-trip to the renderer after Electron finishes cancelling the first close.
    if (!(await win.webContents.executeJavaScript("document.body.isConnected"))) throw new Error("The kept page is unavailable");
    const closed = once(win, "closed");
    win.close();
    await withTimeout(closed, 5_000, "Discard changes did not close the window");
    if (Number(choices) !== 2) throw new Error("Closing did not request an explicit discard choice");
    return "Keep editing preserves the window; Discard changes allows closing";
  } finally {
    if (!win.isDestroyed()) win.destroy();
  }
}

export async function runSmokeTest(ctx: SmokeContext, processStart: number): Promise<SmokeResult> {
  const get = (pathname: string, withCookie: boolean): Promise<Response> =>
    ctx.fetchImpl(`${ctx.origin}${pathname}`, {
      headers: withCookie ? { cookie: ctx.cookieHeader } : {},
      signal: AbortSignal.timeout(30_000),
    });
  let pageStatus = 0;
  const checks: SmokeCheck[] = [];

  checks.push(
    await check("health", async () => {
      const response = await get("/api/health", true);
      const body: unknown = await response.json();
      if (response.status !== 200 || !isRecord(body) || body.ok !== true) {
        throw new Error(`HTTP ${response.status} ${JSON.stringify(body)}`);
      }
      if (body.desktop !== true) throw new Error("route handlers did not see the desktop bridge (desktop: false)");
      return "ok, route handlers see the desktop bridge";
    }),
  );
  checks.push(
    await check("rejects-missing-cookie", async () => {
      const response = await get("/api/health", false);
      await response.arrayBuffer();
      if (response.status !== 401) throw new Error(`expected 401, got ${response.status}`);
      return "401 without the session cookie";
    }),
  );
  checks.push(
    await check("rejects-foreign-host", async () => {
      const status = await statusWithHostHeader(ctx.port, `attacker.example:${ctx.port}`, "/api/health");
      if (status !== 403) throw new Error(`expected 403, got ${status}`);
      return "403 for a foreign Host header";
    }),
  );
  checks.push(
    await check("home-page", async () => {
      const response = await get("/", true);
      pageStatus = response.status;
      const text = await response.text();
      if (response.status !== 200) throw new Error(`HTTP ${response.status}`);
      if (!/<html/i.test(text)) throw new Error("the response is not an HTML page");
      return `HTTP 200, ${text.length} bytes`;
    }),
  );
  checks.push(
    await check("database", async () => {
      if (!fs.existsSync(ctx.databaseFile)) throw new Error(`${ctx.databaseFile} was not created`);
      return ctx.databaseFile;
    }),
  );
  checks.push(
    await check("keychain", async () => {
      if (!(await ctx.bridge.encryptionAvailable())) {
        if (process.platform === "linux") throw new SkipCheck("no OS keyring in this Linux session (basic_text)");
        throw new Error("safeStorage reports that encryption is unavailable");
      }
      const sample = `smoke ${Date.now()} äöü ✓`;
      const roundTrip = await ctx.bridge.decryptString(await ctx.bridge.encryptString(sample));
      if (roundTrip !== sample) throw new Error("the decrypted text differs from the original");
      return `encrypt/decrypt round trip (${ctx.keychain} keychain)`;
    }),
  );
  checks.push(
    await check("pdf", async () => {
      const pdf = await ctx.bridge.renderPdf(SAMPLE_HTML, { pageSize: "A4" });
      if (pdf.subarray(0, 5).toString("latin1") !== "%PDF-") throw new Error("the output is not a PDF");
      return `${pdf.length} bytes`;
    }),
  );
  checks.push(await check("window", () => checkWindow(ctx)));
  checks.push(await check("unsaved-changes", () => checkUnsavedChanges(ctx)));
  checks.push(
    await check("server-folder-unchanged", async () => {
      // Runs last so it sees writes from every request above, e.g. Next's image cache.
      const changed = changedSince(ctx.serverDir, processStart);
      if (changed.length > 0) throw new Error(`the server wrote into its install folder: ${changed.join(", ")}`);
      return "no writes to the install folder";
    }),
  );

  return {
    ok: checks.every((item) => item.ok),
    status: pageStatus,
    ms: Date.now() - processStart,
    ...describeRuntime(ctx.keychain),
    checks,
  };
}

export function smokeFailure(error: unknown, processStart: number, keychain: KeychainMode): SmokeResult {
  return {
    ok: false,
    status: 0,
    ms: Date.now() - processStart,
    ...describeRuntime(keychain),
    checks: [],
    error: message(error),
  };
}

export async function writeSmokeResult(result: SmokeResult, logsDir: string): Promise<void> {
  const json = JSON.stringify(result, null, 2);
  try {
    fs.mkdirSync(logsDir, { recursive: true });
    fs.writeFileSync(path.join(logsDir, "smoke-test.json"), `${json}\n`);
  } catch (error) {
    console.error("[smoke] could not write smoke-test.json:", error);
  }
  console.info(`[smoke] ${result.ok ? "passed" : "failed"} in ${result.ms} ms`);
  await new Promise<void>((resolve) => {
    const fallback = setTimeout(resolve, 2_000);
    process.stdout.write(`${json}\n`, () => {
      clearTimeout(fallback);
      resolve();
    });
  });
}
