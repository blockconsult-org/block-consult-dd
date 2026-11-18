import { prisma } from "@/lib/db";
import { ok, fail, parseBody } from "@/lib/api";
import { caseUpdateSchema } from "@/domain/schemas";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;
  const c = await prisma.dDCase.findUnique({
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
      redFlags: true,
      scorecard: true,
      reports: { orderBy: { generatedAt: "desc" }, include: { files: true } },
      researchRuns: { orderBy: { createdAt: "desc" }, take: 5, include: { traces: true } },
    },
  });
  if (!c) return fail("Case not found", 404);
  return ok(c);
}

export async function PATCH(req: Request, { params }: Params) {
  const { id } = await params;
  const parsed = await parseBody(req, caseUpdateSchema);
  if ("error" in parsed) return parsed.error;
  try {
    const updated = await prisma.dDCase.update({ where: { id }, data: parsed.data });
    return ok(updated);
  } catch (err) {
    return fail(`Could not update case: ${(err as Error).message}`, 500);
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  const { id } = await params;
  try {
    await prisma.dDCase.delete({ where: { id } });
    return ok({ deleted: true });
  } catch (err) {
    return fail(`Could not delete case: ${(err as Error).message}`, 500);
  }
}
