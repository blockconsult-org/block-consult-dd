import { prisma } from "@/lib/db";
import { ok } from "@/lib/api";

const DAY_MS = 86_400_000;

async function totals(since?: Date) {
  const rows = await prisma.aiCall.groupBy({
    by: ["provider"],
    where: since ? { createdAt: { gte: since } } : undefined,
    _count: { _all: true },
    _sum: { inputTokens: true, outputTokens: true, webSearches: true, costUsd: true },
  });
  return rows.map((row) => ({
    provider: row.provider,
    calls: row._count._all,
    inputTokens: row._sum.inputTokens ?? 0,
    outputTokens: row._sum.outputTokens ?? 0,
    webSearches: row._sum.webSearches ?? 0,
    costUsd: row._sum.costUsd,
  }));
}

/** AI usage recorded by this install: per-provider totals and the latest calls. Prompts and outputs are not stored. */
export async function GET() {
  const since = new Date(Date.now() - 30 * DAY_MS);
  const [last30Days, allTime, recent] = await Promise.all([
    totals(since),
    totals(),
    prisma.aiCall.findMany({
      orderBy: { createdAt: "desc" },
      take: 25,
      select: {
        id: true,
        caseId: true,
        purpose: true,
        provider: true,
        model: true,
        status: true,
        inputTokens: true,
        outputTokens: true,
        webSearches: true,
        costUsd: true,
        durationMs: true,
        error: true,
        createdAt: true,
      },
    }),
  ]);
  return ok({ since, last30Days, allTime, recent });
}
