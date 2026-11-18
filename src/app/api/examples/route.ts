import { prisma } from "@/lib/db";
import { ok } from "@/lib/api";
import { createExampleCase, EXAMPLE_PROJECT_NAME } from "@/lib/seed-example";

/** Load the example case, or return the one already loaded. Never overwrites a case. */
export async function POST() {
  const existing = await prisma.dDCase.findFirst({ where: { projectName: EXAMPLE_PROJECT_NAME }, select: { id: true } });
  if (existing) return ok({ id: existing.id, created: false });
  const id = await prisma.$transaction((tx) => createExampleCase(tx), { timeout: 30_000 });
  return ok({ id, created: true }, 201);
}
