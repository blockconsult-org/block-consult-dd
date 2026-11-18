/**
 * Provenance of each scorecard category: set by the analyst, suggested by the
 * rule-based workers, or suggested by the AI analyst. Research runs may update
 * worker and AI scores; analyst scores stay until the analyst changes them.
 */
import { parseJson } from "./json";
import { SCORE_CATEGORIES, type ScoreCategoryKey, type ScoreInput } from "./scoring";

export const SCORE_SOURCE = ["analyst", "worker", "ai"] as const;
export type ScoreSource = (typeof SCORE_SOURCE)[number];
export type ScoreSources = Partial<Record<ScoreCategoryKey, ScoreSource>>;

export const SCORE_SOURCE_LABELS: Record<ScoreSource, string> = {
  analyst: "Analyst",
  worker: "Rules",
  ai: "AI",
};

function isScoreSource(value: unknown): value is ScoreSource {
  return typeof value === "string" && (SCORE_SOURCE as readonly string[]).includes(value);
}

export function readScoreSources(value: string | null | undefined): ScoreSources {
  const raw = parseJson<Record<string, unknown>>(value, {});
  const out: ScoreSources = {};
  for (const { key } of SCORE_CATEGORIES) {
    const source = raw[key];
    if (isScoreSource(source)) out[key] = source;
  }
  return out;
}

/** Label for a category's score source in reports. Scores saved before sources were tracked count as the analyst's. */
export function scoreSourceLabel(sources: ScoreSources, key: ScoreCategoryKey, score: number | null): string {
  if (score == null) return "—";
  return SCORE_SOURCE_LABELS[sources[key] ?? "analyst"];
}

/** Sources after an analyst save: a changed score becomes the analyst's, a cleared score has none. */
export function sourcesAfterEdit(previous: ScoreInput, next: ScoreInput, sources: ScoreSources): ScoreSources {
  const out: ScoreSources = {};
  for (const { key } of SCORE_CATEGORIES) {
    const value = next[key] ?? null;
    if (value == null) continue;
    const before = previous[key] ?? null;
    out[key] = before === value ? (sources[key] ?? "analyst") : "analyst";
  }
  return out;
}
