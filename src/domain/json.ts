/**
 * Helpers for the JSON-as-text columns in the Prisma schema. Keeping JSON in
 * String columns makes the schema portable across SQLite and PostgreSQL; these
 * codecs are the single choke point for (de)serialisation.
 */

/** Parse a JSON string column into a typed value, with a fallback on error. */
export function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (value == null || value === "") return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

/** Parse a JSON string column known to hold a string[]. */
export function parseStringArray(value: string | null | undefined): string[] {
  const parsed = parseJson<unknown>(value, []);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((v): v is string => typeof v === "string");
}

/** Serialise a value to a JSON string for storage. */
export function toJson(value: unknown): string {
  return JSON.stringify(value ?? null);
}

/** Normalise an arbitrary input into a string[] (accepts arrays or newline/comma text). */
export function coerceStringArray(input: unknown): string[] {
  if (Array.isArray(input)) {
    return input.map((v) => String(v).trim()).filter(Boolean);
  }
  if (typeof input === "string") {
    return input
      .split(/[\n,]/)
      .map((v) => v.trim())
      .filter(Boolean);
  }
  return [];
}
