"use client";
import { useEffect, useMemo, useState } from "react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, Textarea, Label } from "@/components/ui/field";
import { RecommendationBadge } from "@/components/ui/badge";
import { useMutate } from "./use-mutate";
import { apiPut } from "./api-client";
import type { AiScoreSuggestions, CaseData, CaseScorecard } from "./types";
import { ScoreSourceTag } from "./provenance-badges";
import { rebaseScorecardDraft, scorecardDraft, scorecardDraftChanged, type ScorecardDraft } from "./scorecard-draft";
import { CONFIDENCE, RECOMMENDATION_LABELS } from "@/domain/enums";
import { mergeGating } from "@/domain/gating";
import { computeScorecard, SCORE_CATEGORIES, GATING_RULES, type ScoreInput, type ScorecardResult } from "@/domain/scoring";

function toScore(value: string | undefined): number | null {
  return value === undefined || value === "" ? null : Number(value);
}

/**
 * Rationale saved with the scores. An unchanged score keeps its rationale, a
 * score that now matches the AI suggestion takes the AI's rationale, and any
 * other change drops the text that explained the old value. Rules scores have
 * no rationale of their own, so text left on one is from an earlier AI score.
 */
function rationaleForSave(saved: CaseScorecard | null, next: ScoreInput, suggestions: AiScoreSuggestions): Record<string, string> {
  const out: Record<string, string> = {};
  for (const { key } of SCORE_CATEGORIES) {
    const score = next[key] ?? null;
    if (score === null) continue;
    const kept = saved && saved[key] === score && saved.scoreSources[key] !== "worker" ? saved.rationale[key] : undefined;
    const suggestion = suggestions[key];
    const rationale = kept ?? (suggestion && suggestion.score === score ? suggestion.rationale : null);
    if (rationale) out[key] = rationale;
  }
  return out;
}

