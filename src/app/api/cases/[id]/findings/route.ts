import { prisma } from "@/lib/db";
import { ok, fail, parseBody } from "@/lib/api";
import { toJson } from "@/domain/json";
import { findingSchema } from "@/domain/schemas";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;
  const findings = await prisma.riskFinding.findMany({ where: { caseId: id }, orderBy: { createdAt: "desc" } });
  return ok(findings);
}

export async function POST(req: Request, { params }: Params) {
  const { id } = await params;
  const parsed = await parseBody(req, findingSchema);
  if ("error" in parsed) return parsed.error;
  const d = parsed.data;
  try {
    const finding = await prisma.riskFinding.create({
      data: {
        caseId: id,
        category: d.category,
        title: d.title,
        claim: d.claim ?? null,
        analysis: d.analysis ?? null,
        severity: d.severity,
        confidence: d.confidence,
        impact: d.impact ?? null,
        mitigation: d.mitigation ?? null,
        openQuestions: toJson(d.openQuestions),
        evidenceIds: toJson(d.evidenceIds),
        source: "manual",
      },
    });
    return ok(finding, 201);
  } catch (err) {
    return fail(`Could not add finding: ${(err as Error).message}`, 500);
  }
}
