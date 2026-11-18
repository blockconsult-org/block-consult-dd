import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { parseJson, parseStringArray } from "@/domain/json";
import { readScoreSources } from "@/domain/score-sources";
import { readResearchGating, readSavedGating } from "@/domain/gating";
import { activeJob } from "@/ai/jobs";
import { getAiSettings, PROVIDER_SECTION } from "@/ai/settings";
import { PROVIDER_LABELS } from "@/ai/types";
import { CaseWorkspace } from "@/components/case/case-workspace";
import { readAiRunSummary, readRationale, readRunUsage, type AiStatus, type CaseData } from "@/components/case/types";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export default async function CaseDetailPage({ params }: Params) {
  const { id } = await params;
  const [c, aiSettings, latestAiRun, latestCompletedRun] = await Promise.all([
    prisma.dDCase.findUnique({
      where: { id },
      include: {
        intake: true,
        sources: { orderBy: { createdAt: "desc" } },
        evidenceClaims: { orderBy: { createdAt: "desc" } },
        entities: true,
        people: true,
        tokens: { include: { allocations: true, unlocks: true } },
        contracts: true,
        markets: true,
        stablecoins: true,
        rwaAssets: true,
        findings: { orderBy: { createdAt: "desc" } },
        redFlags: { orderBy: { createdAt: "desc" } },
        scorecard: true,
        reports: { orderBy: { generatedAt: "desc" }, include: { files: { orderBy: { kind: "asc" } } } },
        // summaryJson and trace payloads can be large; the workspace needs neither.
        researchRuns: {
          orderBy: { createdAt: "desc" },
          take: 5,
          select: {
            id: true,
            status: true,
            mode: true,
            provider: true,
            model: true,
            stage: true,
            error: true,
            createdAt: true,
            startedAt: true,
            finishedAt: true,
            usageJson: true,
            traces: { select: { worker: true, status: true, confidence: true, durationMs: true, error: true }, orderBy: { startedAt: "asc" } },
          },
        },
      },
    }),
    getAiSettings(),
    prisma.researchRun.findFirst({
      where: { caseId: id, status: "completed", mode: "ai" },
      orderBy: { createdAt: "desc" },
      select: { id: true, provider: true, model: true, finishedAt: true, summaryJson: true },
    }),
    prisma.researchRun.findFirst({
      where: { caseId: id, status: "completed" },
      orderBy: { createdAt: "desc" },
      select: { summaryJson: true },
    }),
  ]);
  if (!c) notFound();

  const providerId = aiSettings.activeProvider;
  const ai: AiStatus = providerId
    ? { configured: true, provider: providerId, label: PROVIDER_LABELS[providerId], model: aiSettings[PROVIDER_SECTION[providerId]].model }
    : { configured: false, provider: null, label: null, model: "" };
  const aiSummary = latestAiRun ? readAiRunSummary(parseJson<unknown>(latestAiRun.summaryJson, null)) : null;

  const intake = c.intake
    ? {
        projectName: c.intake.projectName,
        tickers: parseJson<string[]>(c.intake.tickers, []),
        links: parseJson<string[]>(c.intake.links, []),
        contractAddresses: parseJson<unknown[]>(c.intake.contractAddresses, []),
        chains: parseJson<string[]>(c.intake.chains, []),
        claimedPartnerships: parseJson<string[]>(c.intake.claimedPartnerships, []),
        claimedExchangeListings: parseJson<string[]>(c.intake.claimedExchangeListings, []),
        walletAddresses: parseJson<string[]>(c.intake.walletAddresses, []),
        counterparties: parseJson<unknown[]>(c.intake.counterparties, []),
        documents: parseJson<unknown[]>(c.intake.documents, []),
        questionsToVerify: parseJson<string[]>(c.intake.questionsToVerify, []),
        offerType: c.intake.offerType,
        offerPrice: c.intake.offerPrice,
        investmentAmount: c.intake.investmentAmount,
        lockupVesting: c.intake.lockupVesting,
        sellerDetails: c.intake.sellerDetails,
        clientJurisdiction: c.intake.clientJurisdiction,
        issuerJurisdiction: c.intake.issuerJurisdiction,
        notes: c.intake.notes,
      }
    : null;

  const data: CaseData = {
    id: c.id,
    projectName: c.projectName,
    clientName: c.clientName,
    analyst: c.analyst,
    status: c.status,
    reportType: c.reportType,
    brand: c.brand,
    updatedAt: c.updatedAt.toISOString(),
    intake,
    sources: c.sources.map((s) => ({
      id: s.id,
      name: s.name,
      title: s.title,
      sourceType: s.sourceType,
      url: s.url,
      reliabilityRating: s.reliabilityRating,
      notes: s.notes,
      content: s.content,
      origin: s.origin,
      retrievedBy: s.retrievedBy,
      httpStatus: s.httpStatus,
      finalUrl: s.finalUrl,
    })),
    evidence: c.evidenceClaims.map((e) => ({
      id: e.id,
      claimText: e.claimText,
      sourceType: e.sourceType,
      claimClass: e.claimClass,
      reliabilityRating: e.reliabilityRating,
      confidence: e.confidence,
      corroborated: e.corroborated,
      origin: e.origin,
      topic: e.topic,
      quote: e.quote,
      verification: e.verification,
      sourceUrl: e.sourceUrl,
      sourceTitle: e.sourceTitle,
      sourceId: e.sourceId,
      notes: e.notes,
    })),
    entities: c.entities.map((e) => ({ id: e.id, name: e.name, entityType: e.entityType, jurisdiction: e.jurisdiction })),
    people: c.people.map((p) => ({ id: p.id, fullName: p.fullName, confidence: p.confidence })),
    tokens: c.tokens.map((t) => ({ id: t.id, name: t.name, symbol: t.symbol, allocations: t.allocations.length, unlocks: t.unlocks.length })),
    contracts: c.contracts.map((t) => ({ id: t.id, name: t.name, chain: t.chain, address: t.address, verified: t.verified })),
    markets: c.markets.map((m) => ({ id: m.id, exchange: m.exchange, pair: m.pair, volume24h: m.volume24h })),
    stablecoins: c.stablecoins.map((s) => ({ id: s.id, name: s.name })),
    rwaAssets: c.rwaAssets.map((r) => ({ id: r.id, assetDescription: r.assetDescription })),
    findings: c.findings.map((f) => ({ id: f.id, category: f.category, title: f.title, severity: f.severity, confidence: f.confidence, analysis: f.analysis, impact: f.impact, mitigation: f.mitigation, source: f.source })),
    redFlags: c.redFlags.map((r) => ({ id: r.id, title: r.title, severity: r.severity, evidence: r.evidence, mitigation: r.mitigation })),
    scorecard: c.scorecard
      ? {
          legalRegulatoryClarity: c.scorecard.legalRegulatoryClarity,
          fraudImpersonationRisk: c.scorecard.fraudImpersonationRisk,
          tokenValueCapture: c.scorecard.tokenValueCapture,
          marketLiquidity: c.scorecard.marketLiquidity,
          teamFounderQuality: c.scorecard.teamFounderQuality,
          businessFundamentals: c.scorecard.businessFundamentals,
          valuationAttractiveness: c.scorecard.valuationAttractiveness,
          technicalSafety: c.scorecard.technicalSafety,
          partnershipCredibility: c.scorecard.partnershipCredibility,
          transparencyDisclosure: c.scorecard.transparencyDisclosure,
          overallScore: c.scorecard.overallScore,
          recommendation: c.scorecard.recommendation,
          confidenceLevel: c.scorecard.confidenceLevel,
          notes: c.scorecard.notes,
          gatingApplied: parseStringArray(c.scorecard.gatingApplied),
          manualGating: readSavedGating(c.scorecard.manualGating),
          scoreSources: readScoreSources(c.scorecard.scoreSources),
          rationale: readRationale(parseJson<unknown>(c.scorecard.rationale, {})),
        }
      : null,
    researchGating: readResearchGating(latestCompletedRun?.summaryJson),
    reports: c.reports.map((r) => ({ id: r.id, title: r.title, version: r.version, recommendation: r.recommendation, overallScore: r.overallScore, qaJson: r.qaJson, generatedAt: r.generatedAt.toISOString(), files: r.files.map((f) => ({ id: f.id, kind: f.kind, filename: f.filename, sizeBytes: f.sizeBytes })) })),
    researchRuns: c.researchRuns.map((run) => ({
      id: run.id,
      status: run.status,
      mode: run.mode,
      provider: run.provider,
      model: run.model,
      stage: run.stage,
      error: run.error,
      createdAt: run.createdAt.toISOString(),
      startedAt: run.startedAt?.toISOString() ?? null,
      finishedAt: run.finishedAt?.toISOString() ?? null,
      usage: readRunUsage(parseJson<unknown>(run.usageJson, null)),
      traces: run.traces.map((t) => ({ worker: t.worker, status: t.status, confidence: t.confidence, durationMs: t.durationMs, error: t.error })),
    })),
    activeRun: activeJob(c.id),
    ai,
    latestAiSummary:
      latestAiRun && aiSummary
        ? {
            runId: latestAiRun.id,
            finishedAt: latestAiRun.finishedAt?.toISOString() ?? null,
            provider: latestAiRun.provider,
            model: latestAiRun.model,
            summary: aiSummary,
          }
        : null,
  };

  return <CaseWorkspace data={data} />;
}
