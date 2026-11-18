import { ENTITY_TYPE, CONFIDENCE, MARKET_TYPE, STABLECOIN_CLASSIFICATION, RWA_ASSET_TYPE } from "./enums";

export type FieldKind = "text" | "number" | "bool" | "select" | "textarea" | "lines";
export interface FieldDef { name: string; label: string; kind: FieldKind; options?: readonly string[]; required?: boolean; full?: boolean; hint?: string }
export interface RecordDef { type: string; label: string; fields: FieldDef[] }

export const RECORD_DEFS: RecordDef[] = [
  { type: "entity", label: "Entity", fields: [
    { name: "name", label: "Name", kind: "text", required: true },
    { name: "entityType", label: "Type", kind: "select", options: ENTITY_TYPE },
    { name: "role", label: "Role", kind: "text" },
    { name: "jurisdiction", label: "Jurisdiction", kind: "text" },
    { name: "registrationNumber", label: "Registration no.", kind: "text" },
    { name: "website", label: "Website", kind: "text" },
    { name: "confidence", label: "Confidence", kind: "select", options: CONFIDENCE },
    { name: "notes", label: "Notes", kind: "textarea", full: true },
  ] },
  { type: "person", label: "Person", fields: [
    { name: "fullName", label: "Full name", kind: "text", required: true },
    { name: "confidence", label: "Confidence", kind: "select", options: CONFIDENCE },
    { name: "roles", label: "Roles", kind: "lines", hint: "one per line" },
    { name: "linkedinUrl", label: "LinkedIn", kind: "text" },
    { name: "githubUrl", label: "GitHub", kind: "text" },
    { name: "xUrl", label: "X / Twitter", kind: "text" },
    { name: "previousCompanies", label: "Previous companies", kind: "lines", hint: "one per line" },
    { name: "legalHistory", label: "Legal history", kind: "textarea", full: true },
  ] },
  { type: "token", label: "Token", fields: [
    { name: "name", label: "Name", kind: "text", required: true },
    { name: "symbol", label: "Symbol", kind: "text" },
    { name: "chain", label: "Chain", kind: "text" },
    { name: "contractAddress", label: "Contract address", kind: "text" },
    { name: "price", label: "Price (USD)", kind: "number" },
    { name: "marketCap", label: "Market cap (USD)", kind: "number" },
    { name: "fdv", label: "FDV (USD)", kind: "number" },
    { name: "circulatingSupply", label: "Circulating supply", kind: "number" },
    { name: "totalSupply", label: "Total supply", kind: "number" },
    { name: "maxSupply", label: "Max supply", kind: "number" },
    { name: "vestingNotes", label: "Vesting notes", kind: "textarea", full: true },
    { name: "allocationsText", label: "Allocations", kind: "textarea", full: true, hint: "one per line: category:percent (e.g. team:18)" },
    { name: "unlocksText", label: "Unlock events", kind: "textarea", full: true, hint: "one per line: date:percent (e.g. 2025-09-01:5)" },
  ] },
  { type: "contract", label: "Contract", fields: [
    { name: "chain", label: "Chain", kind: "text", required: true },
    { name: "address", label: "Address", kind: "text", required: true },
    { name: "name", label: "Name", kind: "text" },
    { name: "ownerAddress", label: "Owner address", kind: "text" },
    { name: "verified", label: "Source verified", kind: "bool" },
    { name: "proxy", label: "Upgradeable proxy", kind: "bool" },
    { name: "canMint", label: "Can mint", kind: "bool" },
    { name: "canPause", label: "Can pause", kind: "bool" },
    { name: "canBlacklist", label: "Can blacklist", kind: "bool" },
    { name: "canUpgrade", label: "Can upgrade", kind: "bool" },
    { name: "multisig", label: "Multisig owner", kind: "bool" },
    { name: "timelock", label: "Timelock", kind: "bool" },
    { name: "securityNotes", label: "Security notes", kind: "textarea", full: true },
  ] },
  { type: "market", label: "Market", fields: [
    { name: "exchange", label: "Exchange / venue", kind: "text", required: true },
    { name: "marketType", label: "Market type", kind: "select", options: MARKET_TYPE },
    { name: "base", label: "Base", kind: "text" },
    { name: "quote", label: "Quote", kind: "text" },
    { name: "pair", label: "Pair", kind: "text" },
    { name: "price", label: "Price (USD)", kind: "number" },
    { name: "volume24h", label: "24h volume (USD)", kind: "number" },
    { name: "spreadBps", label: "Spread (bps)", kind: "number" },
    { name: "depthPlus2PctUsd", label: "Depth +2% (USD)", kind: "number" },
    { name: "depthMinus2PctUsd", label: "Depth -2% (USD)", kind: "number" },
  ] },
  { type: "stablecoin", label: "Stablecoin", fields: [
    { name: "name", label: "Name", kind: "text", required: true },
    { name: "symbol", label: "Symbol", kind: "text" },
    { name: "classification", label: "Classification", kind: "select", options: STABLECOIN_CLASSIFICATION },
    { name: "jurisdiction", label: "Jurisdiction", kind: "text" },
    { name: "redemptionParty", label: "Redemption party", kind: "text" },
    { name: "reserveAssets", label: "Reserve assets", kind: "lines", hint: "one per line" },
    { name: "reserveCustodians", label: "Reserve custodians", kind: "lines", hint: "one per line" },
    { name: "attestations", label: "Attestations", kind: "lines", hint: "one per line" },
    { name: "redemptionTerms", label: "Redemption terms", kind: "textarea", full: true },
    { name: "canPauseRedemptions", label: "Can pause redemptions", kind: "bool" },
    { name: "blacklistFreeze", label: "Blacklist / freeze", kind: "bool" },
    { name: "confidence", label: "Confidence", kind: "select", options: CONFIDENCE },
  ] },
  { type: "rwa", label: "RWA asset", fields: [
    { name: "assetDescription", label: "Asset description", kind: "text", required: true },
    { name: "assetType", label: "Asset type", kind: "select", options: RWA_ASSET_TYPE },
    { name: "jurisdiction", label: "Jurisdiction", kind: "text" },
    { name: "legalOwnerBefore", label: "Legal owner (before)", kind: "text" },
    { name: "legalOwnerAfter", label: "Legal owner (after)", kind: "text" },
    { name: "valuationMethod", label: "Valuation method", kind: "text" },
    { name: "investorRights", label: "Investor rights", kind: "lines", hint: "one per line" },
    { name: "redemptionRights", label: "Redemption rights", kind: "textarea", full: true },
    { name: "cashflowRights", label: "Cashflow rights", kind: "textarea", full: true },
  ] },
];

