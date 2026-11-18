/**
 * Runtime SQL migrator. Applies prisma/migrations/<name>/migration.sql in order
 * without the Prisma CLI, so the desktop app can create and upgrade its
 * database on launch.
 *
 * It records progress in Prisma Migrate's own `_prisma_migrations` table
 * (sha256 checksum of the file), so `prisma migrate` still works on the same
 * database during development. A database created earlier with `prisma db push`
 * (no migrations table, but app tables present) is baselined: the first
 * migration is marked as applied instead of being run.
 *
 * Prisma's SQLite migrations rebuild tables with foreign keys disabled. A
 * PRAGMA only affects one connection and is ignored inside a transaction, so
 * migrations run on a dedicated single-connection client: foreign keys off,
 * BEGIN, statements, COMMIT, foreign keys on, then an integrity check.
 */
import { createHash, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { migrationsDir, sqliteFileFromUrl } from "./paths";

export interface MigrationFile {
  name: string;
  sql: string;
  checksum: string;
}

export interface MigrationReport {
  applied: string[];
  baselined: string[];
  backupPath: string | null;
}

/** Split a SQL script into statements, ignoring comments and quoted semicolons. */
export function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = "";
  let i = 0;
  while (i < sql.length) {
    const ch = sql[i] ?? "";
    const next = sql[i + 1] ?? "";
    if (ch === "-" && next === "-") {
      const end = sql.indexOf("\n", i);
      i = end === -1 ? sql.length : end + 1;
      continue;
    }
    if (ch === "/" && next === "*") {
      const end = sql.indexOf("*/", i + 2);
      i = end === -1 ? sql.length : end + 2;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === "`") {
      let j = i + 1;
      while (j < sql.length) {
        if (sql[j] === ch) {
          if (sql[j + 1] === ch) {
            j += 2; // escaped quote
            continue;
          }
          break;
        }
        j += 1;
      }
      current += sql.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    if (ch === ";") {
      if (current.trim()) statements.push(current.trim());
      current = "";
      i += 1;
      continue;
    }
    current += ch;
    i += 1;
  }
  if (current.trim()) statements.push(current.trim());
  return statements;
}

export async function loadMigrations(dir: string = migrationsDir()): Promise<MigrationFile[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const names = entries
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
  const out: MigrationFile[] = [];
  for (const name of names) {
    let sql: string;
    try {
      sql = await fs.readFile(path.join(dir, name, "migration.sql"), "utf8");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw err;
    }
    out.push({ name, sql, checksum: createHash("sha256").update(sql).digest("hex") });
  }
  return out;
}

function singleConnectionUrl(url: string): string {
  if (!url.startsWith("file:")) return url;
  const sep = url.includes("?") ? "&" : "?";
  return /[?&]connection_limit=/.test(url) ? url : `${url}${sep}connection_limit=1`;
}

interface MigrationRow {
  migration_name: string;
  finished_at: unknown;
  rolled_back_at: unknown;
}

async function tableExists(db: PrismaClient, table: string): Promise<boolean> {
  const rows = await db.$queryRawUnsafe<{ name: string }[]>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
    table,
  );
  return rows.length > 0;
}

async function runStatement(db: PrismaClient, statement: string): Promise<void> {
  // PRAGMAs may return rows, which executeRaw rejects on SQLite.
  if (/^pragma\b/i.test(statement)) await db.$queryRawUnsafe(statement);
  else await db.$executeRawUnsafe(statement);
}

async function backupDatabase(url: string): Promise<string | null> {
  const file = sqliteFileFromUrl(url);
  if (!file) return null;
  try {
    await fs.access(file);
  } catch {
    return null;
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const target = `${file}.backup-${stamp}`;
  await fs.copyFile(file, target);
  return target;
}

export async function migrateDatabase(options: { url?: string; dir?: string; log?: (msg: string) => void } = {}): Promise<MigrationReport> {
  const url = options.url ?? process.env.DATABASE_URL ?? "file:./dev.db";
  const log = options.log ?? (() => undefined);
  const migrations = await loadMigrations(options.dir);
  const report: MigrationReport = { applied: [], baselined: [], backupPath: null };
  if (migrations.length === 0) return report;

  const db = new PrismaClient({ datasources: { db: { url: singleConnectionUrl(url) } } });
  try {
    await db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
      "id" TEXT PRIMARY KEY NOT NULL,
      "checksum" TEXT NOT NULL,
      "finished_at" DATETIME,
      "migration_name" TEXT NOT NULL,
      "logs" TEXT,
      "rolled_back_at" DATETIME,
      "started_at" DATETIME NOT NULL DEFAULT current_timestamp,
      "applied_steps_count" INTEGER UNSIGNED NOT NULL DEFAULT 0
    )`);

    const rows = await db.$queryRawUnsafe<MigrationRow[]>(
      'SELECT migration_name, finished_at, rolled_back_at FROM "_prisma_migrations"',
    );
    const unfinished = rows.find((r) => r.finished_at == null && r.rolled_back_at == null);
    if (unfinished) {
      throw new Error(
        `Migration ${unfinished.migration_name} did not finish on a previous run. Restore the most recent database backup or resolve it with \`prisma migrate resolve\`.`,
      );
    }
    const done = new Set(rows.filter((r) => r.rolled_back_at == null).map((r) => r.migration_name));

    const first = migrations[0];
    if (first && done.size === 0 && (await tableExists(db, "DDCase"))) {
      // Created with `prisma db push` before migrations existed.
      await db.$executeRawUnsafe(
        'INSERT INTO "_prisma_migrations" (id, checksum, migration_name, started_at, finished_at, applied_steps_count, logs) VALUES (?, ?, ?, ?, ?, 0, ?)',
        randomUUID(),
        first.checksum,
        first.name,
        Date.now(),
        Date.now(),
        "baselined from an existing database",
      );
      done.add(first.name);
      report.baselined.push(first.name);
      log(`baselined ${first.name}`);
    }

    const pending = migrations.filter((m) => !done.has(m.name));
    if (pending.length === 0) return report;
    if (await tableExists(db, "DDCase")) report.backupPath = await backupDatabase(url);

    for (const migration of pending) {
      const id = randomUUID();
      await db.$executeRawUnsafe("PRAGMA foreign_keys=OFF");
      await db.$executeRawUnsafe("BEGIN IMMEDIATE");
      try {
        await db.$executeRawUnsafe(
          'INSERT INTO "_prisma_migrations" (id, checksum, migration_name, started_at, applied_steps_count) VALUES (?, ?, ?, ?, 0)',
          id,
          migration.checksum,
          migration.name,
          Date.now(),
        );
        for (const statement of splitSqlStatements(migration.sql)) await runStatement(db, statement);
        await db.$executeRawUnsafe(
          'UPDATE "_prisma_migrations" SET finished_at = ?, applied_steps_count = 1 WHERE id = ?',
          Date.now(),
          id,
        );
        await db.$executeRawUnsafe("COMMIT");
      } catch (err) {
        await db.$executeRawUnsafe("ROLLBACK").catch(() => undefined);
        throw new Error(`Migration ${migration.name} failed: ${(err as Error).message}`);
      } finally {
        await db.$executeRawUnsafe("PRAGMA foreign_keys=ON");
      }
      const violations = await db.$queryRawUnsafe<unknown[]>("PRAGMA foreign_key_check");
      if (violations.length > 0) log(`warning: ${violations.length} foreign key violation(s) after ${migration.name}`);
      report.applied.push(migration.name);
      log(`applied ${migration.name}`);
    }
    return report;
  } finally {
    await db.$disconnect();
  }
}
