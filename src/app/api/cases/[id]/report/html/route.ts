import { buildReportModel } from "@/report/build";
import { renderReportHtml } from "@/report/render-html";
import { failPage } from "@/lib/api";

type Params = { params: Promise<{ id: string }> };

/** Live HTML preview — rebuilt from current data so it reflects scorecard edits. */
export async function GET(req: Request, { params }: Params) {
  const { id } = await params;
  const ensureRun = new URL(req.url).searchParams.get("run") === "1";
  try {
    const { model, branding } = await buildReportModel(id, { ensureRun });
    const html = await renderReportHtml(model, branding);
    return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
  } catch (err) {
    return failPage(req, "The report preview could not be created", `Could not render report: ${err instanceof Error ? err.message : String(err)}`, 500);
  }
}
