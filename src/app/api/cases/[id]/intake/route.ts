import { prisma } from "@/lib/db";
import { ok, fail, parseBody } from "@/lib/api";
import { intakeSchema } from "@/domain/schemas";
import { intakeToPrisma } from "@/domain/intake-map";

type Params = { params: Promise<{ id: string }> };

export async function PUT(req: Request, { params }: Params) {
  const { id } = await params;
  const parsed = await parseBody(req, intakeSchema);
  if ("error" in parsed) return parsed.error;
  const data = intakeToPrisma(parsed.data, parsed.data.projectName);

  try {
    const updated = await prisma.intakeInput.upsert({
      where: { caseId: id },
      update: data,
      create: { caseId: id, ...data },
    });
    // Keep the case projectName in sync with intake.
    await prisma.dDCase.update({ where: { id }, data: { projectName: parsed.data.projectName } });
    return ok(updated);
  } catch (err) {
    return fail(`Could not save intake: ${(err as Error).message}`, 500);
  }
}
