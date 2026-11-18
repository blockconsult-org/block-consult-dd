import * as React from "react";
import { cn } from "@/lib/utils";

const SEVERITY_STYLES: Record<string, string> = {
  critical: "bg-danger-solid text-white",
  high: "border-danger/25 bg-danger/10 text-danger",
  medium: "border-warning/25 bg-warning/10 text-warning",
  low: "border-line bg-elevated text-muted",
  informational: "border-info/25 bg-info/10 text-info",
  unresolved: "border-warning/25 bg-warning/10 text-warning",
};

const REC_STYLES: Record<string, string> = {
  invest: "border-success/25 bg-success/10 text-success",
  strict_conditions: "border-warning/25 bg-warning/10 text-warning",
  wait_monitor: "border-warning/25 bg-warning/10 text-warning",
  reject: "border-danger/25 bg-danger/10 text-danger",
  reject_likely_scam: "bg-danger-solid text-white",
};

export function Badge({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex max-w-full items-center rounded-md border border-transparent px-2 py-0.5 text-xs font-medium leading-5", className)}>{children}</span>
  );
}

/** Compact metadata label shared across the workspace. */
export function Tag({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex max-w-full items-center rounded-md border border-line bg-elevated/40 px-2 py-0.5 font-mono text-[11px] leading-5 text-muted", className)}>
      {children}
    </span>
  );
}

export function SeverityBadge({ severity }: { severity: string }) {
  return <Badge className={SEVERITY_STYLES[severity] ?? SEVERITY_STYLES.low}>{severity}</Badge>;
}

export function RecommendationBadge({ rec, label }: { rec: string; label: string }) {
  return <Badge className={cn("px-2.5 py-1 text-xs", REC_STYLES[rec] ?? REC_STYLES.wait_monitor)}>{label}</Badge>;
}
