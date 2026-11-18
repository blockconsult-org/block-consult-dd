import { fmtUsd } from "@/lib/utils";
import type { AllocationCategory } from "@/domain/enums";
import type { Worker, TokenWithChildren } from "../types";
import { emptyResult } from "../types";

const INSIDER_CATEGORIES: AllocationCategory[] = ["team", "founders", "advisors", "private_investors"];

/**
 * Tokenomics Worker — supply snapshot, allocation table, unlock schedule,
 * insider/treasury/MM concentration, value-capture assessment, dilution and
 * holder-concentration risk. Flags missing allocation/unlock data as gating.
 */
export const tokenomicsWorker: Worker = {
  name: "tokenomics",
  run(ctx) {
    const out = emptyResult();
    const token = ctx.snapshot.tokens[0] as TokenWithChildren | undefined;

    if (!token) {
      out.status = "partial";
      out.confidence = "low";
      out.gating.tokenomicsUnlocksMissing = true;
      out.findings.push({
        category: "tokenomics",
        title: "No tokenomics data — allocation and unlock schedule missing",
        analysis:
          "No token record, allocation table or unlock schedule has been provided. Tokenomics cannot be assessed; per policy this gates the recommendation to Wait / monitor until the data is supplied.",
        severity: "high",
        confidence: "high",
        openQuestions: [
          "Please provide the full allocation table.",
          "Please provide the full vesting/unlock schedule.",
          "What percentage is unlocked today and what unlocks in the next 3/6/12/24 months?",
        ],
      });
      out.moduleOutput = { hasData: false };
      out.suggestedScores = { tokenValueCapture: 3 };
      return out;
    }

    const allocations = token.allocations;
    const unlocks = token.unlocks;
    const supply = {
      price: token.price,
      marketCap: token.marketCap,
      fdv: token.fdv,
      circulatingSupply: token.circulatingSupply,
      totalSupply: token.totalSupply,
      maxSupply: token.maxSupply,
    };

    const insiderPct = sumPct(allocations, (a) => INSIDER_CATEGORIES.includes(a.category as AllocationCategory));
    const treasuryPct = sumPct(allocations, (a) => a.category === "treasury" || a.category === "foundation");
    const mmPct = sumPct(allocations, (a) => a.category === "market_makers");
    const communityPct = sumPct(allocations, (a) => a.category === "community" || a.category === "public_sale");

    // Missing-data gating.
    if (allocations.length === 0 || unlocks.length === 0) {
      out.gating.tokenomicsUnlocksMissing = true;
      out.findings.push({
        category: "tokenomics",
        title: allocations.length === 0 ? "Allocation table missing" : "Unlock schedule missing",
        analysis: "Required tokenomics data is incomplete. Missing allocation/unlock data is treated as a material risk and gates the recommendation.",
        severity: "high",
        confidence: "high",
        openQuestions: ["Provide the full allocation table and vesting/unlock schedule."],
      });
    }

    // Concentration finding.
    if (insiderPct != null && insiderPct > 40) {
      out.findings.push({
        category: "tokenomics",
        title: `High insider allocation (${insiderPct.toFixed(0)}%)`,
        analysis: `Team/founders/advisors/private investors hold ~${insiderPct.toFixed(0)}% of supply. Combined with unlocks this creates sustained sell pressure relative to float.`,
        severity: "medium",
        confidence: "medium",
      });
    }

    // Unlock pressure ratio vs ~90d real volume proxy.
    const vol = ctx.snapshot.markets.reduce((s, m) => s + (m.volume24h ?? 0), 0);
    const vol90d = vol ? vol * 90 : undefined;
    const next90 = unlocks
      .filter((u) => withinDays(u.date, 90))
      .reduce((s, u) => s + (u.amountTokens ?? 0) * (token.price ?? 0), 0);
    let unlockPressureRatio: number | null = null;
    if (vol90d && next90 > 0) {
      unlockPressureRatio = round2(next90 / vol90d);
      if (unlockPressureRatio > 1.0) {
        out.findings.push({
          category: "tokenomics",
          title: `High unlock pressure (ratio ${unlockPressureRatio})`,
          analysis: `Next-90-day unlocks (~${fmtUsd(next90)}) exceed estimated 90-day real volume — significant overhang.`,
          severity: unlockPressureRatio > 3 ? "high" : "medium",
          confidence: "low",
        });
      }
    }

    // Value capture assessment from token.valueCapture / rights disclaimer.
    const valueCapture = parseList(token.valueCapture);
    const utility = parseList(token.utility);
    const valueCaptureScore = scoreValueCapture(valueCapture, utility, Boolean(token.rightsDisclaimer));

    const verdict =
      out.gating.tokenomicsUnlocksMissing
        ? "Incomplete — key tokenomics data missing"
        : valueCaptureScore >= 7
          ? "Credible value capture with manageable dilution"
          : valueCaptureScore >= 5
            ? "Mixed — value capture partly indirect"
            : "Weak — value capture largely narrative/indirect";

    out.moduleOutput = {
      hasData: true,
      verdict,
      supply,
      allocations: allocations.map((a) => ({
        category: a.category,
        amountTokens: a.amountTokens,
        percentageTotal: a.percentageTotal,
        vesting: a.vestingTerms ?? "—",
        confidence: a.confidence,
      })),
      unlocks: unlocks.map((u) => ({
        date: u.date ?? "—",
        amountTokens: u.amountTokens,
        percentageSupply: u.percentageSupply,
        category: u.category ?? "—",
        cliff: u.cliff,
        linear: u.linear,
      })),
      concentration: { insiderPct, treasuryPct, mmPct, communityPct },
      unlockPressureRatio,
      valueCapture,
      utility,
      rightsDisclaimer: token.rightsDisclaimer ?? null,
    };
    out.suggestedScores = { tokenValueCapture: valueCaptureScore, transparencyDisclosure: scoreTransparency(allocations.length, unlocks.length) };
    out.confidence = allocations.length && unlocks.length ? "medium" : "low";
    return out;
  },
};

function sumPct(allocs: { category: string; percentageTotal: number | null }[], pred: (a: { category: string }) => boolean): number | null {
  const rel = allocs.filter(pred);
  if (rel.length === 0) return null;
  return rel.reduce((s, a) => s + (a.percentageTotal ?? 0), 0);
}

function scoreValueCapture(valueCapture: string[], utility: string[], hasDisclaimer: boolean): number {
  let score = 4;
  const text = [...valueCapture, ...utility].join(" ").toLowerCase();
  if (/fee|gas|collateral|stake|buyback|burn/.test(text)) score += 2;
  if (/revenue|profit|dividend/.test(text)) score += 1;
  if (utility.length > 0) score += 1;
  if (hasDisclaimer) score -= 1;
  if (valueCapture.length === 0 && utility.length === 0) score = 3;
  return Math.max(1, Math.min(10, score));
}

function scoreTransparency(allocCount: number, unlockCount: number): number {
  let score = 4;
  if (allocCount > 0) score += 2;
  if (unlockCount > 0) score += 2;
  return Math.max(1, Math.min(10, score));
}

function parseList(json: string): string[] {
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

function withinDays(date: string | null, days: number): boolean {
  if (!date) return false;
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return false;
  const diff = (d.getTime() - Date.now()) / 86_400_000;
  return diff >= 0 && diff <= days;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
