import { prisma } from "@/lib/db";
import { ok, fail, parseBody } from "@/lib/api";
import { caseCreateSchema } from "@/domain/schemas";
import { intakeToPrisma } from "@/domain/intake-map";

export async function GET() {
  const cases = await prisma.dDCase.findMany({
    orderBy: { updatedAt: "desc" },
    include: {
      scorecard: true,
      _count: { select: { sources: true, findings: true, redFlags: true, reports: true } },
    },
  });
  return ok(cases);
}

export async function POST(req: Request) {
  const parsed = await parseBody(req, caseCreateSchema);
  if ("error" in parsed) return parsed.error;
  const dto = parsed.data;

  try {
    const created = await prisma.dDCase.create({
      data: {
        projectName: dto.projectName,
        clientName: dto.clientName ?? null,
        analyst: dto.analyst ?? null,
        reportType: dto.reportType,
        brand: dto.brand,
        intake: { create: intakeToPrisma(dto.intake ?? {}, dto.projectName) },
      },
      include: { intake: true },
    });
    return ok(created, 201);
  } catch (err) {
    return fail(`Could not create case: ${(err as Error).message}`, 500);
  }
}