function parsePairs(raw: string, keyA: string, keyB: string): Record<string, unknown>[] {
  return raw
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const idx = l.search(/[:=]/);
      const a = idx >= 0 ? l.slice(0, idx).trim() : l.trim();
      const b = idx >= 0 ? l.slice(idx + 1).trim() : "";
      const row: Record<string, unknown> = { [keyA]: a };
      if (b) {
        const n = Number(b.replace(/[%,\s]/g, ""));
        row[keyB] = Number.isFinite(n) ? n : b;
      }
      return row;
    });
}

export function buildRecordData(def: RecordDef, fd: FormData): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const f of def.fields) {
    if (f.name === "allocationsText" || f.name === "unlocksText") continue;
    if (f.kind === "bool") { data[f.name] = fd.get(f.name) === "on"; continue; }
    const s = String(fd.get(f.name) ?? "").trim();
    if (f.kind === "number") { if (s !== "") data[f.name] = Number(s); continue; }
    if (f.kind === "lines") { data[f.name] = s ? s.split(/[\n,]+/).map((x) => x.trim()).filter(Boolean) : []; continue; }
    if (s) data[f.name] = s;
  }
  if (def.type === "token") {
    data.allocations = parsePairs(String(fd.get("allocationsText") ?? ""), "category", "percentageTotal");
    data.unlocks = parsePairs(String(fd.get("unlocksText") ?? ""), "date", "percentageSupply");
  }
  return data;
}
