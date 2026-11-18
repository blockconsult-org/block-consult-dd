"use client";

import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { INTAKE_OFFER_TYPE } from "@/domain/enums";
import { titleCase } from "@/lib/utils";
import type { IntakeDraft, IntakeField } from "./intake-draft";

function IntakeGroup({ title, description, children, open = false }: { title: string; description: string; children: ReactNode; open?: boolean }) {
  return <details className="group rounded-card border border-line bg-surface" open={open}>
    <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-4 sm:p-5">
      <span><span className="block text-sm font-semibold text-fg">{title}</span><span className="mt-1 block text-xs leading-5 text-muted">{description}</span></span>
      <ChevronDown className="h-4 w-4 shrink-0 text-muted transition-transform duration-160 group-open:rotate-180" aria-hidden />
    </summary>
    <div className="grid grid-cols-1 gap-4 border-t border-line p-4 sm:grid-cols-2 sm:p-5">{children}</div>
  </details>;
}

/** Shared intake groups for the initial case and subsequent edits. */
export function IntakeFields({ values, onChange }: { values?: IntakeDraft; onChange?: (name: IntakeField, value: string) => void }) {
  function field(name: IntakeField) {
    return values ? { name, value: values[name], onChange: (event: { target: { value: string } }) => onChange?.(name, event.target.value) } : { name };
  }
  return <div className="space-y-4">
    <IntakeGroup title="Asset identity" description="Tickers, links and addresses to verify." open>
      <Field label="Ticker(s)" hint="Separate with commas."><Input {...field("tickers")} placeholder="MRDN" /></Field>
      <Field label="Chain(s)" hint="Separate with commas."><Input {...field("chains")} placeholder="ethereum, base" /></Field>
      <Field label="Websites / links" hint="One per line."><Textarea {...field("links")} rows={3} placeholder="https://project.example" /></Field>
      <Field label="Contract address(es)" hint="One per line: chain:address, or an address if the chain is unknown."><Textarea {...field("contractAddresses")} rows={3} placeholder="ethereum:0x…" /></Field>
      <Field label="Claimed exchange listings" hint="One per line."><Textarea {...field("claimedExchangeListings")} rows={3} /></Field>
      <Field label="Claimed partnerships" hint="One per line."><Textarea {...field("claimedPartnerships")} rows={3} /></Field>
    </IntakeGroup>
    <IntakeGroup title="Offer & counterparty" description="Terms, jurisdictions and the person making the offer.">
      <Field label="Offer type"><Select {...field("offerType")} defaultValue={values ? undefined : ""}>
        <option value="">Unknown</option>{INTAKE_OFFER_TYPE.map((value) => <option key={value} value={value}>{titleCase(value)}</option>)}
      </Select></Field>
      <Field label="Offer price"><Input {...field("offerPrice")} placeholder="$0.04 / token" /></Field>
      <Field label="Investment size"><Input {...field("investmentAmount")} placeholder="$250,000" /></Field>
      <Field label="Lockup / vesting"><Input {...field("lockupVesting")} placeholder="12-month cliff, then 24 months linear" /></Field>
      <Field label="Client jurisdiction"><Input {...field("clientJurisdiction")} /></Field>
      <Field label="Issuer jurisdiction"><Input {...field("issuerJurisdiction")} /></Field>
      <Field label="Wallet addresses" hint="One per line."><Textarea {...field("walletAddresses")} rows={3} /></Field>
      <Field label="Seller / counterparty details" hint="Contact channels, how the offer arrived and claimed authority."><Textarea {...field("sellerDetails")} rows={3} /></Field>
    </IntakeGroup>
    <IntakeGroup title="Questions & notes" description="Claims to verify and context for the review.">
      <Field label="Questions / claims to verify" hint="One per line."><Textarea {...field("questionsToVerify")} rows={4} /></Field>
      <Field label="Notes"><Textarea {...field("notes")} rows={4} /></Field>
    </IntakeGroup>
  </div>;
}
