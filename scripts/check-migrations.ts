/**
 * Smoke-test the runtime migrator: copies the dev database (if any) and a fresh
 * database into a temp folder, migrates both twice, and prints row counts so
 * data loss during table rebuilds would show up.
 *
 *   npx tsx scripts/check-migrations.ts
 */
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { migrateDatabase } from "../src/lib/migrate";

async function counts(url: string) {
  const db = new PrismaClient({ datasources: { db: { url } } });
  try {
    return {
      cases: await db.dDCase.count(),
      claims: await db.evidenceClaim.count(),
      claimsWithSource: await db.evidenceClaim.count({ where: { sourceId: { not: null } } }),
      traces: await db.workerTrace.count(),
      redFlags: await db.redFlag.count(),
      migrations: (await db.$queryRawUnsafe<{ migration_name: string }[]>('SELECT migration_name FROM "_prisma_migrations" ORDER BY migration_name')).map((r) => r.migration_name),
    };
  } finally {
    await db.$disconnect();
  }
}

async function main() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "bc-migrate-"));
  const targets: string[] = ["fresh.db"];
  try {
    await fs.copyFile(path.resolve("prisma", "dev.db"), path.join(dir, "existing.db"));
    targets.unshift("existing.db");
  } catch {
    console.log("no prisma/dev.db to copy; testing a fresh database only");
  }
  for (const name of targets) {
    const url = `file:${path.join(dir, name)}`;
    const first = await migrateDatabase({ url, log: (m) => console.log(`${name}: ${m}`) });
    const second = await migrateDatabase({ url });
    console.log(name, { first, secondApplied: second.applied, secondBaselined: second.baselined }, await counts(url));
  }
  await fs.rm(dir, { recursive: true, force: true });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
