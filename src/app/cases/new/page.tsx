"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ChevronDown, Loader2 } from "lucide-react";
import type { IntakeExtract } from "@/ai/schemas";
import { IntakeExtractor } from "@/components/intake-extractor";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { REPORT_TYPE, REPORT_TYPE_LABELS, INTAKE_OFFER_TYPE } from "@/domain/enums";

const splitLines = (s: string) => s.split(/\n+/).map((x) => x.trim()).filter(Boolean);
const splitCommas = (s: string) => s.split(/[\n,]+/).map((x) => x.trim()).filter(Boolean);

type Counterparty = IntakeExtract["counterparties"][number];

/** Form values for an extract; empty values are left out so they don't clear what the analyst typed. */
function extractToFields(x: IntakeExtract): Record<string, string> {
  const lines = (items: string[]) => items.map((i) => i.trim()).filter(Boolean).join("\n");
  const fields: Record<string, string> = {
    projectName: x.projectName,
    clientName: x.clientName,
    tickers: x.tickers.join(", "),
    chains: x.chains.join(", "),
    links: lines(x.links),
    contractAddresses: lines(x.contractAddresses.map((c) => (c.chain ? `${c.chain}:${c.address}` : c.address))),
    claimedExchangeListings: lines(x.claimedExchangeListings),
    claimedPartnerships: lines(x.claimedPartnerships),
    walletAddresses: lines(x.walletAddresses),
    questionsToVerify: lines(x.questionsToVerify),
    offerType: x.offerType === "unknown" ? "" : x.offerType,
    offerPrice: x.offerPrice,
    investmentAmount: x.investmentAmount,
    lockupVesting: x.lockupVesting,
    sellerDetails: x.sellerDetails,
    clientJurisdiction: x.clientJurisdiction,
    issuerJurisdiction: x.issuerJurisdiction,
    notes: x.notes,
  };
  return Object.fromEntries(Object.entries(fields).filter(([, v]) => v.trim() !== ""));
}

