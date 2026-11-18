import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { migrateDatabase } from "@/lib/migrate";
import { GET, PATCH } from "@/app/api/cases/[id]/records/[type]/[recordId]/route";
import { buildRecordPatch, recordDefinition } from "./record-edit";

const fixture = vi.hoisted(() => ({ prisma: undefined as PrismaClient | undefined }));
vi.mock("@/lib/db", () => ({ get prisma() {
  if (!fixture.prisma) throw new Error("Fixture not ready");
  return fixture.prisma;
} }));

let directory: string;
let db: PrismaClient;
beforeAll(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "block-consult-record-edit-"));
  const url = `file:${path.join(directory, "records.db")}`;
  await migrateDatabase({ url, dir: path.resolve("prisma/migrations") });
  db = new PrismaClient({ datasources: { db: { url } } });
  fixture.prisma = db;
});
afterAll(async () => {
  await db?.$disconnect();
  if (directory) await rm(directory, { recursive: true, force: true });
});

function patch(caseId: string, recordId: string, data: Record<string, unknown>) {
  return PATCH(new Request("http://localhost/api/records", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(data) }), {
    params: Promise.resolve({ id: caseId, type: "token", recordId }),
  });
}

describe("structured record editing", () => {
  it("updates fields while preserving hidden values and nested schedule records", async () => {
    const c = await db.dDCase.create({ data: { projectName: "Fictional record editing case" } });
    const token = await db.token.create({ data: {
      caseId: c.id, name: "Example token", symbol: "EX", chain: "Ethereum", utility: '["Voting"]', rightsDisclaimer: "No equity rights",
      allocations: { create: { category: "Team", percentageTotal: 12, confidence: "high", vestingTerms: "48 months" } },
      unlocks: { create: { date: "2030-01-01", percentageSupply: 3, category: "Team", cliff: true, source: "Fictional schedule" } },
    }, include: { allocations: true, unlocks: true } });
    expect((await patch(c.id, token.id, { name: "Reviewed token", symbol: null, price: 1.25 })).status).toBe(200);
    const updated = await db.token.findUniqueOrThrow({ where: { id: token.id }, include: { allocations: true, unlocks: true } });
    expect(updated).toMatchObject({ name: "Reviewed token", symbol: null, price: 1.25, chain: token.chain, utility: token.utility, rightsDisclaimer: token.rightsDisclaimer });
    expect(updated.allocations).toEqual(token.allocations);
    expect(updated.unlocks).toEqual(token.unlocks);
    expect((await db.dDCase.findUniqueOrThrow({ where: { id: c.id } })).updatedAt.getTime()).toBeGreaterThanOrEqual(c.updatedAt.getTime());
  });

  it("rejects cross-case reads and writes and changes outside the editable whitelist", async () => {
    const owner = await db.dDCase.create({ data: { projectName: "Fictional owner" } });
    const other = await db.dDCase.create({ data: { projectName: "Fictional other case" } });
    const token = await db.token.create({ data: { caseId: owner.id, name: "Original" } });
    const params = { params: Promise.resolve({ id: other.id, type: "token", recordId: token.id }) };
    expect((await GET(new Request("http://localhost/api/records"), params)).status).toBe(404);
    expect((await patch(other.id, token.id, { name: "Wrong case" })).status).toBe(404);
    expect((await patch(owner.id, token.id, { name: "", caseId: other.id })).status).toBe(422);
    expect((await patch(owner.id, token.id, { allocations: [] })).status).toBe(422);
    expect((await db.token.findUniqueOrThrow({ where: { id: token.id } })).name).toBe("Original");
  });

  it("sends only changed form values, including explicit clears and unchecked flags", () => {
    const baseline = new FormData();
    baseline.set("name", "Reviewed contract");
    baseline.set("verified", "on");
    baseline.set("ownerAddress", "0x123");
    const current = new FormData();
    current.set("name", "Reviewed contract");
    current.set("ownerAddress", "");
    expect(buildRecordPatch(recordDefinition("contract"), current, baseline)).toEqual({ verified: false, ownerAddress: null });
  });
});
