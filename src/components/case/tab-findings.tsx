"use client";
import type { FormEvent } from "react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea, Field } from "@/components/ui/field";
import { Badge, SeverityBadge } from "@/components/ui/badge";
import { useMutate } from "./use-mutate";
import { apiPost } from "./api-client";
import type { CaseData } from "./types";
import { FINDING_CATEGORY, SEVERITY, CONFIDENCE } from "@/domain/enums";
import { titleCase } from "@/lib/utils";

const SEV_ORDER = ["critical", "high", "medium", "low", "unresolved", "informational"];
const sevRank = (s: string) => {
  const i = SEV_ORDER.indexOf(s);
  return i < 0 ? 99 : i;
};

export function FindingsTab({ data }: { data: CaseData }) {
  const { busy, error, run } = useMutate();
  const findings = [...data.findings].sort((a, b) => sevRank(a.severity) - sevRank(b.severity));
  const redFlags = [...data.redFlags].sort((a, b) => sevRank(a.severity) - sevRank(b.severity));

  async function addFinding(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const get = (k: string) => String(fd.get(k) ?? "").trim();
    const payload = {
      category: get("category") || "other",
      title: get("title"),
      severity: get("severity") || "informational",
      confidence: get("confidence") || "medium",
      analysis: get("analysis") || undefined,
      impact: get("impact") || undefined,
      mitigation: get("mitigation") || undefined,
    };
    if (await run(() => apiPost(`/api/cases/${data.id}/findings`, payload))) form.reset();
  }

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
      <div className="lg:col-span-1">
        <Card>
          <CardHeader title="Add finding" subtitle="Add your assessment. Research-generated findings are replaced when research runs again." />
          <CardBody>
            <form onSubmit={addFinding}><fieldset disabled={busy} className="min-w-0 space-y-3"><legend className="sr-only">New finding</legend>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Category">
                  <Select name="category" defaultValue="other">
                    {FINDING_CATEGORY.map((c) => <option key={c} value={c}>{titleCase(c)}</option>)}
                  </Select>
                </Field>
                <Field label="Severity">
                  <Select name="severity" defaultValue="medium">
                    {SEVERITY.map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}
                  </Select>
                </Field>
              </div>
              <Field label="Title *">
                  <Input name="title" required />
                </Field>
              <Field label="Confidence">
                  <Select name="confidence" defaultValue="medium">
                  {CONFIDENCE.map((c) => <option key={c} value={c}>{titleCase(c)}</option>)}
                </Select>
                </Field>
              <Field label="Analysis">
                  <Textarea name="analysis" />
                </Field>
              <Field label="Impact">
                  <Textarea name="impact" />
                </Field>
              <Field label="Mitigation">
                  <Textarea name="mitigation" />
                </Field>
              <Button type="submit" size="sm" disabled={busy}>Add finding</Button>
              {error && <p role="alert" className="text-sm text-danger">{error}</p>}
            </fieldset></form>
          </CardBody>
        </Card>
      </div>

      <div className="min-w-0 space-y-5 lg:col-span-2">
        <Card>
          <CardHeader title={`Findings (${findings.length})`} />
          <CardBody className="space-y-2">
            {findings.length === 0 && <p className="empty-state">No findings yet. Run research or add one manually.</p>}
            {findings.map((f) => (
              <div key={f.id} className="rounded-lg border border-line bg-elevated/40 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <span className="min-w-0 flex-1 basis-48 break-words text-sm font-medium text-fg">{f.title}</span>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <SeverityBadge severity={f.severity} />
                    <Badge className={f.source === "manual" ? "bg-info/10 text-info" : "bg-elevated text-faint"}>{f.source === "manual" ? "Analyst" : titleCase(f.source)}</Badge>
                  </div>
                </div>
                <p className="mt-0.5 text-xs text-muted">{titleCase(f.category)} · confidence {f.confidence}</p>
                {f.analysis && <p className="mt-1.5 text-sm leading-relaxed text-muted">{f.analysis}</p>}
              </div>
            ))}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title={`Red flags (${redFlags.length})`} subtitle="Issues identified during research from the intake, sources and evidence." />
          <CardBody className="space-y-2">
            {redFlags.length === 0 && <p className="empty-state">No red flags recorded. Review the evidence before drawing a conclusion.</p>}
            {redFlags.map((r) => (
              <div key={r.id} className="rounded-lg border border-danger/25 bg-danger/5 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <span className="min-w-0 flex-1 basis-48 break-words text-sm font-medium text-fg">{r.title}</span>
                  <SeverityBadge severity={r.severity} />
                </div>
                {r.evidence && <p className="mt-1.5 text-sm leading-relaxed text-muted">{r.evidence}</p>}
                {r.mitigation && <p className="mt-1.5 text-xs text-muted"><span className="font-medium text-fg">Mitigation:</span> {r.mitigation}</p>}
              </div>
            ))}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
