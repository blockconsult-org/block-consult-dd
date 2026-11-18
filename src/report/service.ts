/**
 * Report service — builds the model, renders HTML + Markdown + evidence
 * manifest, writes artifacts to storage, and persists Report / ReportSection /
 * GeneratedFile rows. PDF is rendered on demand by the PDF route.
 */
import { prisma } from "@/lib/db";
import { toJson } from "@/domain/json";
import { reportFileBase } from "@/lib/branding";
import { writeArtifact } from "@/lib/storage";
import { loadSnapshot } from "@/harness/snapshot";
import { buildReportModel } from "./build";
import { renderReportHtml } from "./render-html";
import { renderReportMarkdown } from "./markdown";
import { sectionsFor, SECTION_ORDER } from "./templates";
import type { ReportModel } from "./model";

const SECTION_TITLES: Record<string, string> = {
  executive: "Executive Summary",
  identity: "Identity Verification",
  opportunity: "Opportunity Description",
  sourceMap: "Source Map",
  entityLegal: "Entity and Legal Structure",
  team: "Founder and Team Background",
  tokenomics: "Tokenomics",
  market: "Market and Liquidity Analysis",
  technical: "Smart Contract / Technical Risk",
  stablecoinRwa: "Stablecoin / RWA Tokenisation Analysis",
  businessModel: "Business Model",
  competitive: "Competitive Landscape",
  legal: "Regulatory and Legal Risk",
  redFlags: "Red Flags",
  investmentCase: "Investment Case",
  valuation: "Valuation and Return Scenarios",
  dueDiligence: "Due-Diligence Questions",
  documentRequests: "Documents to Request",
  scorecard: "Final Investability Score",
  finalRecommendation: "Final Recommendation",
  findings: "Detailed Findings",
  appendix: "Appendix: Source Links",
  qa: "Appendix: QA Checklist",
};

export interface GenerateResult {
  reportId: string;
  model: ReportModel;
  html: string;
  files: { kind: string; filename: string; path: string; sizeBytes: number }[];
}

export async function generateReport(caseId: string): Promise<GenerateResult> {
  const { model, branding } = await buildReportModel(caseId);
  const html = await renderReportHtml(model, branding);
  const markdown = renderReportMarkdown(model);
  const manifest = await buildEvidenceManifest(caseId, model);

  const date = new Date();
  const base = reportFileBase(model.meta.projectName, branding.brandName, date);
  const manifestName = `${base.replace("_DD_Report_", "_Evidence_Manifest_")}.json`;

  const htmlFile = await writeArtifact(caseId, `${base}.html`, html);
  const mdFile = await writeArtifact(caseId, `${base}.md`, markdown);
  const manifestFile = await writeArtifact(caseId, manifestName, JSON.stringify(manifest, null, 2));

  // Upsert a single Report per case (bump version on regeneration).
  const existing = await prisma.report.findFirst({ where: { caseId }, orderBy: { generatedAt: "desc" } });
  const report = existing
    ? await prisma.report.update({
        where: { id: existing.id },
        data: {
          reportType: model.meta.reportType,
          title: `${model.meta.projectName} — ${model.meta.reportTypeLabel}`,
          recommendation: model.meta.recommendation,
          overallScore: model.meta.overallScore,
          confidenceLevel: model.meta.confidenceLevel,
          version: existing.version + 1,
          contentJson: toJson(model),
          qaJson: toJson(model.qa),
          generatedAt: date,
        },
      })
    : await prisma.report.create({
        data: {
          caseId,
          reportType: model.meta.reportType,
          title: `${model.meta.projectName} — ${model.meta.reportTypeLabel}`,
          recommendation: model.meta.recommendation,
          overallScore: model.meta.overallScore,
          confidenceLevel: model.meta.confidenceLevel,
          contentJson: toJson(model),
          qaJson: toJson(model.qa),
          generatedAt: date,
        },
      });

  // Refresh section rows.
  await prisma.reportSection.deleteMany({ where: { reportId: report.id } });
  const included = sectionsFor(model.meta.reportType);
  let order = 0;
  for (const key of SECTION_ORDER) {
    if (!included.has(key)) continue;
    await prisma.reportSection.create({
      data: { reportId: report.id, key, title: SECTION_TITLES[key] ?? key, order: order++, included: true },
    });
  }

  // Refresh non-PDF generated-file rows.
  await prisma.generatedFile.deleteMany({ where: { caseId, kind: { in: ["html", "markdown", "evidence_manifest"] } } });
  const files = [
    { kind: "html", filename: `${base}.html`, ...htmlFile, mimeType: "text/html" },
    { kind: "markdown", filename: `${base}.md`, ...mdFile, mimeType: "text/markdown" },
    { kind: "evidence_manifest", filename: manifestName, ...manifestFile, mimeType: "application/json" },
  ];
  for (const f of files) {
    await prisma.generatedFile.create({
      data: { caseId, reportId: report.id, kind: f.kind, filename: f.filename, path: f.path, mimeType: f.mimeType, sizeBytes: f.sizeBytes },
    });
  }

  return {
    reportId: report.id,
    model,
    html,
    files: files.map((f) => ({ kind: f.kind, filename: f.filename, path: f.path, sizeBytes: f.sizeBytes })),
  };
}

async function buildEvidenceManifest(caseId: string, model: ReportModel): Promise<unknown> {
  const snapshot = await loadSnapshot(caseId);
  return {
    generatedAt: new Date().toISOString(),
    project: model.meta.projectName,
    brand: model.meta.brandName,
    recommendation: model.meta.recommendationLabel,
    overallScore: model.meta.overallScore,
    sources: (snapshot?.sources ?? []).map((s) => ({
      id: s.id,
      name: s.name,
      title: s.title,
      sourceType: s.sourceType,
      reliabilityRating: s.reliabilityRating,
      url: s.url,
      finalUrl: s.finalUrl,
      retrievedAt: s.retrievedAt,
      httpStatus: s.httpStatus,
      contentHash: s.contentHash,
    })),
    evidenceClaims: (snapshot?.evidence ?? []).map((c) => ({
      id: c.id,
      claim: c.claimText,
      sourceId: c.sourceId,
      claimClass: c.claimClass,
      reliabilityRating: c.reliabilityRating,
      confidence: c.confidence,
      corroborated: c.corroborated,
    })),
  };
}
