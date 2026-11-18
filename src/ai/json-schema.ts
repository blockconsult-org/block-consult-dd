/**
 * Converts a Zod (v4) schema into the JSON Schema subset that every provider's
 * structured-output mode accepts: Anthropic strict tools and output_config,
 * OpenAI strict json_schema, Claude Code --json-schema and Codex
 * --output-schema. Keywords outside that subset are removed; the Zod schema
 * still validates the result on our side.
 */
import { z } from "zod/v4";
import type { JsonSchema } from "./types";

const UNSUPPORTED_KEYWORDS = new Set([
  "$schema",
  "$id",
  "default",
  "examples",
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "multipleOf",
  "minLength",
  "maxLength",
  "pattern",
  "format",
  "minItems",
  "maxItems",
  "uniqueItems",
  "minProperties",
  "maxProperties",
]);

function strip(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(strip);
  if (node === null || typeof node !== "object") return node;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (UNSUPPORTED_KEYWORDS.has(key)) continue;
    // Property maps hold user field names, not keywords: keep every key there.
    if (key === "properties" && value && typeof value === "object" && !Array.isArray(value)) {
      out[key] = Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([name, child]) => [name, strip(child)]),
      );
      continue;
    }
    out[key] = strip(value);
  }
  return out;
}

export function toStrictJsonSchema(schema: z.ZodType): JsonSchema {
  const raw = z.toJSONSchema(schema, { target: "draft-7", io: "output", unrepresentable: "throw" });
  return strip(raw) as JsonSchema;
}