export function ScorecardTab({ data }: { data: CaseData }) {
  const { busy, error, run } = useMutate();
  const saved = data.scorecard;
  const suggestions: AiScoreSuggestions = data.latestAiSummary?.summary.analysis?.scores ?? {};
  const incoming = useMemo(() => scorecardDraft(saved), [saved]);
  const [form, setForm] = useState(() => ({ caseId: data.id, draft: incoming, baseline: incoming, server: JSON.stringify(incoming) }));
  const [saveComplete, setSaveComplete] = useState(false);
  useEffect(() => {
    const server = JSON.stringify(incoming);
    setForm((current) => {
      if (current.caseId === data.id && current.server === server) return current;
      return { caseId: data.id, baseline: incoming, server, draft: current.caseId === data.id ? rebaseScorecardDraft(current.draft, current.baseline, incoming) : incoming };
    });
  }, [data.id, incoming]);
  const { scores, gating, confidenceLevel, notes } = form.draft;
  const dirty = scorecardDraftChanged(form.draft, form.baseline);
  const researchBlockers = GATING_RULES.filter(({ flag }) => data.researchGating[flag]);

  function edit(update: (draft: ScorecardDraft) => ScorecardDraft) {
    setSaveComplete(false);
    setForm((current) => ({ ...current, draft: update(current.draft) }));
  }

  const input = useMemo(() => {
    const out: ScoreInput = {};
    for (const cat of SCORE_CATEGORIES) out[cat.key] = toScore(scores[cat.key]);
    return out;
  }, [scores]);
  const computed = useMemo(() => computeScorecard(input, mergeGating(data.researchGating, gating)), [input, data.researchGating, gating]);
  const assessed = computed.contributions.filter((row) => row.score !== null).length;

  async function save() {
    const body: Record<string, unknown> = { confidenceLevel, notes: notes || undefined, gating, rationale: rationaleForSave(saved, input, suggestions) };
    for (const cat of SCORE_CATEGORIES) body[cat.key] = input[cat.key] ?? null;
    const submitted = form.draft;
    await run(async () => {
      await apiPut(`/api/cases/${data.id}/scorecard`, body);
      setForm((current) => ({ ...current, baseline: submitted }));
      setSaveComplete(true);
    });
  }

  return (
    <form className="space-y-5" onSubmit={(event) => { event.preventDefault(); void save(); }}>
    <div className="lg:hidden"><ScorecardPreview computed={computed} dirty={dirty} /></div>
    <fieldset disabled={busy} className="grid min-w-0 grid-cols-1 gap-5 lg:grid-cols-3">
      <div className="space-y-5 lg:col-span-2">
        <Card>
          <CardHeader
            title="Category scores"
            subtitle="Use 1–10, where 10 means strongest or lowest risk. Leave unknown scores blank. Research keeps scores you change."
            action={<span className="whitespace-nowrap rounded-full bg-elevated px-2.5 py-1 text-xs tabular-nums text-muted">{assessed}/{SCORE_CATEGORIES.length} assessed</span>}
          />
          <CardBody className="divide-y divide-line py-1">
            {SCORE_CATEGORIES.map((cat) => {
              const savedScore = saved?.[cat.key] ?? null;
              const source = savedScore !== null ? (saved?.scoreSources[cat.key] ?? "analyst") : null;
              const rationale = source !== null && source !== "worker" ? saved?.rationale[cat.key] : undefined;
              const suggestion = suggestions[cat.key];
              const offer = suggestion && suggestion.score !== savedScore ? suggestion : null;
              const inForm = offer !== null && toScore(scores[cat.key]) === offer.score;
              return (
                <div key={cat.key} className="py-4">
                  <div className="flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <label className="text-sm font-medium text-fg" htmlFor={`score-${cat.key}`}>{cat.label}</label>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                        <span>{cat.informational ? "Informational only" : `${Math.round(cat.weight * 100)}% weight`}</span>
                        {source && <ScoreSourceTag source={source} />}
                      </div>
                    </div>
                    <input
                      id={`score-${cat.key}`}
                      type="number"
                      min={1}
                      max={10}
                      step="any"
                      inputMode="decimal"
                      value={scores[cat.key]}
                      onChange={(e) => edit((draft) => ({ ...draft, scores: { ...draft.scores, [cat.key]: e.target.value } }))}
                      className="input w-20 shrink-0 text-center tabular-nums"
                    />
                  </div>
                  {rationale && <p className="mt-1 text-xs leading-relaxed text-muted">{rationale}</p>}
                  {offer && (
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-info/20 bg-info/5 px-3 py-2">
                      <p className="text-xs leading-relaxed text-muted">
                        <span className="font-medium text-fg">AI suggests {offer.score}</span>
                        {offer.rationale ? `: ${offer.rationale}` : ""}
                      </p>
                      {inForm ? (
                        <span className="shrink-0 text-xs text-muted">Ready to save</span>
                      ) : (
                        <Button type="button" size="sm" variant="outline" className="shrink-0" onClick={() => edit((draft) => ({ ...draft, scores: { ...draft.scores, [cat.key]: String(offer.score) } }))}>
                          Use suggestion
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Your blocker choices" subtitle="Selected blockers stay active across research runs. Clear a choice when it has been resolved; research blockers remain active independently." />
          <CardBody className="space-y-3">
            <p className="text-xs leading-relaxed text-muted">Earlier saved blockers are retained here for review. Each blocker limits the strongest available recommendation.</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {GATING_RULES.map((rule) => (
              <label key={rule.flag} className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm transition-colors ${gating[rule.flag] ? "border-warning/40 bg-warning/5 text-fg" : "border-line bg-elevated/50 text-muted hover:border-line-strong"}`}>
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-line bg-surface accent-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  checked={Boolean(gating[rule.flag])}
                  onChange={(e) => edit((draft) => ({ ...draft, gating: { ...draft.gating, [rule.flag]: e.target.checked } }))}
                />
                <span>
                  {rule.label}
                  <span className="mt-1 block text-xs text-muted">At best: {RECOMMENDATION_LABELS[rule.ceiling]}</span>
                </span>
              </label>
            ))}
            </div>
          </CardBody>
        </Card>
      </div>

      <div className="space-y-5">
        <div className="hidden lg:block"><ScorecardPreview computed={computed} dirty={dirty} /></div>

        <Card>
          <CardHeader title="Review notes" />
          <CardBody className="space-y-3">
            <div>
              <Label htmlFor="scorecard-confidence">Confidence level</Label>
              <Select id="scorecard-confidence" value={confidenceLevel} onChange={(e) => edit((draft) => ({ ...draft, confidenceLevel: e.target.value }))}>
                {CONFIDENCE.map((c) => <option key={c} value={c}>{c}</option>)}
              </Select>
            </div>
            <div>
              <Label htmlFor="scorecard-notes">Analyst notes</Label>
              <Textarea id="scorecard-notes" value={notes} onChange={(e) => edit((draft) => ({ ...draft, notes: e.target.value }))} placeholder="Explain the decision and any remaining conditions." />
            </div>
            <Button type="submit" disabled={busy || (!dirty && saved !== null)} className="w-full">{busy ? "Saving…" : "Save scorecard"}</Button>
            <p role="status" className={`text-xs ${saveComplete && !dirty ? "text-success" : "text-muted"}`}>{busy ? "Saving scorecard…" : dirty ? "Unsaved changes" : saveComplete ? "Scorecard saved" : "No unsaved changes"}</p>
            {error && <p role="alert" className="text-xs text-danger">{error}</p>}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Latest research blockers" subtitle="Updated when research completes." />
          <CardBody className="text-xs leading-relaxed text-muted">
            {researchBlockers.length > 0 ? <ul className="list-disc space-y-2 pl-4">{researchBlockers.map((rule) => <li key={rule.flag}>{rule.label}</li>)}</ul> : <p>No blockers in the latest completed research.</p>}
          </CardBody>
        </Card>
      </div>
    </fieldset>
    </form>
  );
}

function ScorecardPreview({ computed, dirty }: { computed: ScorecardResult; dirty: boolean }) {
  return (
    <Card>
      <CardHeader title="Recommendation preview" subtitle="Includes your choices and the latest research blockers." />
      <CardBody className="space-y-4">
        <div className="text-5xl font-semibold tracking-tight tabular-nums text-fg">
          {computed.overallScore ?? "—"}
          <span className="ml-1 text-base font-normal tracking-normal text-muted">/ 10</span>
        </div>
        <div><RecommendationBadge rec={computed.recommendation} label={computed.recommendationLabel} /></div>
        {computed.gatingApplied.length > 0 && (
          <div className="rounded-lg border border-warning/25 bg-warning/5 p-3 text-xs leading-relaxed">
            <p className="font-medium text-warning">{computed.gatingApplied.length} active {computed.gatingApplied.length === 1 ? "blocker" : "blockers"}</p>
            <ul className="mt-2 list-disc space-y-1 pl-4 text-muted">{computed.gatingApplied.map((g) => <li key={g}>{g}</li>)}</ul>
          </div>
        )}
        <p className="text-xs text-muted">{dirty ? "Preview includes unsaved changes." : "Scores are weighted across assessed categories."}</p>
      </CardBody>
    </Card>
  );
}