export default function NewCasePage() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [counterparties, setCounterparties] = useState<Counterparty[]>([]);
  const [offerText, setOfferText] = useState<string | null>(null);
  const [saveOfferText, setSaveOfferText] = useState(true);
  const [createdCaseId, setCreatedCaseId] = useState<string | null>(null);

  function applyExtract(extract: IntakeExtract, text: string) {
    const form = formRef.current;
    let applied = 0;
    let preserved = 0;
    if (form) {
      for (const [name, value] of Object.entries(extractToFields(extract))) {
        const el = form.elements.namedItem(name);
        if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
          if (el.value.trim()) preserved += 1;
          else { el.value = value; applied += 1; }
        }
      }
    }
    setCounterparties((current) => {
      const combined = [...current];
      for (const item of extract.counterparties.filter((c) => c.name.trim() || c.contact.trim())) {
        if (!combined.some((existing) => existing.name === item.name && existing.contact === item.contact)) combined.push(item);
      }
      return combined;
    });
    setOfferText(text);
    return { applied, preserved };
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting || createdCaseId) return;
    setSubmitting(true);
    setError(null);
    const f = new FormData(e.currentTarget);
    const get = (k: string) => String(f.get(k) ?? "").trim();

    const contractAddresses = splitLines(get("contractAddresses")).map((line) => {
      const separator = line.search(/[:\s]/);
      return separator < 0
        ? { chain: "", address: line }
        : { chain: line.slice(0, separator), address: line.slice(separator + 1).trim() };
    });

    const payload = {
      projectName: get("projectName"),
      clientName: get("clientName") || undefined,
      analyst: get("analyst") || undefined,
      reportType: get("reportType") || "full_institutional",
      brand: get("brand") || "Block Consult GmbH",
      intake: {
        projectName: get("projectName"),
        tickers: splitCommas(get("tickers")),
        links: splitLines(get("links")),
        contractAddresses,
        chains: splitCommas(get("chains")),
        claimedPartnerships: splitLines(get("claimedPartnerships")),
        claimedExchangeListings: splitLines(get("claimedExchangeListings")),
        walletAddresses: splitLines(get("walletAddresses")),
        counterparties,
        questionsToVerify: splitLines(get("questionsToVerify")),
        offerType: get("offerType") || undefined,
        offerPrice: get("offerPrice") || undefined,
        investmentAmount: get("investmentAmount") || undefined,
        lockupVesting: get("lockupVesting") || undefined,
        sellerDetails: get("sellerDetails") || undefined,
        clientJurisdiction: get("clientJurisdiction") || undefined,
        issuerJurisdiction: get("issuerJurisdiction") || undefined,
        notes: get("notes") || undefined,
      },
    };

    try {
      const res = await fetch("/api/cases", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const created = (await res.json()) as { id: string };
      setCreatedCaseId(created.id);
      if (offerText && saveOfferText) {
        // Preserve the created case even if its optional source cannot be saved.
        const source = await fetch(`/api/cases/${created.id}/sources`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            name: "Offer text pasted at intake",
            sourceType: "pitch_claim",
            reliabilityRating: "low",
            content: offerText,
            notes: "Supplied with the offer. Claims in it are unverified.",
          }),
        }).catch(() => null);
        if (!source?.ok) {
          setError("The case was created, but the offer text could not be saved as a source. Copy it from this form and add it in the case’s Sources tab.");
          setSubmitting(false);
          return;
        }
      }
      router.push(`/cases/${created.id}`);
    } catch (err) {
      setError((err as Error).message);
      setSubmitting(false);
    }
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} className="mx-auto max-w-5xl space-y-6" aria-busy={submitting}>
      <div>
        <Link href="/" className="mb-6 inline-flex items-center gap-2 text-xs text-muted hover:text-link"><ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> Case library</Link>
        <p className="eyebrow">Intake</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-fg sm:text-4xl">Create a case<span className="text-accent">.</span></h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">Start with a project name. Add the mandate, offer and known claims now, or complete them as your review progresses.</p>
        <p className="mt-2 text-xs text-faint">Only the project name is required. Claims remain unverified until supported by evidence.</p>
      </div>

      <details className="group rounded-card border border-line bg-surface">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 text-sm font-medium text-fg">
          <span>Have an offer email or term sheet? <span className="font-normal text-muted">Fill empty fields with AI.</span></span>
          <ChevronDown className="h-4 w-4 shrink-0 text-muted transition-transform group-open:rotate-180" aria-hidden="true" />
        </summary>
        <div className="border-t border-line p-4 sm:p-5"><IntakeExtractor onExtract={applyExtract} /></div>
      </details>

      <Card>
        <CardHeader title="Mandate" subtitle="Identify the project, client and report you are preparing." />
        <CardBody className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Project name *"><Input name="projectName" required placeholder="e.g. Meridian RWA Token" /></Field>
          <Field label="Client name"><Input name="clientName" placeholder="Client / mandate" /></Field>
          <Field label="Analyst"><Input name="analyst" placeholder="Lead analyst" /></Field>
          <Field label="Brand"><Input name="brand" defaultValue="Block Consult GmbH" /></Field>
          <Field label="Report type">
            <Select name="reportType" defaultValue="full_institutional">
              {REPORT_TYPE.map((t) => <option key={t} value={t}>{REPORT_TYPE_LABELS[t]}</option>)}
            </Select>
          </Field>
          <Field label="Offer type">
            <Select name="offerType" defaultValue="">
              <option value="">— unknown —</option>
              {INTAKE_OFFER_TYPE.map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
            </Select>
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Asset identity" subtitle="Tickers, links and contract addresses to verify" />
        <CardBody className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Ticker(s)" hint="comma-separated"><Input name="tickers" placeholder="MRDN" /></Field>
          <Field label="Chain(s)" hint="comma-separated"><Input name="chains" placeholder="ethereum, base" /></Field>
          <Field label="Websites / links" hint="one per line"><Textarea name="links" placeholder={"https://project.xyz\nhttps://docs.project.xyz"} /></Field>
          <Field label="Contract address(es)" hint="One per line: chain:address, or just an address if the chain is unknown."><Textarea name="contractAddresses" placeholder={"ethereum:0xabc...\nbase:0xdef..."} /></Field>
          <Field label="Claimed exchange listings" hint="one per line"><Textarea name="claimedExchangeListings" placeholder={"Binance\nKraken"} /></Field>
          <Field label="Claimed partnerships" hint="one per line"><Textarea name="claimedPartnerships" placeholder={"BlackRock\nFireblocks"} /></Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Offer & counterparty" subtitle="Record the terms as offered and who is making the offer." />
        <CardBody className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Offer price"><Input name="offerPrice" placeholder="$0.04 / token" /></Field>
          <Field label="Investment size"><Input name="investmentAmount" placeholder="$250,000" /></Field>
          <Field label="Lockup / vesting"><Input name="lockupVesting" placeholder="12m cliff, 24m linear" /></Field>
          <Field label="Wallet addresses" hint="one per line"><Textarea name="walletAddresses" /></Field>
          <Field label="Client jurisdiction"><Input name="clientJurisdiction" placeholder="Germany" /></Field>
          <Field label="Issuer jurisdiction"><Input name="issuerJurisdiction" placeholder="BVI" /></Field>
          <div className="sm:col-span-2">
            <Field label="Seller / counterparty details" hint="how the offer arrived, contact channels, claimed authority"><Textarea name="sellerDetails" /></Field>
          </div>
          {counterparties.length > 0 && (
            <div className="sm:col-span-2">
              <p className="label">Counterparties found in the offer text</p>
              <ul className="space-y-1 text-sm text-muted">
                {counterparties.map((c, i) => (
                  <li key={i} className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-fg">{c.name || "Unnamed"}</span>
                    {c.claimedRole && <span>· {c.claimedRole}</span>}
                    {c.contact && <span className="font-mono text-xs">· {c.contact}</span>}
                    <button
                      type="button"
                      className="text-xs text-faint underline-offset-2 hover:text-fg hover:underline"
                      onClick={() => setCounterparties((list) => list.filter((_, j) => j !== i))}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Claims & questions to verify" subtitle="Set the questions that the evidence review needs to answer." />
        <CardBody className="grid grid-cols-1 gap-4">
          <Field label="Questions / claims to verify" hint="one per line"><Textarea name="questionsToVerify" /></Field>
          <Field label="Notes"><Textarea name="notes" /></Field>
        </CardBody>
      </Card>

      {offerText && (
        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" className="mt-0.5 h-4 w-4 accent-accent" checked={saveOfferText} onChange={(e) => setSaveOfferText(e.target.checked)} />
          <span>
            <span className="block text-fg">Save the pasted offer text as a source</span>
            <span className="block text-xs text-muted">Recorded as an unverified pitch claim so the checks can scan it for red flags.</span>
          </span>
        </label>
      )}

      {error && <div role="alert" className="rounded-lg border border-danger/25 bg-danger/10 px-4 py-3 text-sm text-danger">{error}</div>}

      <div className="flex flex-wrap items-center gap-3 border-t border-line pt-6">
        {createdCaseId && !submitting ? <Button asChild><Link href={`/cases/${createdCaseId}`}>Open created case</Link></Button> : <Button type="submit" disabled={submitting}>{submitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}{submitting ? "Creating…" : "Create case"}</Button>}
        {!createdCaseId && <Button type="button" variant="ghost" disabled={submitting} onClick={() => router.push("/")}>Cancel</Button>}
      </div>
    </form>
  );
}
