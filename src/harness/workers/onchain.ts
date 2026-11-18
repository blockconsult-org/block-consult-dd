import { parseStringArray } from "@/domain/json";
import type { Worker } from "../types";
import { emptyResult } from "../types";

/**
 * On-Chain / Smart-Contract Worker — builds the contract + admin-permission
 * tables and flags admin-key risk (mint/pause/freeze/upgrade without multisig or
 * timelock, unverified source, or single-EOA control).
 */
export const onchainWorker: Worker = {
  name: "onchain",
  async run(ctx) {
    const out = emptyResult();
    const { contracts, holderSnaps, intake } = ctx.snapshot;

    // Optionally enrich the first contract via the explorer connector.
    const first = contracts[0];
    if (first) {
      const res = await ctx.connectors.onchain.inspect(first.chain, first.address);
      ctx.log(`onchain connector=${res.provider} ok=${res.ok}${res.note ? ` (${res.note})` : ""}`);
    }

    const contractRows = contracts.map((c) => {
      const powers: string[] = [];
      if (c.canMint) powers.push("mint");
      if (c.canBurn) powers.push("burn");
      if (c.canPause) powers.push("pause");
      if (c.canFreeze) powers.push("freeze");
      if (c.canBlacklist) powers.push("blacklist");
      if (c.canUpgrade) powers.push("upgrade");
      const controls: string[] = [];
      if (c.multisig) controls.push("multisig");
      if (c.timelock) controls.push("timelock");
      return {
        name: c.name ?? "—",
        chain: c.chain,
        address: c.address,
        verified: c.verified,
        proxy: c.proxy,
        owner: c.ownerAddress ?? "—",
        powers,
        controls,
        audits: parseStringArray(c.auditReports),
        adminNotes: adminNote(c.verified, powers, controls),
      };
    });

    let criticalAdminRisk = false;
    for (const c of contractRows) {
      const dangerous = c.powers.some((p) => ["mint", "pause", "freeze", "upgrade", "blacklist"].includes(p));
      if (dangerous && c.controls.length === 0) {
        criticalAdminRisk = true;
        out.redFlags.push({
          code: "FRAUD_ADMIN_KEY_HIDDEN",
          title: `Admin-key risk on ${c.name} (${c.chain})`,
          severity: "critical",
          evidence: `Contract exposes ${c.powers.join(", ")} with no multisig/timelock control.`,
          impact: "A single key holder can alter balances/transfers, freeze users, or mint supply.",
          mitigation: "Require multisig + timelock, or independent confirmation these powers are renounced.",
          triggered: true,
        });
      }
      if (!c.verified) {
        out.findings.push({
          category: "technical",
          title: `Unverified contract source: ${c.name}`,
          analysis: "Deployed bytecode source is not verified, so behaviour cannot be independently reviewed.",
          severity: "high",
          confidence: "medium",
        });
      }
      if (c.audits.length === 0) {
        out.findings.push({
          category: "technical",
          title: `No audit on file for ${c.name}`,
          analysis: "No audit report has been collected. Treat the contract as unaudited until reports are provided and matched to deployed code.",
          severity: "medium",
          confidence: "medium",
        });
      }
    }

    if (criticalAdminRisk) out.gating.criticalAdminUndisclosed = true;

    if (contracts.length === 0 && (intake.contractAddresses.length > 0 || intake.offerType === "public_token")) {
      out.status = "partial";
      out.findings.push({
        category: "technical",
        title: "Contract admin powers not yet reviewed",
        analysis: "No on-chain contract analysis has been entered. Mint/pause/freeze/blacklist/upgrade powers and ownership are undisclosed pending review.",
        severity: "medium",
        confidence: "high",
        openQuestions: ["Are contracts verified, audited and upgradeable?", "Who controls admin keys; is there a multisig/timelock?"],
      });
    }

    const topHolder = holderSnaps[0];
    if (topHolder && (topHolder.top10Pct ?? 0) > 50) {
      out.findings.push({
        category: "technical",
        title: "High holder concentration",
        analysis: `Top 10 holders control ${topHolder.top10Pct}% (excluding labelled exchange/contract wallets where known). Concentration enables coordinated selling.`,
        severity: "medium",
        confidence: "medium",
      });
    }

    out.moduleOutput = {
      contracts: contractRows,
      holders: holderSnaps.map((h) => ({ takenAt: h.takenAt, totalHolders: h.totalHolders, top10Pct: h.top10Pct, top50Pct: h.top50Pct })),
      criticalAdminRisk,
    };
    out.suggestedScores = { technicalSafety: scoreTechnical(contractRows, criticalAdminRisk) };
    out.confidence = contracts.length ? "medium" : "low";
    return out;
  },
};

function adminNote(verified: boolean, powers: string[], controls: string[]): string {
  const parts: string[] = [];
  parts.push(verified ? "verified" : "UNVERIFIED");
  if (powers.length) parts.push(`powers: ${powers.join("/")}`);
  parts.push(controls.length ? `controls: ${controls.join("+")}` : "no multisig/timelock");
  return parts.join("; ");
}

function scoreTechnical(rows: { verified: boolean; powers: string[]; controls: string[]; audits: string[] }[], critical: boolean): number {
  if (rows.length === 0) return 4;
  let score = 6;
  if (critical) score -= 3;
  if (rows.every((r) => r.verified)) score += 1;
  if (rows.some((r) => r.audits.length > 0)) score += 1;
  if (rows.some((r) => r.controls.length > 0)) score += 1;
  if (rows.some((r) => !r.verified)) score -= 1;
  return Math.max(1, Math.min(10, score));
}
