import { prisma } from "@/lib/db";
import { getAiSettings } from "@/ai/settings";
import { CaseDashboard } from "@/components/dashboard/case-dashboard";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [cases, aiSettings] = await Promise.all([
    prisma.dDCase.findMany({
      orderBy: { updatedAt: "desc" },
      include: { scorecard: true, _count: { select: { sources: true, redFlags: true, reports: true } } },
    }),
    getAiSettings(),
  ]);
  return <CaseDashboard aiConfigured={aiSettings.activeProvider !== null} cases={cases.map((item) => ({
    id: item.id, projectName: item.projectName, clientName: item.clientName, analyst: item.analyst,
    status: item.status, reportType: item.reportType, updatedAt: item.updatedAt.toISOString(),
    recommendation: item.scorecard?.recommendation ?? null, overallScore: item.scorecard?.overallScore ?? null,
    sources: item._count.sources, flags: item._count.redFlags, reports: item._count.reports,
  }))} />;
}
