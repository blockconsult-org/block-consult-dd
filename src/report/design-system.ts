/**
 * Block Consult report CSS design system.
 * Self-contained (no Tailwind) so HTML and PDF render identically and on-brand.
 * Parameterised by Branding so every report is institutionally consistent.
 */
import type { Branding } from "@/lib/branding";

export function reportCss(b: Branding): string {
  const c = b.colors;
  return `
:root {
  --ink: ${c.primary};
  --accent: ${c.accent};
  --muted: ${c.muted};
  --panel: ${c.lightPanel};
  --warning: ${c.warning};
  --danger: ${c.danger};
  --success: ${c.success};
}

@page {
  size: ${b.page.size};
  margin: ${b.page.marginTop} ${b.page.marginRight} ${b.page.marginBottom} ${b.page.marginLeft};
  @bottom-left { content: "${b.brandName}"; font-size: 8pt; color: ${c.muted}; }
  @bottom-center { content: "${b.footerText}"; font-size: 8pt; color: ${c.muted}; }
  @bottom-right { content: "Page " counter(page) " / " counter(pages); font-size: 8pt; color: ${c.muted}; }
}

* { box-sizing: border-box; }

body {
  font-family: ${b.fonts.primary};
  color: ${c.primary};
  background: ${c.background};
  font-size: 10.5pt;
  line-height: 1.45;
  margin: 0;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

h1, h2, h3 { color: var(--ink); font-weight: 700; }
h1 { font-size: 20pt; margin: 24pt 0 8pt; border-bottom: 1px solid #d1d5db; padding-bottom: 6pt; break-after: avoid; }
h2 { font-size: 14pt; margin: 18pt 0 6pt; break-after: avoid; }
h3 { font-size: 11.5pt; margin: 12pt 0 4pt; break-after: avoid; }
p { margin: 0 0 8pt 0; }
ul, ol { margin: 0 0 8pt 0; padding-left: 18pt; }
li { margin: 0 0 3pt 0; }
small { color: var(--muted); font-size: 8.5pt; }
a { color: var(--accent); text-decoration: none; word-break: break-all; }
.muted { color: var(--muted); }
.mono { font-family: ${b.fonts.mono}; font-size: 9pt; }

/* ---- Cover page ---- */
.cover {
  height: calc(297mm - ${b.page.marginTop} - ${b.page.marginBottom});
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  break-after: page;
}
.cover-top { border-top: 6px solid var(--accent); padding-top: 16pt; }
.cover .brand { font-size: 15pt; font-weight: 700; letter-spacing: .02em; }
.cover .report-kind { color: var(--muted); font-size: 10pt; margin-top: 2pt; }
.cover-mid { margin-top: 60pt; }
.cover .title { font-size: 30pt; font-weight: 800; line-height: 1.1; margin: 0 0 6pt; }
.cover .subtitle { font-size: 13pt; color: var(--muted); }
.cover-meta { display: grid; grid-template-columns: 1fr 1fr; gap: 6pt 24pt; margin-top: 28pt; font-size: 10pt; }
.cover-meta .k { color: var(--muted); }
.cover-conf { font-size: 9pt; color: var(--danger); font-weight: 700; text-transform: uppercase; letter-spacing: .04em; }

/* ---- Tables ---- */
table { width: 100%; border-collapse: collapse; margin: 8pt 0 12pt; font-size: 9pt; }
th { background: var(--panel); text-align: left; font-weight: 700; border-bottom: 1px solid #d1d5db; padding: 5pt; }
td { border-bottom: 1px solid #e5e7eb; padding: 5pt; vertical-align: top; }
td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
table.source-table { font-size: 8pt; }
tr { break-inside: avoid; }

/* ---- Callouts ---- */
.callout { border-left: 4px solid var(--accent); background: #f8fafc; padding: 10pt 12pt; margin: 10pt 0 14pt; break-inside: avoid; }
.callout .label { font-size: 8pt; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; color: var(--accent); }
.callout.risk { border-left-color: var(--danger); background: #fef2f2; }
.callout.risk .label { color: var(--danger); }
.callout.evidence { border-left-color: var(--warning); background: #fffbeb; }
.callout.evidence .label { color: var(--warning); }
.callout.conclusion { border-left-color: var(--success); background: #f0fdf4; }
.callout.conclusion .label { color: var(--success); }
.callout.action { border-left-color: var(--ink); background: var(--panel); }
.callout.action .label { color: var(--ink); }

/* ---- Badges ---- */
.badge { display: inline-block; border-radius: 999px; padding: 2pt 7pt; font-size: 8pt; font-weight: 700; }
.badge.critical { background: #7f1d1d; color: #fff; }
.badge.high { background: #991b1b; color: #fff; }
.badge.medium { background: #b45309; color: #fff; }
.badge.low { background: var(--panel); color: var(--ink); }
.badge.informational { background: #e5e7eb; color: var(--ink); }
.badge.unresolved { background: #fde68a; color: #7c2d12; }
.badge.rel-primary { background: var(--ink); color: #fff; }
.badge.rel-secondary { background: var(--accent); color: #fff; }
.badge.rel-market { background: #6d28d9; color: #fff; }
.badge.rel-community { background: var(--panel); color: var(--ink); }
.badge.rel-weak { background: #fca5a5; color: #7f1d1d; }

/* Recommendation badge */
.rec-badge { display: inline-block; padding: 4pt 12pt; border-radius: 6pt; font-weight: 800; font-size: 11pt; }
.rec-badge.invest { background: #dcfce7; color: var(--success); border: 1px solid var(--success); }
.rec-badge.strict_conditions { background: #fef9c3; color: var(--warning); border: 1px solid var(--warning); }
.rec-badge.wait_monitor { background: #fef3c7; color: var(--warning); border: 1px solid var(--warning); }
.rec-badge.reject { background: #fee2e2; color: var(--danger); border: 1px solid var(--danger); }
.rec-badge.reject_likely_scam { background: #7f1d1d; color: #fff; border: 1px solid #7f1d1d; }

/* ---- Scorecard ---- */
.score-grid { display: grid; grid-template-columns: 1fr auto; gap: 2pt 10pt; }
.scorebar { position: relative; background: var(--panel); border-radius: 3pt; height: 9pt; width: 60pt; display: inline-block; vertical-align: middle; overflow: hidden; }
.scorebar > span { position: absolute; left: 0; top: 0; bottom: 0; background: var(--accent); }

/* ---- Layout helpers ---- */
.section { break-inside: auto; }
.page-break { break-before: page; }
.avoid-break { break-inside: avoid; }
.kv { display: grid; grid-template-columns: 160pt 1fr; gap: 2pt 8pt; font-size: 9.5pt; }
.kv .k { color: var(--muted); }
.grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 0 18pt; }
.tag { display:inline-block; background: var(--panel); border-radius: 4pt; padding: 1pt 5pt; font-size: 8pt; margin: 0 3pt 3pt 0; }
.notice { font-size: 9pt; color: var(--muted); border: 1px solid #e5e7eb; border-radius: 4pt; padding: 8pt 10pt; margin: 8pt 0; }
`.trim();
}
