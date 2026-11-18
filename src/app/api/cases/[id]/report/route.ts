import { ok, fail } from "@/lib/api";
import { generateReport } from "@/report/service";

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: Request, { params }: Params) {
  const { id } = await params;
  try {
    const result = await generateReport(id);
    return ok(
      {
        reportId: result.reportId,
        files: result.files,
        recommendation: result.model.meta.recommendationLabel,
        overallScore: result.model.meta.overallScore,
        qa: {
          autoPass: result.model.qa.autoPass,
          autoFail: result.model.qa.autoFail,
          manual: result.model.qa.manual,
          blocking: result.model.qa.blocking,
        },
      },
      201,
    );
  } catch (err) {
    return fail(`Could not generate report: ${(err as Error).message}`, 500);
  }
}
