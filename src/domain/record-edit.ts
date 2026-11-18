import { z } from "zod";
import { RECORD_DEFS, type RecordDef } from "./record-fields";

export const RECORD_TYPES = ["entity", "person", "token", "contract", "market", "stablecoin", "rwa"] as const;
export const recordTypeSchema = z.enum(RECORD_TYPES);
export type RecordType = z.infer<typeof recordTypeSchema>;

/** Editing scalar fields never replaces token allocations, unlocks or hidden metadata. */
export function recordPatchSchema(def: RecordDef) {
  const shape: Record<string, z.ZodType> = {};
  for (const field of def.fields) {
    if (["allocationsText", "unlocksText"].includes(field.name)) continue;
    let schema: z.ZodType;
    if (field.kind === "bool") schema = z.boolean();
    else if (field.kind === "number") schema = z.number().finite().nullable();
    else if (field.kind === "lines") schema = z.array(z.string());
    else if (field.kind === "select") schema = z.enum(field.options ?? []);
    else schema = field.required ? z.string().trim().min(1, `${field.label} is required`) : z.string().nullable();
    shape[field.name] = schema.optional();
  }
  return z.object(shape).strict().refine((patch) => Object.keys(patch).length > 0, "No changes to save");
}

export function recordDefinition(type: RecordType): RecordDef {
  return RECORD_DEFS.find((def) => def.type === type)!;
}

/** Only changed fields are sent, so legacy values and unexposed fields survive. */
export function buildRecordPatch(def: RecordDef, current: FormData, baseline: FormData): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const field of def.fields) {
    if (["allocationsText", "unlocksText"].includes(field.name)) continue;
    const value = String(current.get(field.name) ?? "");
    if (value === String(baseline.get(field.name) ?? "")) continue;
    if (field.kind === "bool") patch[field.name] = value === "on";
    else if (field.kind === "number") patch[field.name] = value.trim() ? Number(value) : null;
    else if (field.kind === "lines") patch[field.name] = value.split(/[\n,]+/).map((item) => item.trim()).filter(Boolean);
    else patch[field.name] = value.trim() || (field.required || field.kind === "select" ? "" : null);
  }
  return patch;
}

export function storedRecordPatch(def: RecordDef, patch: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(patch).map(([key, value]) => [key, def.fields.find((field) => field.name === key)?.kind === "lines" ? JSON.stringify(value) : value]));
}
