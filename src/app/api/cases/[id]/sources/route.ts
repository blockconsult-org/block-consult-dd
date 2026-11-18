import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import { ok, fail, parseBody } from "@/lib/api";
import { sourceSchema } from "@/domain/schemas";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;
  const sources = await prisma.source.findMany({ where: { caseId: id }, orderBy: { createdAt: "desc" } });
  return ok(sources);
}

export async function POST(req: Request, { params }: Params) {
  const { id } = await params;
  const parsed = await parseBody(req, sourceSchema);
  if ("error" in parsed) return parsed.error;
  const d = parsed.data;
  const contentHash = d.content ? createHash("sha256").update(d.content).digest("hex") : null;

  try {
    const source = await prisma.source.create({
      data: {
        caseId: id,
        name: d.name,
        title: d.title ?? null,
        sourceType: d.sourceType,
        url: d.url ?? null,
        finalUrl: d.finalUrl ?? null,
        retrievedAt: d.retrievedAt ?? new Date(),
        retrievedBy: d.retrievedBy ?? "analyst",
        httpStatus: d.httpStatus ?? null,
        content: d.content ?? null,
        contentHash,
        reliabilityRating: d.reliabilityRating,
        notes: d.notes ?? null,
      },
    });
    return ok(source, 201);
  } catch (err) {
    return fail(`Could not add source: ${(err as Error).message}`, 500);
  }
}
