import { counterpartySchema, documentRefSchema, intakeSchema, type IntakeInputDTO } from "@/domain/schemas";
import { z } from "zod";

export const INTAKE_TEXT_FIELDS = ["projectName", "offerType", "offerPrice", "investmentAmount", "lockupVesting", "sellerDetails", "clientJurisdiction", "issuerJurisdiction", "notes"] as const;
export const INTAKE_LIST_FIELDS = ["tickers", "chains", "links", "contractAddresses", "claimedExchangeListings", "claimedPartnerships", "walletAddresses", "questionsToVerify"] as const;
export type IntakeField = typeof INTAKE_TEXT_FIELDS[number] | typeof INTAKE_LIST_FIELDS[number];
export type IntakeDraft = Record<IntakeField, string>;

export function intakeDraft(intake: Record<string, unknown> | null, projectName: string): IntakeDraft {
  const source = intake ?? {};
  const result = {} as IntakeDraft;
  for (const key of INTAKE_TEXT_FIELDS) result[key] = typeof source[key] === "string" ? source[key] : "";
  result.projectName = projectName;
  for (const key of INTAKE_LIST_FIELDS) {
    const value = source[key];
    result[key] = Array.isArray(value) ? value.map((item: unknown) => {
      if (key === "contractAddresses" && item && typeof item === "object") {
        const ref = item as { chain?: unknown; address?: unknown };
        return [ref.chain, ref.address].filter((part) => typeof part === "string" && part.length > 0).join(":");
      }
      return typeof item === "string" ? item : "";
    }).filter(Boolean).join(key === "tickers" || key === "chains" ? ", " : "\n") : "";
  }
  return result;
}

export function intakePayload(draft: IntakeDraft, original: Record<string, unknown> | null): IntakeInputDTO {
  const payload: Record<string, unknown> = {};
  for (const key of INTAKE_TEXT_FIELDS) payload[key] = draft[key].trim() || undefined;
  const originalDraft = intakeDraft(original, draft.projectName);
  for (const key of INTAKE_LIST_FIELDS) {
    if (Array.isArray(original?.[key]) && draft[key] === originalDraft[key]) {
      payload[key] = original[key];
      continue;
    }
    const separator = key === "tickers" || key === "chains" ? /[\n,]+/ : /\n+/;
    const items = draft[key].split(separator).map((value) => value.trim()).filter(Boolean);
    payload[key] = key === "contractAddresses" ? items.map((line) => {
      const split = line.search(/[:\s]/);
      return split < 0 ? { chain: "", address: line } : { chain: line.slice(0, split), address: line.slice(split + 1).trim() };
    }) : items;
  }
  // These structured records are not editable in this form. Preserve all their
  // schema fields on the full-replacement intake endpoint.
  payload.counterparties = z.array(counterpartySchema).parse(original?.counterparties ?? []);
  payload.documents = z.array(documentRefSchema).parse(original?.documents ?? []);
  return intakeSchema.parse(payload);
}
