import { z } from "zod";
import { prisma } from "@/lib/db";
import { ok, fail, parseBody } from "@/lib/api";
import { parseJson } from "@/domain/json";
import { RESEARCH_MODE } from "@/domain/enums";
import { executeResearchRun } from "@/harness/orchestrator";
import { activeJob, startJob } from "@/ai/jobs";
import { getActiveProvider } from "@/ai/registry";
import { AiError } from "@/ai/types";

type Params = { params: Promise<{ id: string }> };

const startSchema = z.object({ mode: z.enum(RESEARCH_MODE).default("offline") });

export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;
  const runs = await prisma.researchRun.findMany({
    where: { caseId: id },
    orderBy: { createdAt: "desc" },
    take: 10,
    include: { traces: { select: { worker: true, status: true, confidence: true, durationMs: true, error: true }, orderBy: { startedAt: "asc" } } },
  });
  return ok({
    active: activeJob(id),
    runs: runs.map((run) => ({
      id: run.id,
      status: run.status,
      mode: run.mode,
      provider: run.provider,
      model: run.model,
      stage: run.stage,
      error: run.error,
      createdAt: run.createdAt,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
      usage: parseJson<Record<string, unknown>>(run.usageJson, {}),
      traces: run.traces,
    })),
  });
}

export async function POST(req: Request, { params }: Params) {
  const { id } = await params;
  const parsed = await parseBody(req, startSchema);
  if ("error" in parsed) return parsed.error;
  const mode = parsed.data.mode ?? "offline";

  const caseRow = await prisma.dDCase.findUnique({ where: { id }, select: { id: true, reportType: true } });
  if (!caseRow) return fail("Case not found", 404);
  if (activeJob(id)) return fail("A research run is already in progress for this case.", 409);

  let provider: string | null = null;
  let model: string | null = null;
  if (mode === "ai") {
    try {
      const active = await getActiveProvider();
      provider = active.id;
      model = active.model || null;
    } catch (err) {
      if (err instanceof AiError) return fail(err.message, 400);
      throw err;
    }
  }

  const run = await prisma.researchRun.create({
    data: { caseId: id, status: "queued", mode, provider, model, stage: "Queued", reportType: caseRow.reportType },
  });
  const started = startJob(id, run.id, (signal) => executeResearchRun({ runId: run.id, caseId: id, mode, signal }));
  if (!started) {
    await prisma.researchRun.update({
      where: { id: run.id },
      data: { status: "failed", stage: null, finishedAt: new Date(), error: "Another run for this case started at the same time." },
    });
    return fail("A research run is already in progress for this case.", 409);
  }
  return ok({ runId: run.id, status: "queued", mode }, 202);
}
