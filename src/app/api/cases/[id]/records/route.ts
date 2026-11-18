import { prisma } from "@/lib/db";
import { ok, fail } from "@/lib/api";
import { coerceStringArray, toJson } from "@/domain/json";

type Params = { params: Promise<{ id: string }> };

type Dict = Record<string, unknown>;
const str = (d: Dict, k: string): string | null => (typeof d[k] === "string" && d[k] ? (d[k] as string) : null);
const num = (d: Dict, k: string): number | null => {
  const v = d[k];
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const bool = (d: Dict, k: string): boolean => d[k] === true || d[k] === "true";
const arr = (d: Dict, k: string): string => toJson(coerceStringArray(d[k]));

/**
 * Generic record creation for the manually-entered data models (token, contract,
 * market, entity, person, stablecoin, RWA, holder/liquidity snapshots).
 * Body shape: { type: string, data: object }.
 */
export async function POST(req: Request, { params }: Params) {
  const { id: caseId } = await params;
  let body: { type?: string; data?: Dict };
  try {
    body = (await req.json()) as { type?: string; data?: Dict };
  } catch {
    return fail("Invalid JSON body");
  }
  const type = body.type ?? "";
  const d = body.data ?? {};

  try {
    switch (type) {
      case "entity":
        return ok(await prisma.entity.create({ data: { caseId, name: req2(str(d, "name")), entityType: str(d, "entityType") ?? "unknown", role: str(d, "role"), jurisdiction: str(d, "jurisdiction"), registrationNumber: str(d, "registrationNumber"), website: str(d, "website"), aliases: arr(d, "aliases"), confidence: str(d, "confidence") ?? "low", notes: str(d, "notes") } }), 201);

      case "person":
        return ok(await prisma.person.create({ data: { caseId, fullName: req2(str(d, "fullName")), roles: arr(d, "roles"), linkedinUrl: str(d, "linkedinUrl"), githubUrl: str(d, "githubUrl"), xUrl: str(d, "xUrl"), previousCompanies: arr(d, "previousCompanies"), knownProjects: arr(d, "knownProjects"), legalHistory: str(d, "legalHistory"), reputationNotes: str(d, "reputationNotes"), confidence: str(d, "confidence") ?? "low" } }), 201);

      case "token": {
        const allocations = Array.isArray(d.allocations) ? (d.allocations as Dict[]) : [];
        const unlocks = Array.isArray(d.unlocks) ? (d.unlocks as Dict[]) : [];
        const token = await prisma.token.create({
          data: {
            caseId,
            name: req2(str(d, "name")),
            symbol: str(d, "symbol"),
            chain: str(d, "chain"),
            contractAddress: str(d, "contractAddress"),
            tokenStandard: str(d, "tokenStandard"),
            decimals: num(d, "decimals"),
            price: num(d, "price"),
            marketCap: num(d, "marketCap"),
            fdv: num(d, "fdv"),
            circulatingSupply: num(d, "circulatingSupply"),
            totalSupply: num(d, "totalSupply"),
            maxSupply: num(d, "maxSupply"),
            utility: arr(d, "utility"),
            valueCapture: arr(d, "valueCapture"),
            rightsDisclaimer: str(d, "rightsDisclaimer"),
            vestingNotes: str(d, "vestingNotes"),
            allocations: { create: allocations.map((a) => ({ category: str(a, "category") ?? "unknown", amountTokens: num(a, "amountTokens"), percentageTotal: num(a, "percentageTotal"), vestingTerms: str(a, "vestingTerms"), confidence: str(a, "confidence") ?? "low" })) },
            unlocks: { create: unlocks.map((u) => ({ date: str(u, "date"), amountTokens: num(u, "amountTokens"), percentageSupply: num(u, "percentageSupply"), category: str(u, "category"), cliff: bool(u, "cliff"), linear: bool(u, "linear"), source: str(u, "source") })) },
          },
          include: { allocations: true, unlocks: true },
        });
        return ok(token, 201);
      }

      case "contract":
        return ok(await prisma.tokenContract.create({ data: { caseId, chain: req2(str(d, "chain")), address: req2(str(d, "address")), name: str(d, "name"), verified: bool(d, "verified"), proxy: bool(d, "proxy"), ownerAddress: str(d, "ownerAddress"), canMint: bool(d, "canMint"), canBurn: bool(d, "canBurn"), canPause: bool(d, "canPause"), canFreeze: bool(d, "canFreeze"), canBlacklist: bool(d, "canBlacklist"), canUpgrade: bool(d, "canUpgrade"), multisig: bool(d, "multisig"), timelock: bool(d, "timelock"), auditReports: arr(d, "auditReports"), securityNotes: str(d, "securityNotes") } }), 201);

      case "market":
        return ok(await prisma.exchangeMarket.create({ data: { caseId, exchange: req2(str(d, "exchange")), base: str(d, "base"), quote: str(d, "quote"), pair: str(d, "pair"), marketType: str(d, "marketType") ?? "unknown", url: str(d, "url"), price: num(d, "price"), volume24h: num(d, "volume24h"), spreadBps: num(d, "spreadBps"), depthPlus2PctUsd: num(d, "depthPlus2PctUsd"), depthMinus2PctUsd: num(d, "depthMinus2PctUsd"), depositStatus: str(d, "depositStatus") ?? "unknown", withdrawalStatus: str(d, "withdrawalStatus") ?? "unknown", trustScore: str(d, "trustScore") ?? "unknown" } }), 201);

      case "stablecoin":
        return ok(await prisma.stablecoinProfile.create({ data: { caseId, name: req2(str(d, "name")), symbol: str(d, "symbol"), issuerEntityId: str(d, "issuerEntityId"), jurisdiction: str(d, "jurisdiction"), classification: str(d, "classification") ?? "unknown", reserveAssets: arr(d, "reserveAssets"), reserveCustodians: arr(d, "reserveCustodians"), redemptionParty: str(d, "redemptionParty"), redemptionTerms: str(d, "redemptionTerms"), attestations: arr(d, "attestations"), canPauseRedemptions: bool(d, "canPauseRedemptions"), blacklistFreeze: bool(d, "blacklistFreeze"), confidence: str(d, "confidence") ?? "low" } }), 201);

      case "rwa":
        return ok(await prisma.rWAAssetProfile.create({ data: { caseId, assetDescription: req2(str(d, "assetDescription")), assetType: str(d, "assetType") ?? "other", jurisdiction: str(d, "jurisdiction"), legalOwnerBefore: str(d, "legalOwnerBefore"), legalOwnerAfter: str(d, "legalOwnerAfter"), spvEntityId: str(d, "spvEntityId"), custodianEntityId: str(d, "custodianEntityId"), tokenContract: str(d, "tokenContract"), investorRights: arr(d, "investorRights"), redemptionRights: str(d, "redemptionRights"), cashflowRights: str(d, "cashflowRights"), valuationMethod: str(d, "valuationMethod") } }), 201);

      case "holder":
        return ok(await prisma.holderSnapshot.create({ data: { caseId, totalHolders: num(d, "totalHolders"), top10Pct: num(d, "top10Pct"), top50Pct: num(d, "top50Pct"), topWallets: arr(d, "topWallets"), source: str(d, "source") } }), 201);

      case "liquidity":
        return ok(await prisma.liquiditySnapshot.create({ data: { caseId, totalLiquidityUsd: num(d, "totalLiquidityUsd"), cexLiquidityUsd: num(d, "cexLiquidityUsd"), dexLiquidityUsd: num(d, "dexLiquidityUsd"), volume24h: num(d, "volume24h"), venueCount: num(d, "venueCount"), source: str(d, "source") } }), 201);

      default:
        return fail(`Unknown record type: ${type}`);
    }
  } catch (err) {
    return fail(`Could not add ${type}: ${(err as Error).message}`, 500);
  }
}

function req2(v: string | null): string {
  if (!v) throw new Error("missing required field");
  return v;
}
