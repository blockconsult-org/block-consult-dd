/**
 * Brings the database at DATABASE_URL up to date with prisma/migrations, using
 * the same migrator the app runs at startup. Databases created earlier with
 * `prisma db push` are baselined rather than rebuilt.
 *
 *   npm run db:migrate
 */
import { existsSync } from "node:fs";
import { migrateDatabase } from "../src/lib/migrate";

if (!process.env.DATABASE_URL && existsSync(".env")) process.loadEnvFile(".env");

migrateDatabase({ log: (message) => console.log(message) })
  .then((report) => {
    if (report.applied.length === 0 && report.baselined.length === 0) console.log("Database is up to date.");
    if (report.backupPath) console.log(`Backup written to ${report.backupPath}`);
  })
  .catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
