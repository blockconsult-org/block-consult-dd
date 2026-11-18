import { prisma } from "@/lib/db";
import { ok, fail, parseBody } from "@/lib/api";
import { toJson } from "@/domain/json";
import { evidenceClaimSchema } from "@/domain/schemas";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;
  const claims = await prisma.evidenceClaim.findMany({ where: { caseId: id }, orderBy: { createdAt: "desc" } });
  return ok(claims);
}

export async function POST(req: Request, { params }: Params) {
  const { id } = await params;
  const parsed = await parseBody(req, evidenceClaimSchema);
  if ("error" in parsed) return parsed.error;
  const d = parsed.data;

  // If linked to a source, inherit its url/title/type when not supplied.
  let sourceUrl: string | undefined = d.sourceUrl;
  let sourceTitle: string | undefined = d.sourceTitle;
  let sourceType: string = d.sourceType ?? "unknown";
  if (d.sourceId) {
    const src = await prisma.source.findUnique({ where: { id: d.sourceId } });
    if (src) {
      sourceUrl = sourceUrl ?? src.url ?? undefined;
      sourceTitle = sourceTitle ?? src.title ?? src.name;
      if (d.sourceType === "unknown") sourceType = src.sourceType;
    }
  }

  try {
    const claim = await prisma.evidenceClaim.create({
      data: {
        caseId: id,
        sourceId: d.sourceId ?? null,
        claimText: d.claimText,
        sourceUrl: sourceUrl ?? null,
        sourceTitle: sourceTitle ?? null,
        sourceType: sourceType ?? "unknown",
        claimClass: d.claimClass,
        reliabilityRating: d.reliabilityRating,
        confidence: d.confidence,
        corroborated: d.corroborated,
        corroboratingIds: toJson(d.corroboratingIds),
        notes: d.notes ?? null,
      },
    });
    return ok(claim, 201);
  } catch (err) {
    return fail(`Could not add evidence claim: ${(err as Error).message}`, 500);
  }
}
