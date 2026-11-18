import { parseJson } from "./json";
import { GATING_RULES, type GatingFlags } from "./scoring";

/** Only known, explicitly true blockers affect a recommendation. */
export function readGating(value: unknown): GatingFlags {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  const record = value as Record<string, unknown>;
  const flags: GatingFlags = {};
  for (const { flag } of GATING_RULES) {
    if (record[flag] === true) flags[flag] = true;
  }
  return flags;
}

export function readSavedGating(value: string | null | undefined): GatingFlags {
  return readGating(parseJson<unknown>(value, {}));
}

export function readResearchGating(summaryJson: string | null | undefined): GatingFlags {
  const summary = parseJson<unknown>(summaryJson, {});
  if (typeof summary !== "object" || summary === null || Array.isArray(summary)) return {};
  return readGating((summary as Record<string, unknown>).gating);
}

/** A cleared manual choice cannot suppress a blocker raised by research. */
export function mergeGating(...sources: GatingFlags[]): GatingFlags {
  const merged: GatingFlags = {};
  for (const source of sources) {
    for (const { flag } of GATING_RULES) {
      if (source[flag] === true) merged[flag] = true;
    }
  }
  return merged;
}

/** Omitted choices preserve stored blockers; an explicit empty object clears them. */
export function savedGatingAfterEdit(stored: string | null | undefined, submitted: unknown): GatingFlags {
  return submitted === undefined ? readSavedGating(stored) : readGating(submitted);
}
