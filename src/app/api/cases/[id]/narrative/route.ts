import { prisma } from "@/lib/db";
import { fail, ok } from "@/lib/api";
import { activeJob } from "@/ai/jobs";
import { generateNarrative } from "@/ai/narrative";
import { aiErrorStatus, isAiError } from "@/ai/settings-view";
import { buildReportModel } from "@/report/build";
import { loadNarrative, providerLabel } from "@/report/narrative";

type Params = { params: Promise<{ id: string }> };

async function narrativeStatus(caseId: string) {
  const stored = await loadNarrative(caseId);
  if (!stored) return { narrative: null };
  const { model } = await buildReportModel(caseId, { ensureRun: false });
  return {
    narrative: {
      provider: stored.provider,
      providerLabel: providerLabel(stored.provider),
      model: stored.model,
      updatedAt: stored.updatedAt,
      /** ai: used in the report. ai_stale: the results changed since it was drafted. */
      state: model.meta.narrative,
    },
  };
}

export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;
  const exists = await prisma.dDCase.count({ where: { id } });
  if (!exists) return fail("Case not found", 404);
  return ok(await narrativeStatus(id));
}

/** Draft the report narrative with the active AI provider. Takes up to a few minutes. */
export async function POST(req: Request, { params }: Params) {
  const { id } = await params;
  const exists = await prisma.dDCase.count({ where: { id } });
  if (!exists) return fail("Case not found", 404);
  if (activeJob(id)) return fail("Wait for the research run to finish before drafting the narrative.", 409);
  try {
    const result = await generateNarrative(id, req.signal);
    return ok({ ...(await narrativeStatus(id)), usage: result.usage, notes: result.notes });
  } catch (err) {
    if (isAiError(err)) return fail(err.message, aiErrorStatus(err.code), { code: err.code });
    throw err;
  }
}

/** Remove the AI draft; the report goes back to the built-in text. */
export async function DELETE(_req: Request, { params }: Params) {
  const { id } = await params;
  const removed = await prisma.caseNarrative.deleteMany({ where: { caseId: id } });
  return ok({ deleted: removed.count > 0 });
}
