import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { migrateDatabase, splitSqlStatements } from "@/lib/migrate";
import { GET, PUT } from "@/app/api/cases/[id]/scorecard/route";
import { runOfflineResearchNow } from "@/harness/orchestrator";
import { buildReportModel } from "@/report/build";
import { computeScorecard, GATING_RULES, SCORE_CATEGORIES } from "./scoring";
import { mergeGating, readResearchGating, readSavedGating } from "./gating";

// Exercise the real API, research and report code against a disposable database.
const testDb = vi.hoisted(() => ({ prisma: undefined as PrismaClient | undefined }));
vi.mock("@/lib/db", () => ({ get prisma() {
  if (!testDb.prisma) throw new Error("Test database is not ready");
  return testDb.prisma;
} }));
vi.mock("@/lib/env", () => ({ env: { keys: {}, connectorTimeoutMs: 25 } }));

let directory: string;
let db: PrismaClient;
const fetchGuard = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network is disabled in scorecard tests"));
const strongScores = Object.fromEntries(SCORE_CATEGORIES.map(({ key }) => [key, 9]));

beforeAll(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "block-consult-scorecard-"));
  const url = `file:${path.join(directory, "test.db")}`;
  await migrateDatabase({ url, dir: path.resolve("prisma/migrations") });
  db = new PrismaClient({ datasources: { db: { url } } });
  testDb.prisma = db;
});

afterAll(async () => {
  await db?.$disconnect();
  if (directory) await rm(directory, { recursive: true, force: true });
  fetchGuard.mockRestore();
});

async function save(caseId: string, values: Record<string, unknown>) {
  const response = await PUT(new Request("http://localhost/api/scorecard", {
    method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...strongScores, ...values }),
  }), { params: Promise.resolve({ id: caseId }) });
  expect(response.status).toBe(200);
  return db.scorecard.findUniqueOrThrow({ where: { caseId } });
}

describe("scorecard blocker persistence", () => {
  it("retains saved blockers through save, reload, research and report, then clears them deliberately", async () => {
    const record = await db.dDCase.create({ data: { projectName: "Synthetic blocker regression" } });
    await save(record.id, { gating: { forgedDocuments: true } });
    const reloaded = await GET(new Request("http://localhost/api/scorecard"), { params: Promise.resolve({ id: record.id }) });
    expect(await reloaded.json()).toMatchObject({ manualGating: '{"forgedDocuments":true}', recommendation: "reject_likely_scam" });
    const resaved = await save(record.id, { notes: "Only notes changed; choices omitted" });
    expect(readSavedGating(resaved.manualGating)).toEqual({ forgedDocuments: true });

    const runId = await runOfflineResearchNow(record.id);
    const run = await db.researchRun.findUniqueOrThrow({ where: { id: runId } });
    expect(run.status, run.error ?? undefined).toBe("completed");
    const research = readResearchGating(run.summaryJson);
    expect(research.forgedDocuments).toBeUndefined();
    const stored = await db.scorecard.findUniqueOrThrow({ where: { caseId: record.id } });
    const preview = computeScorecard(strongScores, mergeGating(research, readSavedGating(stored.manualGating)));
    expect(stored.recommendation).toBe("reject_likely_scam");
    expect(stored.recommendation).toBe(preview.recommendation);
    expect(stored.overallScore).toBe(preview.overallScore);
    const report = await buildReportModel(record.id, { ensureRun: false, applyNarrative: false });
    expect(report.model.meta.recommendation).toBe(preview.recommendation);
    expect(report.model.scorecard.gatingApplied).toEqual(preview.gatingApplied);

    const cleared = await save(record.id, { gating: {} });
    expect(readSavedGating(cleared.manualGating)).toEqual({});
    expect(cleared.recommendation).toBe(computeScorecard(strongScores, research).recommendation);
    expect(cleared.recommendation).not.toBe("reject_likely_scam");
    expect(fetchGuard).not.toHaveBeenCalled();
  });

  it("does not let a false manual choice suppress a true research blocker", async () => {
    const record = await db.dDCase.create({ data: { projectName: "Synthetic research blocker" } });
    await db.researchRun.create({ data: { caseId: record.id, status: "completed", summaryJson: '{"gating":{"forgedDocuments":true}}' } });
    const saved = await save(record.id, { gating: { forgedDocuments: false } });
    expect(saved.recommendation).toBe("reject_likely_scam");
    expect(readSavedGating(saved.manualGating)).toEqual({});
    const report = await buildReportModel(record.id, { ensureRun: false, applyNarrative: false });
    expect(report.model.meta.recommendation).toBe(saved.recommendation);
  });

  it("backfills recognized legacy blocker labels without inventing an origin", async () => {
    const legacy = new PrismaClient({ datasources: { db: { url: `file:${path.join(directory, "legacy.db")}?connection_limit=1` } } });
    try {
      await legacy.$executeRawUnsafe('CREATE TABLE "Scorecard" ("id" TEXT PRIMARY KEY, "gatingApplied" TEXT NOT NULL)');
      const cases = [
        ["all", JSON.stringify(GATING_RULES.map(({ label }) => label))],
        ["malformed", "not json"],
        ["unknown", '["Unrecognized blocker"]'],
        ["object", '{"label":"Forged documents detected"}'],
        ["empty", "[]"],
      ];
      for (const [id, labels] of cases) await legacy.$executeRawUnsafe('INSERT INTO "Scorecard" ("id", "gatingApplied") VALUES (?, ?)', id, labels);
      const sql = await readFile(path.resolve("prisma/migrations/0004_manual_gating/migration.sql"), "utf8");
      for (const statement of splitSqlStatements(sql)) await legacy.$executeRawUnsafe(statement);
      const [engine] = await legacy.$queryRawUnsafe<{ version: string }[]>("SELECT sqlite_version() AS version");
      const rows = await legacy.$queryRawUnsafe<{ id: string; gatingApplied: string; manualGating: string }[]>('SELECT "id", "gatingApplied", "manualGating" FROM "Scorecard"');
      for (const row of rows) {
        const diagnostic = `SQLite ${engine?.version}; legacy migration row ${JSON.stringify(row)}`;
        expect(readSavedGating(row.manualGating), diagnostic).toEqual(row.id === "all" ? Object.fromEntries(GATING_RULES.map(({ flag }) => [flag, true])) : {});
      }
    } finally {
      await legacy.$disconnect();
    }
  });
});
