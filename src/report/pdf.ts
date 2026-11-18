/**
 * PDF renderer. In the desktop app the report prints through Electron's
 * Chromium (src/lib/desktop-bridge.ts). In the browser setup it uses
 * Playwright's Chromium, imported lazily so the rest of the app runs without
 * the browser binary.
 */
import type { Branding } from "@/lib/branding";
import { getDesktopBridge } from "@/lib/desktop-bridge";

export class PdfRenderError extends Error {}

type PlaywrightModule = typeof import("playwright");

/**
 * Imports a module when the code runs, not at build time. The specifier is a
 * parameter and webpack is told to skip the import, so neither webpack nor
 * Next's file tracer follows it. Used for Playwright, which only the web
 * version needs: the desktop build prints through Electron, and its server
 * folder leaves Playwright out.
 */
async function importAtRuntime(specifier: string): Promise<unknown> {
  return import(/* webpackIgnore: true */ specifier);
}

function isPlaywright(mod: unknown): mod is PlaywrightModule {
  return typeof mod === "object" && mod !== null && "chromium" in mod;
}

const INCHES_PER_UNIT: Record<string, number> = { in: 1, mm: 1 / 25.4, cm: 1 / 2.54, pt: 1 / 72, px: 1 / 96 };

/** CSS length such as "18mm" to inches; unknown units fall back to 1 cm. */
export function cssLengthToInches(value: string): number {
  const match = /^\s*([\d.]+)\s*(in|mm|cm|pt|px)\s*$/i.exec(value);
  const amount = match ? Number(match[1]) : NaN;
  const unit = match?.[2]?.toLowerCase();
  const factor = unit ? INCHES_PER_UNIT[unit] : undefined;
  return Number.isFinite(amount) && factor ? amount * factor : 1 / 2.54;
}

export async function renderReportPdf(html: string, branding: Branding): Promise<Buffer> {
  const bridge = getDesktopBridge();
  if (bridge) {
    try {
      return await bridge.renderPdf(html, {
        pageSize: branding.page.size === "Letter" ? "Letter" : "A4",
        margins: {
          top: cssLengthToInches(branding.page.marginTop),
          bottom: cssLengthToInches(branding.page.marginBottom),
          left: cssLengthToInches(branding.page.marginLeft),
          right: cssLengthToInches(branding.page.marginRight),
        },
      });
    } catch (err) {
      throw new PdfRenderError(`The PDF could not be rendered (${(err as Error).message}). The HTML report is still available.`);
    }
  }

  let chromium: PlaywrightModule["chromium"];
  try {
    const mod = await importAtRuntime("playwright");
    if (!isPlaywright(mod)) throw new Error("unexpected module shape");
    ({ chromium } = mod);
  } catch {
    throw new PdfRenderError("PDF export in the web version needs Playwright. Run `npm install`, then `npx playwright install chromium`.");
  }

  let browser: import("playwright").Browser | null = null;
  try {
    browser = await chromium.launch({ args: ["--no-sandbox"] });
  } catch (err) {
    // Playwright's launch errors carry a multi-line banner; keep it in the log, not on screen.
    const detail = err instanceof Error ? err.message : String(err);
    console.warn("[pdf] Chromium did not start:", detail);
    throw new PdfRenderError(
      /Executable doesn't exist/i.test(detail)
        ? "PDF export needs Playwright's Chromium, which is not installed. Run `npx playwright install chromium`, then try again. The HTML report is still available."
        : `Chromium could not start for PDF export (${detail.split("\n")[0]}). The HTML report is still available.`,
    );
  }

  try {
    // The report is self-contained (fonts are embedded), so the page gets no
    // network access and no scripts, matching the desktop renderer.
    const page = await browser.newPage({ javaScriptEnabled: false });
    await page.route("**/*", (route) => route.abort());
    await page.setContent(html, { waitUntil: "load", timeout: 30_000 });
    const pdf = await page.pdf({
      format: branding.page.size === "Letter" ? "Letter" : "A4",
      printBackground: true,
      margin: {
        top: branding.page.marginTop,
        bottom: branding.page.marginBottom,
        left: branding.page.marginLeft,
        right: branding.page.marginRight,
      },
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
