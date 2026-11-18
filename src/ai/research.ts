/**
 * AI research stage: web research by the active provider, written to the case
 * as Source and EvidenceClaim rows with origin "ai", then checked by fetching
 * each cited page and looking for the quoted text on it.
 *
 * AI rows from earlier runs are replaced on every AI run; rows the analyst
 * entered are never touched.
 */
import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import { BlockedAddressError, pageText, safeFetch } from "@/lib/safe-fetch";
import { writeArtifact } from "@/lib/storage";
import type { ReliabilityRating, SourceType } from "@/domain/enums";
import type { CaseSnapshot } from "@/harness/types";
import { RESEARCH_SYSTEM, researchPrompt } from "./prompts";
import { matchQuote } from "./quote-match";
import { runTask } from "./registry";
import { JSON_SCHEMAS, researchOutputSchema, type ResearchOutput } from "./schemas";
import { DEPTH_BUDGETS, type AiSettings } from "./settings";
import { PROVIDER_LABELS, type AiUsage, type ProviderId } from "./types";

export interface ResearchStageResult {
  provider: ProviderId;
  model: string;
  overview: string;
  contradictions: string[];
  openQuestions: string[];
  sourcesCreated: number;
  claimsCreated: number;
  unsupportedClaims: number;
  /** Sources whose URL the provider's web tools never reported. */
  unseenUrls: number;
  usage: AiUsage;
  notes: string[];
}

export interface VerificationSummary {
  checkedSources: number;
  verified: number;
  partial: number;
  notFound: number;
  unreachable: number;
  blocked: number;
  notChecked: number;
}

const RELIABILITY_BY_TYPE: Record<SourceType, ReliabilityRating> = {
  primary_official: "high",
  primary_exchange: "high",
  primary_chain: "high",
  primary_registry: "high",
  primary_counterparty: "high",
  secondary_high: "medium",
  market_aggregator: "medium",
  secondary_contributor: "low",
  community: "low",
  pitch_claim: "low",
  unknown: "unknown",
};

/** Comparable form of a URL: no fragment, no trailing slash, lowercase host. */
export function normalizeUrl(raw: string): string | null {
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    url.hash = "";
    url.hostname = url.hostname.toLowerCase();
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export async function runAiResearch(options: {
  caseId: string;
  runId: string;
  snapshot: CaseSnapshot;
  settings: AiSettings;
  signal: AbortSignal;
  progress: (message: string) => void;
}): Promise<ResearchStageResult> {
  const { caseId, runId, snapshot, settings, signal, progress } = options;
  const budget = DEPTH_BUDGETS[settings.research.depth];
  const result = await runTask<ResearchOutput>({
    purpose: "research",
    caseId,
    system: RESEARCH_SYSTEM,
    prompt: researchPrompt(snapshot, budget),
    schemaName: "submit_research",
    schemaDescription: "Submit the finished research: sources, quoted claims, contradictions and open questions.",
    jsonSchema: JSON_SCHEMAS.research,
    parse: (value) => researchOutputSchema.parse(value),
    web: budget,
    signal,
    onProgress: progress,
  });
  signal.throwIfAborted();

  const data = result.data;
  const providerLabel = PROVIDER_LABELS[result.provider];
  const seen = new Set(result.visitedUrls.map(normalizeUrl).filter((u): u is string => u !== null));
  const checkSeen = seen.size > 0;

  // Replace AI rows from earlier runs; claims first, then their sources.
  await prisma.$transaction([
    prisma.evidenceClaim.deleteMany({ where: { caseId, origin: "ai" } }),
    prisma.source.deleteMany({ where: { caseId, origin: "ai" } }),
  ]);

  const byRef = new Map<string, { id: string; url: string; title: string; sourceType: SourceType; reliability: ReliabilityRating }>();
  const byUrl = new Map<string, string>();
  let sourcesCreated = 0;
  let unseenUrls = 0;
  for (const source of data.sources) {
    const url = normalizeUrl(source.url);
    if (!url) continue;
    const existingId = byUrl.get(url);
    const reliability = RELIABILITY_BY_TYPE[source.sourceType];
    if (existingId) {
      byRef.set(source.ref, { id: existingId, url, title: source.title, sourceType: source.sourceType, reliability });
      continue;
    }
    const unseen = checkSeen && !seen.has(url);
    if (unseen) unseenUrls += 1;
    const notes = [
      `Found by AI research (${providerLabel}).`,
      source.publishedAt ? `Published ${source.publishedAt}.` : "",
      unseen ? "The research tools never reported opening or finding this URL, so treat it as unconfirmed until the page is checked." : "",
    ]
      .filter(Boolean)
      .join(" ");
    const row = await prisma.source.create({
      data: {
        caseId,
        name: clip(source.publisher || hostOf(url), 200),
        title: clip(source.title, 500) || null,
        sourceType: source.sourceType,
        url,
        retrievedBy: `ai:${result.provider}`,
        reliabilityRating: unseen ? "low" : reliability,
        content: clip(source.summary, 4000) || null,
        notes,
        origin: "ai",
        researchRunId: runId,
      },
    });
    byUrl.set(url, row.id);
    byRef.set(source.ref, { id: row.id, url, title: source.title, sourceType: source.sourceType, reliability });
    sourcesCreated += 1;
  }

  let claimsCreated = 0;
  let unsupportedClaims = 0;
  for (const claim of data.claims) {
    const text = claim.claim.trim();
    if (!text) continue;
    const source = claim.sourceRef ? byRef.get(claim.sourceRef) : undefined;
    const unsupported = !source || claim.claimClass === "unsupported";
    if (unsupported) unsupportedClaims += 1;
    await prisma.evidenceClaim.create({
      data: {
        caseId,
        sourceId: source?.id ?? null,
        claimText: clip(text, 4000),
        sourceUrl: source?.url ?? null,
        sourceTitle: source ? clip(source.title, 500) || null : null,
        sourceType: source?.sourceType ?? "unknown",
        claimClass: source ? claim.claimClass : "unsupported",
        reliabilityRating: source?.reliability ?? "unknown",
        confidence: claim.confidence,
        topic: claim.topic,
        quote: source && claim.quote.trim() ? clip(claim.quote.trim(), 1500) : null,
        notes: claim.sourceRef && !source ? "The research cited a source it did not list; treated as unsupported." : null,
        origin: "ai",
        researchRunId: runId,
      },
    });
    claimsCreated += 1;
  }

  return {
    provider: result.provider,
    model: result.model,
    overview: data.overview,
    contradictions: data.contradictions,
    openQuestions: data.openQuestions,
    sourcesCreated,
    claimsCreated,
    unsupportedClaims,
    unseenUrls,
    usage: result.usage,
    notes: result.notes,
  };
}

function extensionFor(contentType: string): string {
  if (contentType.includes("pdf")) return "pdf";
  if (contentType.includes("html") || contentType.includes("xml")) return "html";
  if (contentType.includes("json")) return "json";
  if (contentType.startsWith("text/")) return "txt";
  return "bin";
}

async function mapLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next];
      next += 1;
      if (item !== undefined) await fn(item);
    }
  });
  await Promise.all(workers);
}

