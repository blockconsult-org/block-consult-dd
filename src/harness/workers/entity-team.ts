import { parseStringArray } from "@/domain/json";
import type { Worker } from "../types";
import { emptyResult } from "../types";
import { isRwaCase, isStablecoinCase } from "../applicability";

/**
 * Entity / Team Worker — entity table, legal-structure notes and founder dossier
 * with a 1..10 founder risk score (10 = lowest risk). Flags anonymous teams for
 * regulated/RWA products and unverified claimed licenses.
 */
export const entityTeamWorker: Worker = {
  name: "entity-team",
  run(ctx) {
    const out = emptyResult();
    const { entities, people, intake } = ctx.snapshot;
    const regulated = isStablecoinCase(ctx.snapshot) || isRwaCase(ctx.snapshot);

    const entityRows = entities.map((e) => ({
      name: e.name,
      role: e.role ?? e.entityType,
      jurisdiction: e.jurisdiction ?? "—",
      registration: e.registrationNumber ?? "—",
      status: e.status,
      confidence: e.confidence,
      notes: e.notes ?? "",
    }));

    const peopleRows = people.map((p) => ({
      name: p.fullName,
      roles: parseStringArray(p.roles),
      linkedin: p.linkedinUrl ?? "",
      github: p.githubUrl ?? "",
      previous: parseStringArray(p.previousCompanies),
      legalHistory: p.legalHistory ?? "",
      reputation: p.reputationNotes ?? "",
      confidence: p.confidence,
    }));

    // Anonymous team for a regulated product.
    if (regulated && people.length === 0) {
      out.findings.push({
        category: "team",
        title: "No named team for a regulated/RWA product",
        analysis: "A stablecoin/RWA product requires identifiable, accountable principals. No team members are recorded.",
        severity: "high",
        confidence: "high",
        openQuestions: ["Provide named officers, management bios and compliance/legal leads."],
      });
    }

    if (entities.length === 0) {
      out.status = "partial";
      out.findings.push({
        category: "entity",
        title: "No legal entity identified",
        analysis: "The issuing/operating legal entity has not been identified. Counterparty and liability cannot be assessed.",
        severity: "high",
        confidence: "high",
        openQuestions: ["Who is the legal issuer?", "Who is the legal seller and what is their authority?"],
      });
    }

    const founderScore = scoreFounders(peopleRows.length, entities.length, regulated, intake.claimedPartnerships.length);

    out.moduleOutput = {
      entities: entityRows,
      people: peopleRows,
      founderScore,
      legalStructureNote:
        entities.length > 0
          ? "Map which entity issued the token, owns IP, employs the team, holds the treasury, controls the contracts, and is liable to investors."
          : "Entity structure unmapped — operating company vs token issuer distinction unknown.",
    };
    out.suggestedScores = { teamFounderQuality: founderScore };
    out.confidence = people.length ? "medium" : "low";
    return out;
  },
};

function scoreFounders(peopleCount: number, entityCount: number, regulated: boolean, partnerships: number): number {
  let score = 5;
  if (peopleCount === 0) score = regulated ? 2 : 3;
  else {
    if (peopleCount >= 2) score += 1;
    if (entityCount >= 1) score += 1;
  }
  if (regulated && peopleCount === 0) score -= 1;
  if (partnerships > 0 && peopleCount === 0) score -= 1;
  return Math.max(1, Math.min(10, score));
}
