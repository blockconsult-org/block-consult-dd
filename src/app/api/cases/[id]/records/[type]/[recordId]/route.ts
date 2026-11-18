import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { fail, ok, parseBody } from "@/lib/api";
import { recordDefinition, recordPatchSchema, recordTypeSchema, storedRecordPatch, type RecordType } from "@/domain/record-edit";

type Params = { params: Promise<{ id: string; type: string; recordId: string }> };
interface RecordScope { id: string; caseId: string }

function findRecord(type: RecordType, where: RecordScope) {
  switch (type) {
    case "entity": return prisma.entity.findFirst({ where });
    case "person": return prisma.person.findFirst({ where });
    case "token": return prisma.token.findFirst({ where });
    case "contract": return prisma.tokenContract.findFirst({ where });
    case "market": return prisma.exchangeMarket.findFirst({ where });
    case "stablecoin": return prisma.stablecoinProfile.findFirst({ where });
    case "rwa": return prisma.rWAAssetProfile.findFirst({ where });
  }
}

function updateRecord(db: Prisma.TransactionClient, type: RecordType, where: RecordScope, data: Record<string, unknown>) {
  switch (type) {
    case "entity": return db.entity.updateMany({ where, data });
    case "person": return db.person.updateMany({ where, data });
    case "token": return db.token.updateMany({ where, data });
    case "contract": return db.tokenContract.updateMany({ where, data });
    case "market": return db.exchangeMarket.updateMany({ where, data });
    case "stablecoin": return db.stablecoinProfile.updateMany({ where, data });
    case "rwa": return db.rWAAssetProfile.updateMany({ where, data });
  }
}

export async function GET(_req: Request, { params }: Params) {
  const { id: caseId, type: rawType, recordId } = await params;
  const type = recordTypeSchema.safeParse(rawType);
  if (!type.success) return fail("Unknown record type", 404);
  const record = await findRecord(type.data, { id: recordId, caseId });
  return record ? ok(record) : fail("Record not found in this case", 404);
}

export async function PATCH(req: Request, { params }: Params) {
  const { id: caseId, type: rawType, recordId } = await params;
  const type = recordTypeSchema.safeParse(rawType);
  if (!type.success) return fail("Unknown record type", 404);
  const definition = recordDefinition(type.data);
  const parsed = await parseBody(req, recordPatchSchema(definition));
  if ("error" in parsed) return parsed.error;
  const patch = storedRecordPatch(definition, parsed.data);
  try {
    const updated = await prisma.$transaction(async (db) => {
      const result = await updateRecord(db, type.data, { id: recordId, caseId }, patch);
      if (result.count > 0) await db.dDCase.update({ where: { id: caseId }, data: { updatedAt: new Date() } });
      return result.count;
    });
    return updated ? ok({ saved: true }) : fail("Record not found in this case", 404);
  } catch {
    return fail("Could not save this record. Your changes are still in the editor.", 500);
  }
}
