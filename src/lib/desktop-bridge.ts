/**
 * Contract between the Electron main process and the Next.js server it hosts.
 *
 * The desktop shell starts the standalone Next server inside its own Node
 * process and installs this object on `globalThis.__bcDesktop` before the
 * server loads. Route handlers reach OS facilities through it: the keychain via
 * Electron safeStorage, and Chromium's print-to-PDF. In the browser-only setup
 * (`npm run dev`, `npm start`) the bridge is absent and callers fall back to a
 * local encryption key and Playwright.
 */

export interface DesktopPdfOptions {
  /** CSS page size, e.g. "A4". */
  pageSize: "A4" | "Letter";
  /** Page margins in inches. Defaults to Chromium's 1 cm. */
  margins?: { top: number; bottom: number; left: number; right: number };
}

export interface DesktopBridge {
  /** Desktop app version (from the packaged app). */
  appVersion: string;
  /** True when the OS keychain can protect secrets (not Linux "basic_text"). */
  encryptionAvailable(): Promise<boolean>;
  /** Encrypt with the OS keychain; returns base64 ciphertext. */
  encryptString(plain: string): Promise<string>;
  /** Decrypt base64 ciphertext produced by encryptString. */
  decryptString(cipherBase64: string): Promise<string>;
  /** Render self-contained HTML to PDF with the bundled Chromium. */
  renderPdf(html: string, options: DesktopPdfOptions): Promise<Buffer>;
}

declare global {
  // The desktop shell assigns this before the server loads.
  var __bcDesktop: unknown;
}

function isDesktopBridge(value: unknown): value is DesktopBridge {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.appVersion === "string" &&
    typeof v.encryptionAvailable === "function" &&
    typeof v.encryptString === "function" &&
    typeof v.decryptString === "function" &&
    typeof v.renderPdf === "function"
  );
}

export function getDesktopBridge(): DesktopBridge | null {
  const candidate: unknown = globalThis.__bcDesktop;
  return isDesktopBridge(candidate) ? candidate : null;
}

export function isDesktopApp(): boolean {
  return getDesktopBridge() !== null;
}