/**
 * Fetch every page the AI research cited, keep a copy, and check each quote
 * against the page text. Pages are fetched only from public addresses.
 */
export async function verifyAiSources(options: {
  caseId: string;
  runId: string;
  signal: AbortSignal;
  progress: (message: string) => void;
}): Promise<VerificationSummary> {
  const { caseId, runId, signal, progress } = options;
  const sources = await prisma.source.findMany({
    where: { caseId, origin: "ai", researchRunId: runId, url: { not: null } },
    include: { claims: true },
  });
  const summary: VerificationSummary = { checkedSources: 0, verified: 0, partial: 0, notFound: 0, unreachable: 0, blocked: 0, notChecked: 0 };

  await mapLimit(sources, 4, async (source) => {
    if (signal.aborted || !source.url) return;
    progress(`Checking ${hostOf(source.url)}`);
    const quoted = source.claims.filter((c) => c.quote);
    const now = new Date();
    let outcome: "fetched" | "unreachable" | "blocked" = "unreachable";
    let text: string | null = null;
    let problem = "";
    try {
      const page = await safeFetch(source.url, signal);
      const raw = await writeArtifact(caseId, `${source.id}.${extensionFor(page.contentType)}`, page.body, "sources");
      const readable = page.status < 400 ? pageText(page) : null;
      let textPath: string | null = null;
      if (readable) {
        text = readable.text;
        textPath = (await writeArtifact(caseId, `${source.id}.txt`, readable.text, "sources")).path;
      }
      await prisma.source.update({
        where: { id: source.id },
        data: {
          finalUrl: page.finalUrl,
          httpStatus: page.status,
          contentHash: createHash("sha256").update(page.body).digest("hex"),
          rawPath: raw.path,
          textPath,
          retrievedAt: now,
          title: source.title || (readable?.title ? clip(readable.title, 500) : null),
        },
      });
      if (page.status >= 400) problem = `The page returned HTTP ${page.status}.`;
      else if (!readable) problem = "The page is a PDF or another file type the app cannot read, so quotes were not checked.";
      outcome = page.status < 400 ? "fetched" : "unreachable";
    } catch (err) {
      if (signal.aborted) return;
      outcome = err instanceof BlockedAddressError ? "blocked" : "unreachable";
      problem = err instanceof Error ? err.message : String(err);
    }
    summary.checkedSources += 1;

    for (const claim of quoted) {
      let verification: "verified" | "partial" | "not_found" | "unreachable" | "blocked" | null;
      if (outcome === "blocked") verification = "blocked";
      else if (outcome === "unreachable") verification = "unreachable";
      else verification = text === null ? null : matchQuote(claim.quote ?? "", text);

      if (verification === "verified") summary.verified += 1;
      else if (verification === "partial") summary.partial += 1;
      else if (verification === "not_found") summary.notFound += 1;
      else if (verification === "unreachable") summary.unreachable += 1;
      else if (verification === "blocked") summary.blocked += 1;
      else summary.notChecked += 1;

      await prisma.evidenceClaim.update({
        where: { id: claim.id },
        data: {
          verification,
          verifiedAt: now,
          // A quote that is not on the cited page lowers confidence in the claim.
          ...(verification === "not_found" ? { confidence: "low" } : {}),
          notes: problem ? clip([claim.notes, problem].filter(Boolean).join(" "), 2000) : claim.notes,
        },
      });
    }
  });

  return summary;
}
