/**
 * DesktopBridge implementation (contract: src/lib/desktop-bridge.ts). main.ts
 * installs it on globalThis.__bcDesktop before the Next.js server loads.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { BrowserWindow, safeStorage, session, type Session, type WebContents } from "electron";
import type { DesktopBridge, DesktopPdfOptions } from "../src/lib/desktop-bridge";

// No "persist:" prefix: the session exists in memory only.
const PDF_PARTITION = "bc-pdf-render";
const PDF_TIMEOUT_MS = 60_000;

const allowedPdfFiles = new Set<string>();
const pdfRenderers = new WeakSet<WebContents>();
let pdfSession: Session | null = null;

/** True for the hidden windows renderPdf creates; main.ts denies them all navigation. */
export function isPdfRendererContents(contents: WebContents): boolean {
  return pdfRenderers.has(contents);
}

function comparablePath(filePath: string): string {
  const resolved = path.resolve(filePath);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function isAllowedPdfRequest(url: string): boolean {
  if (url.startsWith("data:")) return true;
  if (!url.startsWith("file:")) return false;
  try {
    return allowedPdfFiles.has(comparablePath(fileURLToPath(url)));
  } catch {
    return false;
  }
}

/** URL without query string or fragment, which may carry API keys, for the log. */
function loggableUrl(url: string): string {
  try {
    const { protocol, host, pathname } = new URL(url);
    return `${protocol}//${host}${pathname}`.slice(0, 200);
  } catch {
    return "(unparseable URL)";
  }
}

function getPdfSession(): Session {
  if (pdfSession) return pdfSession;
  const pdf = session.fromPartition(PDF_PARTITION, { cache: false });
  // Report HTML is self-contained (fonts and images as data: URLs). Every other
  // request, remote or local, is cancelled.
  pdf.webRequest.onBeforeRequest((details, callback) => {
    const allowed = isAllowedPdfRequest(details.url);
    if (!allowed) console.info(`[pdf] blocked request: ${loggableUrl(details.url)}`);
    callback({ cancel: !allowed });
  });
  pdf.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  pdf.setPermissionCheckHandler(() => false);
  pdf.on("will-download", (event) => event.preventDefault());
  pdfSession = pdf;
  return pdf;
}

async function renderPdf(html: string, options: DesktopPdfOptions): Promise<Buffer> {
  if (typeof html !== "string") throw new TypeError("renderPdf expects an HTML string");
  const pageSize = options.pageSize === "Letter" ? "Letter" : "A4";
  // A temp file rather than a data: URL: Chromium caps URLs at 2 MB and reports
  // with embedded fonts can be larger.
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "bc-pdf-"));
  const file = path.join(dir, "report.html");
  const fileKey = comparablePath(file);
  let renderer: BrowserWindow | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await fs.writeFile(file, html, { encoding: "utf8", mode: 0o600 });
    allowedPdfFiles.add(fileKey);
    const win = new BrowserWindow({
      show: false,
      width: 1024,
      height: 768,
      webPreferences: {
        session: getPdfSession(),
        javascript: false,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        webSecurity: true,
        plugins: false,
        webgl: false,
        spellcheck: false,
      },
    });
    renderer = win;
    pdfRenderers.add(win.webContents);
    const render = (async () => {
      await win.loadURL(pathToFileURL(file).href);
      return win.webContents.printToPDF({ printBackground: true, preferCSSPageSize: true, pageSize, margins: options.margins });
    })();
    // The timeout may settle the race first; keep a late rejection from going unhandled.
    render.catch(() => undefined);
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`PDF rendering took longer than ${PDF_TIMEOUT_MS / 1000} s`)), PDF_TIMEOUT_MS);
    });
    return await Promise.race([render, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
    allowedPdfFiles.delete(fileKey);
    if (renderer && !renderer.isDestroyed()) renderer.destroy();
    await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function encryptionAvailable(): Promise<boolean> {
  if (!(await safeStorage.isAsyncEncryptionAvailable())) return false;
  // Without a keyring, Linux falls back to a hard-coded key ("basic_text"), which protects nothing.
  return !(process.platform === "linux" && safeStorage.getSelectedStorageBackend() === "basic_text");
}

async function encryptString(plain: string): Promise<string> {
  if (typeof plain !== "string") throw new TypeError("encryptString expects a string");
  if (!(await encryptionAvailable())) throw new Error("OS keychain encryption is not available");
  return (await safeStorage.encryptStringAsync(plain)).toString("base64");
}

/** Data written by the older synchronous encryptString decrypts here too. */
async function decryptString(cipherBase64: string): Promise<string> {
  if (typeof cipherBase64 !== "string") throw new TypeError("decryptString expects a base64 string");
  const { result } = await safeStorage.decryptStringAsync(Buffer.from(cipherBase64, "base64"));
  return result;
}

export function createDesktopBridge(appVersion: string): DesktopBridge {
  return { appVersion, encryptionAvailable, encryptString, decryptString, renderPdf };
}
