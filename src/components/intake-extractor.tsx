"use client";
import * as React from "react";
import Link from "next/link";
import { Loader2, Sparkles } from "lucide-react";
import type { IntakeExtract } from "@/ai/schemas";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Label, Textarea } from "@/components/ui/field";

interface Props {
  /** Called with the extracted fields and the text they came from. */
  onExtract: (extract: IntakeExtract, text: string) => { applied: number; preserved: number };
}

function isExtractResponse(value: unknown): value is { extract: IntakeExtract } {
  return typeof value === "object" && value !== null && "extract" in value && typeof value.extract === "object" && value.extract !== null;
}

/** Paste offer text and let the active AI provider fill the intake form. Nothing is saved until the case is created. */
export function IntakeExtractor({ onExtract }: Props) {
  const [text, setText] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<{ applied: number; preserved: number } | null>(null);
  const [provider, setProvider] = React.useState<string | null | undefined>(undefined);

  React.useEffect(() => {
    let cancelled = false;
    fetch("/api/settings/ai/status", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: unknown) => {
        if (cancelled) return;
        const label = typeof data === "object" && data !== null && "label" in data && typeof data.label === "string" ? data.label : null;
        setProvider(label);
      })
      .catch(() => {
        if (!cancelled) setProvider(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function extract() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/intake/extract", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data: unknown = await res.json().catch(() => null);
      if (!res.ok || !isExtractResponse(data)) {
        const message = typeof data === "object" && data !== null && "error" in data && typeof data.error === "string" ? data.error : null;
        throw new Error(message ?? "The details could not be extracted.");
      }
      setResult(onExtract(data.extract, text));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const unavailable = provider === null;
  return (
    <Card>
      <CardHeader
        title="Extract intake details"
        subtitle="AI fills empty fields from your text. Details you have already entered are kept."
      />
      <CardBody className="space-y-3">
        <div>
          <Label htmlFor="offer-text">Offer text</Label>
          <Textarea
            id="offer-text"
            value={text}
            onChange={(e) => { setText(e.target.value); setResult(null); }}
            disabled={busy}
            placeholder="Paste the offer here"
            className="min-h-32"
            aria-describedby="offer-text-hint"
          />
          <p id="offer-text-hint" className="mt-2 text-xs leading-relaxed text-faint">
            {unavailable ? (
              <>
                Needs an AI provider.{" "}
                <Link href="/settings" className="text-link underline underline-offset-4 hover:decoration-2">
                  Set one up in Settings
                </Link>
                , or fill in the form by hand.
              </>
            ) : provider === undefined ? (
              "Checking the selected AI provider…"
            ) : (
              <>The text is sent to {provider} when you extract details. Review all extracted details before creating the case.</>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" size="sm" variant="outline" onClick={() => void extract()} disabled={busy || !provider || text.trim().length < 40} aria-busy={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Sparkles className="h-4 w-4" aria-hidden="true" />}
            {busy ? "Reading the text…" : "Extract details"}
          </Button>
          <span className="text-xs text-faint">{text.trim().length < 40 ? "At least 40 characters required." : `${text.trim().length.toLocaleString()} characters`}</span>
        </div>
        <div aria-live="polite">
          {result && !busy && <p className="text-xs leading-relaxed text-success">{result.applied} {result.applied === 1 ? "field filled" : "fields filled"}.{result.preserved > 0 ? ` ${result.preserved} existing ${result.preserved === 1 ? "field kept" : "fields kept"}.` : ""} Review the details and any extracted counterparties below.</p>}
          {error && (
            <span role="alert" className="text-xs text-danger">
              {error}
            </span>
          )}
        </div>
      </CardBody>
    </Card>
  );
}
