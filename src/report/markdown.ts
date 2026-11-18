/** Markdown report renderer — archive format following report-template.md. */
import { scoreSourceLabel } from "@/domain/score-sources";
import { sectionsFor, type SectionKey } from "./templates";
import type { ReportModel } from "./model";

export function renderReportMarkdown(m: ReportModel): string {
  const show = sectionsFor(m.meta.reportType);
  const has = (k: SectionKey) => show.has(k);
  const L: string[] = [];
  const p = (s = "") => L.push(s);

  p(`# ${m.meta.projectName} ${m.meta.reportKind}`);
  p();
  p(`**Prepared by:** ${m.meta.brandName}  `);
  p(`**Prepared for:** ${m.meta.clientName}  `);
  p(`**Date:** ${m.meta.date}  `);
  p(`**Status:** ${m.meta.status}  `);
  p(`**Confidentiality:** ${m.meta.confidentiality}`);
  p();
  p("---");
  p();
  p("## Important Notice");
  p();
  p(m.disclaimer);
  p();
  if (m.meta.aiDisclosure) {
    p(`_${m.meta.aiDisclosure}_`);
    p();
  }

  if (has("executive")) {
    p("# Executive Summary");
    p();
    p(`**Final recommendation:** ${m.meta.recommendationLabel}  `);
    p(`**Overall score:** ${m.meta.overallScore ?? "—"}/10  `);
    p(`**Confidence level:** ${m.meta.confidenceLevel}`);
    p();
    p(m.executive.conclusion);
    p();
    p("## Top reasons to proceed");
    m.executive.reasonsToProceed.forEach((r, i) => p(`${i + 1}. ${r}`));
    p();
    p("## Top risks");
    (m.executive.risks.length ? m.executive.risks : ["None recorded yet."]).forEach((r, i) => p(`${i + 1}. ${r}`));
    p();
    p("## Immediate next steps");
    m.executive.nextSteps.forEach((r, i) => p(`${i + 1}. ${r}`));
    p();
  }

  if (has("identity")) {
    p("# Identity Verification");
    p();
    p(`**Verdict:** ${m.identity.verdictLabel}`);
    p();
    table(L, ["Item", "Finding", "Evidence", "Confidence"], m.identity.rows.map((r) => [r.item, r.finding, r.evidence, r.confidence]));
    p(`> ${m.identity.confusionNote}`);
    p();
  }

  if (has("opportunity")) {
    p("# Opportunity Description");
    p();
    table(L, ["Term", "Detail"], m.opportunity.terms.map((t) => [t.label, t.value]));
    if (m.opportunity.missingInformation.length) p(`**Missing information:** ${m.opportunity.missingInformation.join("; ")}`);
    p();
  }

  if (has("sourceMap")) {
    p("# Source Map");
    p();
    table(L, ["#", "Source", "Type", "Reliability", "Key use", "Notes"], m.sources.map((s) => [s.ref, s.name, s.type, s.reliability, s.use, s.notes]));
  }

  if (has("entityLegal")) {
    p("# Entity and Legal Structure");
    p();
    table(L, ["Entity", "Role", "Jurisdiction", "Evidence", "Notes"], m.entityLegal.entities.map((e) => [e.name, e.role, e.jurisdiction, e.evidence, e.notes]));
    p(m.entityLegal.legalStructureNote);
    p();
  }

  if (has("team")) {
    p("# Founder and Team Background");
    p();
    p(m.team.summary);
    p();
    if (m.team.people.length) table(L, ["Person", "Role", "Background", "Risk notes"], m.team.people.map((x) => [x.name, x.role, x.background, x.riskNotes]));
  }

  if (has("tokenomics")) {
    p("# Tokenomics");
    p();
    p(`**Verdict:** ${m.tokenomics.verdict}`);
    p();
    table(L, ["Metric", "Value"], m.tokenomics.supply.map((r) => [r.label, r.value]));
    if (m.tokenomics.allocations.length) { p("## Allocation"); table(L, ["Category", "Tokens", "% total", "Vesting"], m.tokenomics.allocations.map((a) => [a.category, a.tokens, a.percent, a.vesting])); }
    if (m.tokenomics.unlocks.length) { p("## Unlock schedule"); table(L, ["Date", "Tokens", "% supply", "Category", "Risk"], m.tokenomics.unlocks.map((u) => [u.date, u.tokens, u.percent, u.category, u.risk])); }
    p(`**Value capture:** ${m.tokenomics.valueCapture}`);
    p(`**Risks:** ${m.tokenomics.risks}`);
    p();
  }

  if (has("market")) {
    p("# Market and Liquidity Analysis");
    p();
    p(m.market.summary);
    p();
    if (m.market.venues.length) table(L, ["Venue", "Pair", "24h volume", "Spread", "+/-2% depth", "Notes"], m.market.venues.map((v) => [v.venue, v.pair, v.volume, v.spread, v.depth, v.notes]));
    if (m.market.slippage.length) { p("## Slippage estimate"); table(L, ["Size", "Buy", "Sell", "Route"], m.market.slippage.map((s) => [s.size, s.buy, s.sell, s.route])); }
    p(`**Liquidity verdict:** ${m.market.verdict}`);
    p();
  }

  if (has("technical")) {
    p("# Smart Contract / Technical Risk");
    p();
    if (m.technical.contracts.length) table(L, ["Contract", "Chain", "Address", "Verified", "Admin/upgrade notes"], m.technical.contracts.map((c) => [c.name, c.chain, c.address, c.verified, c.adminNotes]));
    p(m.technical.analysis);
    p();
  }

  if (has("stablecoinRwa") && m.stablecoinRwa.applicable) {
    p("# Stablecoin / RWA Tokenisation Analysis");
    p();
    p(`**Applicability:** ${m.stablecoinRwa.applicability}`);
    p(`**Stablecoin review:** ${m.stablecoinRwa.stablecoin}`);
    p(`**RWA review:** ${m.stablecoinRwa.rwa}`);
    if (m.stablecoinRwa.questions.length) { p("## Key unresolved questions"); m.stablecoinRwa.questions.forEach((q) => p(`- ${q}`)); }
    p();
  }

  if (has("legal")) {
    p("# Regulatory and Legal Risk");
    p();
    p(m.legal.analysis);
    if (m.legal.counselQuestions.length) { p("## Counsel questions"); m.legal.counselQuestions.forEach((q) => p(`- ${q}`)); }
    p();
  }

  if (has("redFlags")) {
    p("# Red Flags");
    p();
    if (m.redFlags.length) table(L, ["Red flag", "Severity", "Evidence", "Why it matters", "Required mitigation"], m.redFlags.map((f) => [f.title, f.severity, f.evidence, f.impact, f.mitigation]));
    else p("> No red flags triggered from available data. Absence of evidence is not evidence of safety.");
    p();
  }

  if (has("investmentCase")) {
    p("# Investment Case");
    p();
    p(`**Bull case:** ${m.investmentCase.bull}`);
    p(`**Bear case:** ${m.investmentCase.bear}`);
    p(`**Base case:** ${m.investmentCase.base}`);
    p(`**Downside case:** ${m.investmentCase.downside}`);
    p(`**Fraud/impersonation case:** ${m.investmentCase.fraud}`);
    p();
  }

  if (has("valuation")) {
    p("# Valuation and Return Scenarios");
    p();
    table(L, ["Scenario", "Assumptions", "Outcome", "Probability", "Notes"], m.valuation.map((v) => [v.name, v.assumptions, v.outcome, v.probability, v.notes]));
  }

  if (has("dueDiligence")) {
    p("# Due-Diligence Questions");
    p();
    m.dueDiligenceQuestions.forEach((s) => { p(`## ${s.title}`); s.questions.forEach((q) => p(`- ${q}`)); p(); });
  }

  if (has("documentRequests")) {
    p("# Documents to Request");
    p();
    m.documentRequests.forEach((d) => { p(`## ${d.title}`); d.documents.forEach((x) => p(`- ${x}`)); p(); });
  }

  if (has("scorecard")) {
    p("# Final Investability Score");
    p();
    table(L, ["Category", "Score", "Set by", "Weight", "Weighted", "Type"], m.scorecard.contributions.map((c) => [c.label, String(c.score ?? "—"), scoreSourceLabel(m.scorecard.sources, c.key, c.score), `${Math.round(c.weight * 100)}%`, String(c.weighted ?? "—"), c.informational ? "informational" : "weighted"]));
    p(`**Overall score:** ${m.scorecard.overallScore ?? "—"}/10 → ${m.scorecard.recommendationLabel}`);
    if (m.scorecard.gatingApplied.length) { p("**Gating overrides applied:**"); m.scorecard.gatingApplied.forEach((g) => p(`- ${g}`)); }
    p();
  }

  if (has("finalRecommendation")) {
    p("# Final Recommendation");
    p();
    p(m.finalRecommendation);
    p();
  }

  if (has("appendix")) {
    p("# Appendix: Source Links");
    p();
    if (m.sources.length) m.sources.forEach((s) => p(`- [${s.ref}] ${s.name} — ${s.url || "(no url)"} — ${s.reliability}`));
    else p("_No sources to cite._");
    p();
  }

  return L.join("\n");
}

function table(L: string[], head: string[], rows: string[][]): void {
  L.push(`| ${head.join(" | ")} |`);
  L.push(`|${head.map(() => "---").join("|")}|`);
  for (const r of rows) L.push(`| ${r.map((c) => String(c ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ")).join(" | ")} |`);
  L.push("");
}
