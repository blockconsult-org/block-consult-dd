/**
 * Development seed: replaces the example case (see src/lib/seed-example.ts).
 * Deletes any earlier case with the same project name first.
 */
import { PrismaClient } from "@prisma/client";
import { createExampleCase, EXAMPLE_PROJECT_NAME } from "../src/lib/seed-example";

const prisma = new PrismaClient();

async function main(): Promise<void> {
  await prisma.dDCase.deleteMany({ where: { projectName: EXAMPLE_PROJECT_NAME } });
  const caseId = await prisma.$transaction((tx) => createExampleCase(tx), { timeout: 30_000 });
  console.log(`Seeded case ${caseId} — "${EXAMPLE_PROJECT_NAME}"`);
  console.log(`Open: /cases/${caseId}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
