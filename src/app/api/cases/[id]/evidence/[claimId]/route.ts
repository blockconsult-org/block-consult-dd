import { prisma } from "@/lib/db";
import { ok, fail } from "@/lib/api";

type Params = { params: Promise<{ id: string; claimId: string }> };

export async function DELETE(_req: Request, { params }: Params) {
  const { id, claimId } = await params;
  try {
    const { count } = await prisma.evidenceClaim.deleteMany({ where: { id: claimId, caseId: id } });
    return count > 0 ? ok({ deleted: true }) : fail("Claim not found", 404);
  } catch (err) {
    return fail(`Could not delete claim: ${err instanceof Error ? err.message : String(err)}`, 500);
  }
}
