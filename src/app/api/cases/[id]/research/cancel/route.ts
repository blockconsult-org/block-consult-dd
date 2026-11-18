import { prisma } from "@/lib/db";
import { ok } from "@/lib/api";
import { cancelJob } from "@/ai/jobs";

type Params = { params: Promise<{ id: string }> };

/** Stop the case's running research job. A run left "running" by a crashed job is closed out instead. */
export async function POST(_req: Request, { params }: Params) {
  const { id } = await params;
  if (cancelJob(id)) return ok({ cancelled: true });
  const stale = await prisma.researchRun.updateMany({
    where: { caseId: id, status: { in: ["queued", "running"] } },
    data: { status: "cancelled", stage: null, finishedAt: new Date(), error: "Cancelled by the analyst." },
  });
  return ok({ cancelled: stale.count > 0 });
}
