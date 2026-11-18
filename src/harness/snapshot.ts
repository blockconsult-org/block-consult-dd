import type { IntakeInput } from "@prisma/client";
import { prisma } from "@/lib/db";
import { parseJson, parseStringArray } from "@/domain/json";
import type { IntakeOfferType } from "@/domain/enums";
import { INTAKE_OFFER_TYPE } from "@/domain/enums";
import type { IntakeInputDTO } from "@/domain/schemas";
import type { CaseSnapshot } from "./types";

/** Parse a stored IntakeInput row into the typed DTO used by workers. */
export function parseIntake(row: IntakeInput | null, projectFallback: string): IntakeInputDTO {
  const offerTypeRaw = row?.offerType ?? undefined;
  const offerType = offerTypeRaw && (INTAKE_OFFER_TYPE as readonly string[]).includes(offerTypeRaw)
    ? (offerTypeRaw as IntakeOfferType)
    : undefined;
  return {
    projectName: row?.projectName ?? projectFallback,
    tickers: parseStringArray(row?.tickers),
    links: parseStringArray(row?.links),
    contractAddresses: parseJson(row?.contractAddresses, [] as { chain: string; address: string }[]),
    chains: parseStringArray(row?.chains),
    claimedPartnerships: parseStringArray(row?.claimedPartnerships),
    claimedExchangeListings: parseStringArray(row?.claimedExchangeListings),
    walletAddresses: parseStringArray(row?.walletAddresses),
    counterparties: parseJson(row?.counterparties, [] as IntakeInputDTO["counterparties"]),
    documents: parseJson(row?.documents, [] as IntakeInputDTO["documents"]),
    questionsToVerify: parseStringArray(row?.questionsToVerify),
    offerType,
    offerPrice: row?.offerPrice ?? undefined,
    investmentAmount: row?.investmentAmount ?? undefined,
    lockupVesting: row?.lockupVesting ?? undefined,
    sellerDetails: row?.sellerDetails ?? undefined,
    clientJurisdiction: row?.clientJurisdiction ?? undefined,
    issuerJurisdiction: row?.issuerJurisdiction ?? undefined,
    notes: row?.notes ?? undefined,
  };
}

/** Load a full read-only snapshot of a case for the harness/report. */
export async function loadSnapshot(caseId: string): Promise<CaseSnapshot | null> {
  const caseRow = await prisma.dDCase.findUnique({
    where: { id: caseId },
    include: {
      intake: true,
      sources: { orderBy: { createdAt: "asc" } },
      evidenceClaims: { orderBy: { createdAt: "asc" } },
      entities: true,
      people: true,
      tokens: { include: { allocations: true, unlocks: true } },
      contracts: true,
      markets: true,
      holderSnaps: { orderBy: { takenAt: "desc" } },
      liquiditySnaps: { orderBy: { takenAt: "desc" } },
      stablecoins: true,
      rwaAssets: true,
    },
  });
  if (!caseRow) return null;

  const intake = parseIntake(caseRow.intake, caseRow.projectName);

  const corpus = [
    intake.notes ?? "",
    intake.sellerDetails ?? "",
    intake.claimedPartnerships.join(" "),
    intake.questionsToVerify.join(" "),
    ...caseRow.sources.map((s) => `${s.title ?? ""} ${s.content ?? ""}`),
    ...caseRow.evidenceClaims.map((c) => c.claimText),
  ]
    .join("\n")
    .toLowerCase();

  return {
    caseRow,
    intakeRow: caseRow.intake,
    intake,
    sources: caseRow.sources,
    evidence: caseRow.evidenceClaims,
    entities: caseRow.entities,
    people: caseRow.people,
    tokens: caseRow.tokens,
    contracts: caseRow.contracts,
    markets: caseRow.markets,
    holderSnaps: caseRow.holderSnaps,
    liquiditySnaps: caseRow.liquiditySnaps,
    stablecoins: caseRow.stablecoins,
    rwaAssets: caseRow.rwaAssets,
    corpus,
  };
}
