import { GATING_RULES, SCORE_CATEGORIES, type GatingFlags } from "@/domain/scoring";
import type { CaseScorecard } from "./types";

export interface ScorecardDraft {
  scores: Record<string, string>;
  gating: GatingFlags;
  confidenceLevel: string;
  notes: string;
}

export function scorecardDraft(saved: CaseScorecard | null): ScorecardDraft {
  const scores: Record<string, string> = {};
  for (const { key } of SCORE_CATEGORIES) {
    const value = saved?.[key];
    scores[key] = typeof value === "number" ? String(value) : "";
  }
  return { scores, gating: saved?.manualGating ?? {}, confidenceLevel: saved?.confidenceLevel ?? "medium", notes: saved?.notes ?? "" };
}

/** Refresh untouched fields while keeping the reviewer's edits in place. */
export function rebaseScorecardDraft(current: ScorecardDraft, baseline: ScorecardDraft, incoming: ScorecardDraft): ScorecardDraft {
  const scores: Record<string, string> = {};
  const gating: GatingFlags = {};
  for (const { key } of SCORE_CATEGORIES) {
    scores[key] = (current.scores[key] === baseline.scores[key] ? incoming.scores[key] : current.scores[key]) ?? "";
  }
  for (const { flag } of GATING_RULES) {
    const value = Boolean(current.gating[flag]) === Boolean(baseline.gating[flag]) ? incoming.gating[flag] : current.gating[flag];
    if (value) gating[flag] = true;
  }
  return {
    scores,
    gating,
    confidenceLevel: current.confidenceLevel === baseline.confidenceLevel ? incoming.confidenceLevel : current.confidenceLevel,
    notes: current.notes === baseline.notes ? incoming.notes : current.notes,
  };
}

export function scorecardDraftChanged(current: ScorecardDraft, baseline: ScorecardDraft): boolean {
  return SCORE_CATEGORIES.some(({ key }) => current.scores[key] !== baseline.scores[key])
    || GATING_RULES.some(({ flag }) => Boolean(current.gating[flag]) !== Boolean(baseline.gating[flag]))
    || current.confidenceLevel !== baseline.confidenceLevel
    || current.notes !== baseline.notes;
}
