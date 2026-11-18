/**
 * HTML report renderer. Renders the ReportModel to a self-contained HTML string
 * (inlined design-system CSS) used for both the HTML export and as the input to
 * the Playwright PDF renderer, so the two are visually identical.
 */
import React from "react";
import type { Branding } from "@/lib/branding";
import { reportCss } from "./design-system";
import { embeddedFontCss } from "./fonts";
import { scoreSourceLabel } from "@/domain/score-sources";
import { sectionsFor, type SectionKey } from "./templates";
import type { ReportModel } from "./model";

function sevClass(sev: string): string {
  return ["critical", "high", "medium", "low", "informational", "unresolved"].includes(sev) ? sev : "low";
}

const Badge = ({ sev }: { sev: string }) => <span className={`badge ${sevClass(sev)}`}>{sev}</span>;

const Callout = ({ type, label, children }: { type: string; label: string; children: React.ReactNode }) => (
  <div className={`callout ${type}`}>
    <div className="label">{label}</div>
    <div>{children}</div>
  </div>
);

function Table({ head, rows, numCols = [] }: { head: string[]; rows: (string | number | React.ReactNode)[][]; numCols?: number[] }) {
  return (
    <table>
      <thead>
        <tr>{head.map((h, i) => <th key={i} className={numCols.includes(i) ? "num" : undefined}>{h}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map((r, ri) => (
          <tr key={ri}>{r.map((c, ci) => <td key={ci} className={numCols.includes(ci) ? "num" : undefined}>{c}</td>)}</tr>
        ))}
      </tbody>
    </table>
  );
}

function ReportDocument({ m }: { m: ReportModel; branding: Branding }) {
  const show = sectionsFor(m.meta.reportType);
  const has = (k: SectionKey) => show.has(k);
  const rec = m.meta.recommendation ?? "wait_monitor";

  return (
    <>
      {/* Cover */}
      <section className="cover">
        <div className="cover-top">
          <div className="brand">{m.meta.brandName}</div>
          <div className="report-kind">{m.meta.reportKind} · {m.meta.reportTypeLabel}</div>
        </div>
        <div className="cover-mid">
          <h1 className="title" style={{ border: "none" }}>{m.meta.projectName}</h1>
          <div className="subtitle">{m.meta.reportTypeLabel}</div>
          <div style={{ marginTop: "18pt" }}>
            <span className={`rec-badge ${rec}`}>{m.meta.recommendationLabel}</span>
            {m.meta.overallScore != null && <span style={{ marginLeft: "10pt", fontWeight: 700 }}>Overall {m.meta.overallScore}/10</span>}
          </div>
          <div className="cover-meta">
            <div><div className="k">Prepared for</div>{m.meta.clientName}</div>
            <div><div className="k">Prepared by</div>{m.meta.preparedBy}</div>
            <div><div className="k">Date</div>{m.meta.date}</div>
            <div><div className="k">Status</div>{m.meta.status}</div>
            <div><div className="k">Analyst</div>{m.meta.analyst}</div>
            <div><div className="k">Confidence</div>{m.meta.confidenceLevel}</div>
          </div>
        </div>
        <div className="cover-conf">{m.meta.confidentiality}</div>
      </section>

      {/* Important notice */}
      <section className="section">
        <h2>Important Notice</h2>
        <div className="notice">{m.disclaimer}</div>
        {m.meta.aiDisclosure && <p className="muted">{m.meta.aiDisclosure}</p>}
      </section>

      {has("executive") && (
        <section className="section">
          <h1>Executive Summary</h1>
          <div className="kv">
            <div className="k">Final recommendation</div><div><span className={`rec-badge ${rec}`}>{m.meta.recommendationLabel}</span></div>
            <div className="k">Overall score</div><div>{m.meta.overallScore ?? "—"}/10</div>
            <div className="k">Confidence level</div><div>{m.meta.confidenceLevel}</div>
          </div>
          <Callout type="conclusion" label="One-page conclusion">{m.executive.conclusion}</Callout>
          <h3>Top reasons to proceed</h3>
          <ol>{m.executive.reasonsToProceed.map((r, i) => <li key={i}>{r}</li>)}</ol>
          <h3>Top risks</h3>
          <ol>{m.executive.risks.length ? m.executive.risks.map((r, i) => <li key={i}>{r}</li>) : <li>None recorded yet — evidence collection incomplete.</li>}</ol>
          <Callout type="action" label="Immediate next steps">
            <ol>{m.executive.nextSteps.map((r, i) => <li key={i}>{r}</li>)}</ol>
          </Callout>
        </section>
      )}

      {has("identity") && (
        <section className="section">
          <h1>Identity Verification</h1>
          <p><strong>Verdict:</strong> {m.identity.verdictLabel}</p>
          <Table head={["Item", "Finding", "Evidence", "Confidence"]} rows={m.identity.rows.map((r) => [r.item, r.finding, r.evidence, r.confidence])} />
          <h3>Name/ticker confusion review</h3>
          <p>{m.identity.confusionNote}</p>
          <Callout type="note" label="Note">An exchange listing of the public token does not, by itself, validate a private/OTC offer, the seller&apos;s authority, or that the offered instrument is the same asset.</Callout>
        </section>
      )}

      {has("opportunity") && (
        <section className="section">
          <h1>Opportunity Description</h1>
          <Table head={["Term", "Detail"]} rows={m.opportunity.terms.map((t) => [t.label, t.value])} />
          {m.opportunity.missingInformation.length > 0 && (
            <Callout type="evidence" label="Missing information">{m.opportunity.missingInformation.join("; ")}</Callout>
          )}
        </section>
      )}

      {has("sourceMap") && (
        <section className="section">
          <h1>Source Map</h1>
          {m.sources.length ? (
            <Table head={["#", "Source", "Type", "Reliability", "Key use", "Notes"]} rows={m.sources.map((s) => [s.ref, s.name, s.type, s.reliability, s.use, s.notes])} />
          ) : <p className="muted">No sources recorded.</p>}
        </section>
      )}

      {has("entityLegal") && (
        <section className="section">
          <h1>Entity and Legal Structure</h1>
          {m.entityLegal.entities.length ? (
            <Table head={["Entity", "Role", "Jurisdiction", "Evidence", "Notes"]} rows={m.entityLegal.entities.map((e) => [e.name, e.role, e.jurisdiction, e.evidence, e.notes])} />
          ) : <p className="muted">No entities identified.</p>}
          <p>{m.entityLegal.legalStructureNote}</p>
        </section>
      )}

      {has("team") && (
        <section className="section">
          <h1>Founder and Team Background</h1>
          <p>{m.team.summary}</p>
          {m.team.people.length > 0 && (
            <Table head={["Person", "Role", "Background", "Evidence", "Risk notes"]} rows={m.team.people.map((p) => [p.name, p.role, p.background, p.evidence, p.riskNotes])} />
          )}
          {m.team.founderScore != null && <p><strong>Founder/team risk score:</strong> {m.team.founderScore}/10 (10 = lowest risk).</p>}
        </section>
      )}

      {has("tokenomics") && (
        <section className="section">
          <h1>Tokenomics</h1>
          <p><strong>Verdict:</strong> {m.tokenomics.verdict}</p>
          <h3>Supply snapshot</h3>
          <Table head={["Metric", "Value"]} rows={m.tokenomics.supply.map((r) => [r.label, r.value])} numCols={[1]} />
          {m.tokenomics.allocations.length > 0 && (<><h3>Allocation</h3>
            <Table head={["Category", "Tokens", "% total", "Lockup/Vesting", "Notes"]} numCols={[1, 2]} rows={m.tokenomics.allocations.map((a) => [a.category, a.tokens, a.percent, a.vesting, a.notes])} /></>)}
          {m.tokenomics.unlocks.length > 0 && (<><h3>Unlock schedule</h3>
            <Table head={["Date/period", "Tokens", "% supply", "Category", "Risk"]} numCols={[1, 2]} rows={m.tokenomics.unlocks.map((u) => [u.date, u.tokens, u.percent, u.category, u.risk])} /></>)}
          <h3>Value capture</h3><p>{m.tokenomics.valueCapture}</p>
          <h3>Staking and emissions</h3><p>{m.tokenomics.staking}</p>
          <Callout type="risk" label="Tokenomics risks">{m.tokenomics.risks}</Callout>
        </section>
      )}

      {has("market") && (
        <section className="section">
          <h1>Market and Liquidity Analysis</h1>
          <p>{m.market.summary}</p>
          {m.market.venues.length > 0 && <Table head={["Venue", "Pair", "24h volume", "Spread", "+/-2% depth", "Notes"]} numCols={[2, 3, 4]} rows={m.market.venues.map((v) => [v.venue, v.pair, v.volume, v.spread, v.depth, v.notes])} />}
          {m.market.slippage.length > 0 && (<><h3>Slippage estimate</h3>
            <Table head={["Size", "Buy slippage", "Sell slippage", "Main route", "Notes"]} numCols={[0, 1, 2]} rows={m.market.slippage.map((s) => [s.size, s.buy, s.sell, s.route, s.notes])} /></>)}
          <Callout type="risk" label="Liquidity verdict">{m.market.verdict}</Callout>
        </section>
      )}

      {has("technical") && (
        <section className="section">
          <h1>Smart Contract / Technical Risk</h1>
          {m.technical.contracts.length ? (
            <Table head={["Contract", "Chain", "Address", "Verified", "Admin/upgrade notes"]} rows={m.technical.contracts.map((c) => [c.name, c.chain, <span key="a" className="mono">{c.address}</span>, c.verified, c.adminNotes])} />
          ) : <p className="muted">No contract analysis entered.</p>}
          <p>{m.technical.analysis}</p>
        </section>
      )}

      {has("stablecoinRwa") && m.stablecoinRwa.applicable && (
        <section className="section">
          <h1>Stablecoin / RWA Tokenisation Analysis</h1>
          <p><strong>Applicability:</strong> {m.stablecoinRwa.applicability}</p>
          <Callout type="note" label="Structure">{m.stablecoinRwa.structure}</Callout>
          <h3>Stablecoin review</h3><p>{m.stablecoinRwa.stablecoin}</p>
          <h3>RWA/tokenised asset review</h3><p>{m.stablecoinRwa.rwa}</p>
          {m.stablecoinRwa.questions.length > 0 && (<><h3>Key unresolved questions</h3><ul>{m.stablecoinRwa.questions.map((q, i) => <li key={i}>{q}</li>)}</ul></>)}
        </section>
      )}

      {has("businessModel") && (<section className="section"><h1>Business Model</h1><p>{m.businessModel}</p></section>)}
      {has("competitive") && (<section className="section"><h1>Competitive Landscape</h1><p>{m.competitive}</p></section>)}

      {has("legal") && (
        <section className="section">
          <h1>Regulatory and Legal Risk</h1>
          <p>{m.legal.analysis}</p>
          {m.legal.counselQuestions.length > 0 && (<><h3>Counsel questions</h3><ul>{m.legal.counselQuestions.map((q, i) => <li key={i}>{q}</li>)}</ul></>)}
        </section>
      )}

      {has("redFlags") && (
        <section className="section">
          <h1>Red Flags</h1>
          {m.redFlags.length ? (
            <Table head={["Red flag", "Severity", "Evidence", "Why it matters", "Required mitigation"]} rows={m.redFlags.map((f) => [f.title, <Badge key="b" sev={f.severity} />, f.evidence, f.impact, f.mitigation])} />
          ) : <Callout type="note" label="Note">No red flags were triggered from available data. Absence of evidence is not evidence of safety.</Callout>}
        </section>
      )}

      {has("investmentCase") && (
        <section className="section">
          <h1>Investment Case</h1>
          <h3>Bull case</h3><p>{m.investmentCase.bull}</p>
          <h3>Bear case</h3><p>{m.investmentCase.bear}</p>
          <h3>Base case</h3><p>{m.investmentCase.base}</p>
          <h3>Downside case</h3><p>{m.investmentCase.downside}</p>
          <h3>Fraud/impersonation case</h3><p>{m.investmentCase.fraud}</p>
        </section>
      )}

      {has("valuation") && (
        <section className="section">
          <h1>Valuation and Return Scenarios</h1>
          <Table head={["Scenario", "Assumptions", "Outcome", "Probability", "Notes"]} numCols={[3]} rows={m.valuation.map((v) => [v.name, v.assumptions, v.outcome, v.probability, v.notes])} />
        </section>
      )}

      {has("dueDiligence") && (
        <section className="section">
          <h1>Due-Diligence Questions</h1>
          {m.dueDiligenceQuestions.map((s) => (
            <div key={s.title}><h3>{s.title}</h3><ol>{s.questions.map((q, i) => <li key={i}>{q}</li>)}</ol></div>
          ))}
        </section>
      )}

      {has("documentRequests") && (
        <section className="section">
          <h1>Documents to Request</h1>
          {m.documentRequests.map((d) => (
            <div key={d.title}><h3>{d.title}</h3><ul>{d.documents.map((doc, i) => <li key={i}>{doc}</li>)}</ul></div>
          ))}
        </section>
      )}

      {has("scorecard") && (
        <section className="section">
          <h1>Final Investability Score</h1>
          <Table head={["Category", "Score", "Set by", "Weight", "Weighted", "Type"]} numCols={[1, 3, 4]}
            rows={m.scorecard.contributions.map((c) => [c.label, c.score ?? "—", scoreSourceLabel(m.scorecard.sources, c.key, c.score), `${Math.round(c.weight * 100)}%`, c.weighted ?? "—", c.informational ? "informational" : "weighted"])} />
          <p><strong>Overall score:</strong> {m.scorecard.overallScore ?? "—"}/10 → <span className={`rec-badge ${rec}`}>{m.scorecard.recommendationLabel}</span></p>
          {m.scorecard.gatingApplied.length > 0 && (
            <Callout type="risk" label="Gating overrides applied">
              <ul>{m.scorecard.gatingApplied.map((g, i) => <li key={i}>{g}</li>)}</ul>
            </Callout>
          )}
        </section>
      )}

      {has("finalRecommendation") && (
        <section className="section">
          <h1>Final Recommendation</h1>
          <Callout type="conclusion" label="Recommendation">{m.finalRecommendation}</Callout>
        </section>
      )}

      {has("findings") && m.findings.length > 0 && (
        <section className="section">
          <h1>Detailed Findings</h1>
          <Table head={["Category", "Finding", "Severity", "Confidence", "Analysis"]} rows={m.findings.map((f) => [f.category, f.title, <Badge key="b" sev={f.severity} />, f.confidence, f.analysis])} />
        </section>
      )}

      {has("appendix") && (
        <section className="section">
          <h1>Appendix: Source Links</h1>
          {m.sources.length ? (
            <table className="source-table">
              <thead><tr><th>#</th><th>Source</th><th>Type</th><th>Reliability</th><th>URL</th></tr></thead>
              <tbody>{m.sources.map((s, i) => (
                <tr key={i}><td>{s.ref}</td><td>{s.name}</td><td>{s.type}</td><td>{s.reliability}</td><td>{s.url ? <a href={s.url}>{s.url}</a> : "—"}</td></tr>
              ))}</tbody>
            </table>
          ) : <p className="muted">No sources to cite. Report cannot be finalised until primary sources are added.</p>}
        </section>
      )}

      {has("qa") && (
        <section className="section">
          <h1>Appendix: Quality-Assurance Checklist</h1>
          <p className="muted">Automated checks: {m.qa.autoPass} pass / {m.qa.autoFail} fail · {m.qa.manual} analyst sign-off items.{m.qa.blocking.length ? ` ${m.qa.blocking.length} blocking issue(s).` : ""}</p>
          {m.qa.sections.map((s) => (
            <div key={s.key}>
              <h3>{s.title}</h3>
              <ul>{s.items.map((it) => (
                <li key={it.key}>
                  <span className={`badge ${it.status === "pass" ? "low" : it.status === "fail" ? "high" : "informational"}`}>{it.status}</span> {it.label}{it.detail ? ` — ${it.detail}` : ""}
                </li>
              ))}</ul>
            </div>
          ))}
        </section>
      )}
    </>
  );
}

export async function renderReportHtml(model: ReportModel, branding: Branding): Promise<string> {
  // Dynamic import keeps `react-dom/server` out of the static module graph that
  // Next's App Router scans in the react-server layer (it bans the static import).
  const { renderToStaticMarkup } = await import("react-dom/server");
  const body = renderToStaticMarkup(<ReportDocument m={model} branding={branding} />);
  const css = reportCss(branding);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeTitle(model.meta.brandName)} — ${escapeTitle(model.meta.projectName)} DD Report</title>
<style>${embeddedFontCss()}</style>
<style>${css}</style>
</head>
<body>${body}</body>
</html>`;
}

function escapeTitle(s: string): string {
  return s.replace(/[<>&]/g, "");
}
