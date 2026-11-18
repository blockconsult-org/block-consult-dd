/**
 * Provenance display shared by the case tabs: who produced a record (analyst,
 * rules or AI), how a quote checked out, which provider ran, what a run cost,
 * and safe external links to cited pages.
 */
import type { ReactNode } from "react";
import { Badge, Tag } from "@/components/ui/badge";
import { PROVIDER_IDS, PROVIDER_LABELS, type ProviderId } from "@/ai/types";
import { QUOTE_VERIFICATION, QUOTE_VERIFICATION_LABELS, type QuoteVerification } from "@/domain/enums";
import { SCORE_SOURCE_LABELS, type ScoreSource } from "@/domain/score-sources";
import { cn } from "@/lib/utils";
import type { UsageTotals } from "./types";

/** Badge tones, matching src/components/ui/badge.tsx. */
export const TONES = {
  good: "bg-success/10 text-success ring-1 ring-success/25",
  warn: "bg-warning/10 text-warning ring-1 ring-warning/25",
  bad: "bg-danger/10 text-danger ring-1 ring-danger/25",
  neutral: "bg-elevated text-muted ring-1 ring-line",
} as const;

function isProviderId(value: string): value is ProviderId {
  return (PROVIDER_IDS as readonly string[]).includes(value);
}

/** Display name for a provider id; unknown ids are shown as stored. */
export function providerName(provider: string | null | undefined): string | null {
  if (!provider) return null;
  return isProviderId(provider) ? PROVIDER_LABELS[provider] : provider;
}

/** Providers that run on the user's Claude or ChatGPT plan instead of a metered key. */
export function isSubscriptionProvider(provider: string | null | undefined): boolean {
  return provider === "claude-code" || provider === "codex";
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;
}

/** "42 s" or "3 min 05 s". */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return minutes > 0 ? `${minutes} min ${String(seconds).padStart(2, "0")} s` : `${seconds} s`;
}

/** The URL when it is http(s), otherwise null, so stored URLs never become script links. */
export function safeHttpUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const { protocol } = new URL(url);
    return protocol === "http:" || protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

/** Host and path without the scheme, clipped for display. */
export function shortUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname === "/" ? "" : parsed.pathname;
    const short = `${parsed.hostname.replace(/^www\./, "")}${path}`;
    return short.length > 60 ? `${short.slice(0, 59)}…` : short;
  } catch {
    return url;
  }
}

/** True when two URLs point at the same address after normalisation. */
export function sameUrl(a: string, b: string): boolean {
  try {
    return new URL(a).href === new URL(b).href;
  } catch {
    return a === b;
  }
}

export function ExternalLink({ href, children, className }: { href: string | null; children: ReactNode; className?: string }) {
  const safe = safeHttpUrl(href);
  if (!safe) return <span className={className}>{children}</span>;
  return (
    <a href={safe} title={safe} target="_blank" rel="noreferrer" className={cn("break-all text-link hover:underline", className)}>
      {children}
    </a>
  );
}

/** Who created a source or claim. */
export function OriginBadge({ origin, title }: { origin: string; title?: string }) {
  const ai = origin === "ai";
  return (
    <Badge className={cn("shrink-0", ai ? TONES.neutral : "bg-info/10 text-info")}>
      <span title={title ?? (ai ? "Found by AI research" : "Entered by an analyst")}>{ai ? "AI research" : "Analyst"}</span>
    </Badge>
  );
}

const VERIFICATION_TONE: Record<QuoteVerification, string> = {
  verified: TONES.good,
  partial: TONES.warn,
  not_found: TONES.bad,
  unreachable: TONES.neutral,
  blocked: TONES.neutral,
};

function isQuoteVerification(value: string | null): value is QuoteVerification {
  return value !== null && (QUOTE_VERIFICATION as readonly string[]).includes(value);
}

/** Result of checking a claim's quote against the cited page. Quoted claims that were never checked say so. */
export function VerificationBadge({ verification, quoted }: { verification: string | null; quoted: boolean }) {
  if (isQuoteVerification(verification)) {
    return <Badge className={VERIFICATION_TONE[verification]}>{QUOTE_VERIFICATION_LABELS[verification]}</Badge>;
  }
  return quoted ? <Badge className={TONES.neutral}>Quote not checked</Badge> : null;
}

/** Who set a scorecard category: Analyst, Rules or AI. */
export function ScoreSourceTag({ source }: { source: ScoreSource }) {
  return <Tag className={cn("shrink-0", source === "analyst" && "border-line-strong text-fg")}>{SCORE_SOURCE_LABELS[source]}</Tag>;
}

const RUN_STATUS: Record<string, { label: string; tone: string }> = {
  queued: { label: "Queued", tone: TONES.neutral },
  running: { label: "Running", tone: TONES.neutral },
  completed: { label: "Completed", tone: TONES.good },
  failed: { label: "Failed", tone: TONES.bad },
  cancelled: { label: "Cancelled", tone: TONES.neutral },
};

export function RunStatusBadge({ status }: { status: string }) {
  const meta = RUN_STATUS[status];
  return <Badge className={meta?.tone ?? TONES.neutral}>{meta?.label ?? status}</Badge>;
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function costText(usage: UsageTotals, provider: string | null): string {
  if (usage.costUsd !== null) return usage.costUsd < 0.01 ? "<$0.01" : `$${usage.costUsd.toFixed(2)}`;
  return isSubscriptionProvider(provider) ? "Covered by subscription" : "Not available";
}

/** Tokens, web searches and estimated cost of an AI run or draft. */
export function UsageStats({ usage, provider }: { usage: UsageTotals; provider: string | null }) {
  const items = [
    { label: "Input tokens", value: fmtTokens(usage.inputTokens) },
    { label: "Output tokens", value: fmtTokens(usage.outputTokens) },
    { label: "Web searches", value: usage.webSearches.toLocaleString("en-US") },
    { label: usage.costUsd !== null ? "Estimated cost" : "Cost", value: costText(usage, provider) },
  ];
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
      {items.map((item) => (
        <div key={item.label}>
          <dt className="text-xs text-muted">{item.label}</dt>
          <dd className="mt-0.5 text-sm tabular-nums text-fg">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
