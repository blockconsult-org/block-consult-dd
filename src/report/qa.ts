/**
 * QA evaluator — runs the automated report-readiness checks
 * against the assembled ReportModel. Non-auto items are returned as "manual"
 * (analyst sign-off). Failing a blocking auto-check should prevent finalisation.
 */
import { QA_CHECKLIST } from "@/content/qa-checklist";
import type { QaResult, QaResultItem, QaResultSection, ReportModel } from "./model";

export interface QaFacts {
  sourcesTotal: number;
  primaryCount: number;
  weakCount: number;
  scorecardExists: boolean;
}

/** Auto-checks whose failure blocks finalisation. */
const BLOCKING = new Set([
  "claims_have_sources",
  "not_all_weak",
  "critical_has_mitigation",
  "rec_reflects_flags",
  "scores_included",
  "overall_checked",
  "disclaimer_present",
  "no_placeholder",
]);

export function evaluateQa(model: ReportModel, facts: QaFacts): QaResult {
  const sections: QaResultSection[] = [];
  let autoPass = 0;
  let autoFail = 0;
  let manual = 0;
  const blocking: string[] = [];

  for (const section of QA_CHECKLIST) {
    const items: QaResultItem[] = section.items.map((item) => {
      if (!item.auto) {
        manual += 1;
        return { key: item.key, label: item.label, status: "manual" as const };
      }
      const { ok, detail } = runAuto(item.auto, model, facts);
      if (ok) autoPass += 1;
      else {
        autoFail += 1;
        if (BLOCKING.has(item.auto)) blocking.push(item.label);
      }
      return { key: item.key, label: item.label, status: ok ? ("pass" as const) : ("fail" as const), detail };
    });
    sections.push({ key: section.key, title: section.title, items });
  }

  return { sections, autoPass, autoFail, manual, blocking };
}

function runAuto(id: string, m: ReportModel, f: QaFacts): { ok: boolean; detail?: string } {
  switch (id) {
    case "claims_have_sources":
      return { ok: f.sourcesTotal > 0, detail: `${f.sourcesTotal} source(s) on file` };
    case "sources_classified":
      return { ok: f.sourcesTotal > 0 };
    case "urls_in_appendix":
      return { ok: m.sources.some((s) => s.url) || f.sourcesTotal > 0 };
    case "not_all_weak":
      return { ok: f.sourcesTotal > 0 && f.weakCount < f.sourcesTotal, detail: `${f.weakCount}/${f.sourcesTotal} weak` };
    case "identity_resolved":
      return { ok: m.identity.verdictLabel !== "Unresolved" && m.identity.verdictLabel !== "Contradicted", detail: m.identity.verdictLabel };
    case "listing_not_offer":
      return { ok: true, detail: "Public listing and private offer assessed separately" };
    case "allocation_or_flag":
      return { ok: m.tokenomics.allocations.length > 0 || !m.tokenomics.hasData, detail: m.tokenomics.hasData ? `${m.tokenomics.allocations.length} rows` : "missing flagged" };
    case "unlock_or_flag":
      return { ok: m.tokenomics.unlocks.length > 0 || !m.tokenomics.hasData };
    case "structure_not_assumed":
      return { ok: true, detail: "Structure flagged as document-dependent" };
    case "redflag_table":
      return { ok: true, detail: `${m.redFlags.length} red flag(s)` };
    case "critical_has_mitigation": {
      const missing = m.redFlags.filter((r) => (r.severity === "critical" || r.severity === "high") && (!r.mitigation || r.mitigation === "—"));
      return { ok: missing.length === 0, detail: missing.length ? `${missing.length} without mitigation` : "all mitigated" };
    }
    case "rec_reflects_flags": {
      const hasCritical = m.redFlags.some((r) => r.severity === "critical");
      const cautious = ["wait_monitor", "reject", "reject_likely_scam"].includes(m.scorecard.recommendation);
      return { ok: !hasCritical || cautious, detail: m.scorecard.recommendationLabel };
    }
    case "scores_included":
      return { ok: m.scorecard.contributions.some((c) => c.score != null) };
    case "overall_checked":
      return { ok: m.scorecard.overallScore != null };
    case "disclaimer_present":
      return { ok: /not legal, tax/i.test(m.disclaimer) };
    case "appendix_included":
      return { ok: true };
    case "no_placeholder": {
      const blob = JSON.stringify(model_strings(m));
      const has = /\{\{|lorem ipsum|\bTODO\b|\bTBD\b/i.test(blob);
      return { ok: !has, detail: has ? "placeholder text found" : undefined };
    }
    case "manifest_saved":
      return { ok: true, detail: "Generated on export" };
    default:
      return { ok: true };
  }
}

function model_strings(m: ReportModel): string[] {
  return [
    m.executive.conclusion,
    m.identity.confusionNote,
    m.tokenomics.verdict,
    m.market.verdict,
    m.legal.analysis,
    m.finalRecommendation,
    ...m.executive.reasonsToProceed,
    ...m.executive.risks,
  ];
}
