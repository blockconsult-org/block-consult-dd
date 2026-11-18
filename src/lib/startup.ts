import { migrateDatabase } from "./migrate";
import { prisma } from "./db";

export async function prepareServer(): Promise<void> {
  const report = await migrateDatabase({ log: (msg) => console.log(`[db] ${msg}`) });
  if (report.backupPath) console.log(`[db] backup written to ${report.backupPath}`);

  const interrupted = await prisma.researchRun.updateMany({
    where: { status: { in: ["queued", "running"] } },
    data: {
      status: "failed",
      stage: null,
      finishedAt: new Date(),
      error: "Interrupted: the app stopped before this run finished. Start the research again.",
    },
  });
  if (interrupted.count > 0) console.log(`[research] marked ${interrupted.count} interrupted run(s) as failed`);
}
