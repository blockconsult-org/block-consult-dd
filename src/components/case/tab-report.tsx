"use client";
import { useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Download, ExternalLink, FileCheck2, Save } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge, RecommendationBadge } from "@/components/ui/badge";
import { useMutate } from "./use-mutate";
import { apiPost } from "./api-client";
import type { CaseData } from "./types";
import { NarrativePanel } from "./narrative-panel";
import { RECOMMENDATION_LABELS, type Recommendation } from "@/domain/enums";
import { parseJson } from "@/domain/json";
import { fmtDateTime } from "@/lib/utils";
import { TONES } from "./provenance-badges";
import { MutationNotice } from "./mutation-notice";

interface QaShape {
  autoPass: number;
  autoFail: number;
  manual: number;
  blocking: string[];
}
const FILE_LABELS: Record<string, string> = { html: "HTML report", markdown: "Markdown report", evidence_manifest: "Evidence manifest", pdf: "PDF report" };

export function ReportTab({ data }: { data: CaseData }) {
  const { busy, error, success, run } = useMutate();
  const [replacing, setReplacing] = useState(false);
  const [restoreFocus, setRestoreFocus] = useState(false);
  const cancelReplace = useRef<HTMLButtonElement>(null);
  const snapshotAction = useRef<HTMLButtonElement>(null);
  const latest = data.reports[0];
  const qa = latest ? parseJson<QaShape>(latest.qaJson, { autoPass: 0, autoFail: 0, manual: 0, blocking: [] }) : null;
  // The narrative is tied to research, scores and finding counts. Refresh its status
  // when that basis changes, including while this visited tab is hidden.
  const revision = JSON.stringify([data.updatedAt, data.researchRuns.map((item) => [item.id, item.status, item.finishedAt]), data.scorecard, data.findings.length, data.redFlags.length, latest?.generatedAt]);

  useEffect(() => {
    if (restoreFocus && !busy) {
      snapshotAction.current?.focus();
      setRestoreFocus(false);
    }
  }, [restoreFocus, busy]);

  async function saveSnapshot() {
    if (await run(() => apiPost(`/api/cases/${data.id}/report`, {}), { success: "Report snapshot saved. Download its files below." })) setReplacing(false);
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Preview current case" subtitle="Live exports use the latest saved case data, scores and narrative. Save any edits in the other tabs first." action={<Badge className={TONES.neutral}>Live</Badge>} />
          <CardBody className="space-y-4">
            <p className="text-sm leading-relaxed text-muted">Review the complete report before sharing. Opening a live export does not replace the saved snapshot below.</p>
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline"><a href={`/api/cases/${data.id}/report/html`} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" aria-hidden="true" />Preview HTML</a></Button>
              <Button asChild variant="outline"><a href={`/api/cases/${data.id}/report/pdf`} target="_blank" rel="noreferrer"><Download className="h-4 w-4" aria-hidden="true" />Open current PDF</a></Button>
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Save report snapshot" subtitle="Create the HTML report, Markdown report and evidence manifest, with a QA checklist." action={<Save className="h-5 w-5 text-muted" aria-hidden="true" />} />
          <CardBody className="space-y-4">
            <p className="text-sm leading-relaxed text-muted">{latest ? `The next save replaces snapshot v${latest.version} and its report files. Download any files you want to keep first.` : "Save the current report to keep its files and review the automated QA results. Only the latest snapshot is retained."}</p>
            <Button ref={snapshotAction} disabled={busy || data.activeRun !== null} aria-busy={busy} onClick={() => latest ? setReplacing(true) : void saveSnapshot()}>
              <Save className="h-4 w-4" aria-hidden="true" />{busy ? "Saving snapshot…" : latest ? "Replace saved snapshot" : "Save latest snapshot"}
            </Button>
            {data.activeRun && <p role="status" className="text-sm text-warning">Wait for research to finish before saving a snapshot.</p>}
            <MutationNotice error={replacing ? null : error} success={success} />
          </CardBody>
        </Card>
      </div>

      <Dialog.Root open={replacing} onOpenChange={(open) => { if (!busy) setReplacing(open); }}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />
          <Dialog.Content onOpenAutoFocus={(event) => { event.preventDefault(); cancelReplace.current?.focus(); }} onCloseAutoFocus={(event) => { event.preventDefault(); setRestoreFocus(true); }} onEscapeKeyDown={(event) => { if (busy) event.preventDefault(); }} onPointerDownOutside={(event) => event.preventDefault()}
            className="fixed left-1/2 top-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[calc(100%_-_2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-card border border-line bg-surface p-6 shadow-xl">
            <Dialog.Title className="text-xl font-semibold text-fg">Replace snapshot v{latest?.version}?</Dialog.Title>
            <Dialog.Description className="mt-3 text-sm leading-relaxed text-muted">The current case will replace the saved snapshot and its files. Download any copies you need before continuing.</Dialog.Description>
            <div className="mt-4"><MutationNotice error={error} /></div>
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <Dialog.Close asChild><Button ref={cancelReplace} type="button" variant="outline" disabled={busy}>Keep saved snapshot</Button></Dialog.Close>
              <Button type="button" disabled={busy || data.activeRun !== null} onClick={() => void saveSnapshot()}>{busy ? "Saving snapshot…" : "Replace snapshot"}</Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <NarrativePanel caseId={data.id} ai={data.ai} active={data.activeRun} runs={data.researchRuns} revision={revision} />

      {latest && qa ? (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <Card>
            <CardHeader title="Latest saved snapshot" subtitle="This summary reflects the last save. Later case edits appear in live exports." action={<Badge className={TONES.neutral}>v{latest.version}</Badge>} />
            <CardBody>
              <dl className="space-y-4 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2"><dt className="text-muted">Recommendation</dt><dd>{latest.recommendation ? <RecommendationBadge rec={latest.recommendation} label={RECOMMENDATION_LABELS[latest.recommendation as Recommendation] ?? latest.recommendation} /> : <span className="text-muted">Not assessed</span>}</dd></div>
                <div className="flex items-center justify-between gap-2"><dt className="text-muted">Overall score</dt><dd className="font-semibold tabular-nums text-fg">{latest.overallScore == null ? "Not scored" : `${latest.overallScore} / 10`}</dd></div>
                <div className="flex flex-wrap items-center justify-between gap-2"><dt className="text-muted">Saved</dt><dd className="text-fg">{fmtDateTime(latest.generatedAt)}</dd></div>
              </dl>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Snapshot QA" subtitle="Checks from the last save. Manual checks still require analyst review." action={<FileCheck2 className="h-5 w-5 text-muted" aria-hidden="true" />} />
            <CardBody className="space-y-4">
              <div className="flex flex-wrap gap-2"><Badge className={TONES.good}>{qa.autoPass} passed</Badge><Badge className={qa.autoFail > 0 ? TONES.bad : TONES.neutral}>{qa.autoFail} failed</Badge><Badge className={TONES.neutral}>{qa.manual} manual checks</Badge></div>
              {qa.blocking.length > 0 ? (
                <div className="rounded-lg border border-danger/25 bg-danger/10 p-4 text-sm text-danger"><p className="font-medium">Resolve before finalising</p><ul className="mt-2 list-disc space-y-1 pl-4">{qa.blocking.map((item) => <li key={item}>{item}</li>)}</ul></div>
              ) : <p className="text-sm text-success">No blocking automated failures in this snapshot.</p>}
            </CardBody>
          </Card>
          <Card className="lg:col-span-2">
            <CardHeader title="Saved files" subtitle={`Files attached to snapshot v${latest.version}. These downloads do not rebuild the report.`} />
            <CardBody className="grid grid-cols-1 gap-3 lg:grid-cols-3">
              {latest.files.length === 0 && <p className="text-sm text-muted">No files are attached. Save a new snapshot to create them.</p>}
              {latest.files.map((file) => (
                <a key={file.id} href={`/api/cases/${data.id}/files/${file.id}`} download={file.filename} className="group flex min-w-0 items-start gap-3 rounded-lg border border-line p-4 transition hover:border-line-strong hover:bg-elevated">
                  <Download className="mt-0.5 h-4 w-4 shrink-0 text-muted group-hover:text-fg" aria-hidden="true" />
                  <div className="min-w-0"><p className="text-sm font-medium text-fg">{FILE_LABELS[file.kind] ?? file.kind}</p><p className="mt-1 break-all text-xs leading-relaxed text-muted">{file.filename}</p><p className="mt-2 text-xs tabular-nums text-muted">{Math.max(1, Math.round(file.sizeBytes / 1024))} KB</p></div>
                </a>
              ))}
            </CardBody>
          </Card>
        </div>
      ) : (
        <div className="empty-state"><FileCheck2 className="mx-auto mb-3 h-6 w-6 text-muted" aria-hidden="true" /><p className="font-medium text-fg">No saved snapshot yet</p><p className="mt-2">Preview the case, then save a snapshot to review its QA checklist and download the report files.</p></div>
      )}
    </div>
  );
}
