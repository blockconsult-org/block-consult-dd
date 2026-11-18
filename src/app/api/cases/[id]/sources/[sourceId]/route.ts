import { prisma } from "@/lib/db";
import { ok, fail } from "@/lib/api";

type Params = { params: Promise<{ id: string; sourceId: string }> };

export async function DELETE(_req: Request, { params }: Params) {
  const { id, sourceId } = await params;
  try {
    // Scoped to the case so a source id from another case cannot be deleted through this URL.
    const { count } = await prisma.source.deleteMany({ where: { id: sourceId, caseId: id } });
    return count > 0 ? ok({ deleted: true }) : fail("Source not found", 404);
  } catch (err) {
    return fail(`Could not delete source: ${err instanceof Error ? err.message : String(err)}`, 500);
  }
}
