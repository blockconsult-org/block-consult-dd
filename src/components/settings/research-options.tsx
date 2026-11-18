"use client";
import * as React from "react";
import type { AiSettings, AiSettingsPatch, ResearchDepth } from "@/ai/settings";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/** Mirrors DEPTH_BUDGETS in src/ai/settings.ts, which is server-only. */
const DEPTHS: { id: ResearchDepth; title: string; detail: string }[] = [
  { id: "quick", title: "Quick", detail: "Up to 8 searches and 6 pages read. A first look in a few minutes." },
  { id: "standard", title: "Standard", detail: "Up to 20 searches and 15 pages read. Suits most cases." },
  { id: "deep", title: "Deep", detail: "Up to 40 searches and 30 pages read. Slower and uses the most tokens." },
];

export function ResearchOptions({ research, onSave }: { research: AiSettings["research"]; onSave: (patch: AiSettingsPatch) => Promise<boolean> }) {
  const [busy, setBusy] = React.useState(false);

  async function update(patch: Partial<AiSettings["research"]>) {
    setBusy(true);
    await onSave({ research: patch });
    setBusy(false);
  }

  return (
    <Card>
      <CardHeader title="Research" subtitle="Applies to every provider." />
      <CardBody className="space-y-5">
        <fieldset>
          <legend className="label">Depth</legend>
          <div className="grid gap-3 sm:grid-cols-3">
            {DEPTHS.map((depth) => (
              <label
                key={depth.id}
                className={cn(
                  "flex cursor-pointer flex-col gap-1 rounded-xl border px-3 py-2.5 transition-colors duration-150 ease-out focus-within:ring-2 focus-within:ring-accent/40",
                  research.depth === depth.id ? "border-accent/60 bg-accent/10" : "border-line hover:border-line-strong",
                )}
              >
                <input
                  type="radio"
                  name="research-depth"
                  value={depth.id}
                  checked={research.depth === depth.id}
                  disabled={busy}
                  onChange={() => void update({ depth: depth.id })}
                  className="sr-only"
                />
                <span className="text-sm font-medium text-fg">{depth.title}</span>
                <span className="text-xs leading-relaxed text-muted">{depth.detail}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 accent-accent"
            checked={research.verifySources}
            disabled={busy}
            onChange={(e) => void update({ verifySources: e.target.checked })}
          />
          <span>
            <span className="block text-sm text-fg">Check quotes against the cited pages</span>
            <span className="block text-xs leading-relaxed text-muted">
              After research, the app downloads each cited page and checks that the quoted text is on it. Claims whose quote can’t be found are
              marked and their confidence lowered. Pages are fetched from this computer.
            </span>
          </span>
        </label>
      </CardBody>
    </Card>
  );
}
