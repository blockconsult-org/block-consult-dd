import { describe, expect, it } from "vitest";
import { loadMigrations, splitSqlStatements } from "./migrate";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

describe("splitSqlStatements", () => {
  it("splits on semicolons outside comments, strings and quoted identifiers", () => {
    const sql = `
      -- a comment; with a semicolon
      CREATE TABLE "a;b" ("id" TEXT DEFAULT 'x;y', "note" TEXT DEFAULT 'it''s; fine');
      /* block; comment */
      INSERT INTO "a;b" ("id") VALUES ('1');;
    `;
    expect(splitSqlStatements(sql)).toEqual([
      `CREATE TABLE "a;b" ("id" TEXT DEFAULT 'x;y', "note" TEXT DEFAULT 'it''s; fine')`,
      `INSERT INTO "a;b" ("id") VALUES ('1')`,
    ]);
  });

  it("splits every shipped migration into executable statements", async () => {
    const migrations = await loadMigrations();
    expect(migrations.length).toBeGreaterThan(0);
    for (const migration of migrations) {
      const statements = splitSqlStatements(migration.sql);
      expect(statements.length, migration.name).toBeGreaterThan(0);
      for (const statement of statements) {
        expect(statement, migration.name).toMatch(/^(CREATE|ALTER|DROP|INSERT|UPDATE|DELETE|PRAGMA)\b/i);
      }
    }
  });
});

it("detaches legacy live PDFs while retaining exports and saved snapshot files", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "bc-pdf-migration-"));
  const db = new PrismaClient({ datasources: { db: { url: `file:${path.join(directory, "legacy.db")}` } } });
  try {
    await db.$executeRawUnsafe('CREATE TABLE "GeneratedFile" ("id" TEXT PRIMARY KEY, "kind" TEXT, "reportId" TEXT, "path" TEXT)');
    await db.$executeRawUnsafe("INSERT INTO GeneratedFile VALUES ('pdf', 'pdf', 'saved-report', 'case/old.pdf'), ('html', 'html', 'saved-report', 'case/saved.html')");
    const sql = await readFile(path.resolve("prisma/migrations/0005_detach_live_pdf_exports/migration.sql"), "utf8");
    for (const statement of splitSqlStatements(sql)) await db.$executeRawUnsafe(statement);
    expect(await db.$queryRawUnsafe('SELECT * FROM "GeneratedFile" ORDER BY "id"')).toEqual([
      { id: "html", kind: "html", reportId: "saved-report", path: "case/saved.html" },
      { id: "pdf", kind: "pdf", reportId: null, path: "case/old.pdf" },
    ]);
  } finally {
    await db.$disconnect();
    await rm(directory, { recursive: true, force: true });
  }
});
