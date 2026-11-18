import { prisma } from "@/lib/db";
import { ok, fail, parseBody } from "@/lib/api";
import { toJson } from "@/domain/json";
import { mergeGating, readResearchGating, savedGatingAfterEdit } from "@/domain/gating";
import { scorecardSchema } from "@/domain/schemas";
import { readScoreSources, sourcesAfterEdit } from "@/domain/score-sources";
import { computeScorecard, SCORE_CATEGORIES, type ScoreInput } from "@/domain/scoring";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;
  const sc = await prisma.scorecard.findUnique({ where: { caseId: id } });
  return ok(sc);
}

export async function PUT(req: Request, { params }: Params) {
  const { id } = await params;
  const parsed = await parseBody(req, scorecardSchema);
  if ("error" in parsed) return parsed.error;
  const d = parsed.data;

  const [run, existing] = await Promise.all([
    prisma.researchRun.findFirst({ where: { caseId: id, status: "completed" }, orderBy: { createdAt: "desc" } }),
    prisma.scorecard.findUnique({ where: { caseId: id } }),
  ]);
  const manualGating = savedGatingAfterEdit(existing?.manualGating, d.gating);
  const gating = mergeGating(readResearchGating(run?.summaryJson), manualGating);

  const scores: ScoreInput = {};
  for (const cat of SCORE_CATEGORIES) {
    const v = d[cat.key];
    scores[cat.key] = typeof v === "number" ? v : null;
  }
  const result = computeScorecard(scores, gating);

  const previous: ScoreInput = {};
  for (const cat of SCORE_CATEGORIES) previous[cat.key] = existing ? existing[cat.key] : null;
  const scoreSources = toJson(sourcesAfterEdit(previous, scores, readScoreSources(existing?.scoreSources)));

  try {
    const saved = await prisma.scorecard.upsert({
      where: { caseId: id },
      update: {
        ...scoreData(scores),
        overallScore: result.overallScore,
        recommendation: result.recommendation,
        confidenceLevel: d.confidenceLevel,
        gatingApplied: toJson(result.gatingApplied),
        manualGating: toJson(manualGating),
        rationale: toJson(d.rationale),
        scoreSources,
        notes: d.notes ?? null,
      },
      create: {
        caseId: id,
        ...scoreData(scores),
        overallScore: result.overallScore,
        recommendation: result.recommendation,
        confidenceLevel: d.confidenceLevel,
        gatingApplied: toJson(result.gatingApplied),
        manualGating: toJson(manualGating),
        rationale: toJson(d.rationale),
        scoreSources,
        notes: d.notes ?? null,
      },
    });
    return ok({ scorecard: saved, computed: result });
  } catch (err) {
    return fail(`Could not save scorecard: ${(err as Error).message}`, 500);
  }
}

function scoreData(scores: ScoreInput): Record<string, number | null> {
  const data: Record<string, number | null> = {};
  for (const cat of SCORE_CATEGORIES) data[cat.key] = scores[cat.key] ?? null;
  return data;
}
