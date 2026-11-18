/**
 * Geist fonts embedded in the report as data: URLs, so HTML and PDF exports
 * render the same offline and never call a font CDN. Files live in
 * public/fonts (SIL Open Font License, see OFL-Geist.txt there).
 */
import { readFileSync } from "node:fs";
import path from "node:path";

const FONTS = [
  { family: "Geist", file: "Geist-Variable.woff2" },
  { family: "Geist Mono", file: "GeistMono-Variable.woff2" },
] as const;

let cached: string | null = null;

/** @font-face rules for the report; empty when the font files are missing (system fonts are used instead). */
export function embeddedFontCss(): string {
  if (cached !== null) return cached;
  const dir = path.join(process.cwd(), "public", "fonts");
  const rules: string[] = [];
  for (const font of FONTS) {
    try {
      const data = readFileSync(path.join(dir, font.file)).toString("base64");
      rules.push(
        `@font-face{font-family:"${font.family}";src:url(data:font/woff2;base64,${data}) format("woff2");font-weight:100 900;font-style:normal;font-display:block}`,
      );
    } catch {
      // Missing file: fall back to the next font in the stack.
    }
  }
  cached = rules.join("\n");
  return cached;
}
