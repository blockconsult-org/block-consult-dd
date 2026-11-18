import { prisma } from "@/lib/db";
import { failPage } from "@/lib/api";
import { reportFileBase } from "@/lib/branding";
import { writeArtifact } from "@/lib/storage";
import { buildReportModel } from "@/report/build";
import { renderReportHtml } from "@/report/render-html";
import { renderReportPdf, PdfRenderError } from "@/report/pdf";
import { randomUUID } from "node:crypto";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Params) {
  const { id } = await params;
  try {
    const { model, branding } = await buildReportModel(id, { ensureRun: false });
    const html = await renderReportHtml(model, branding);
    const pdf = await renderReportPdf(html, branding);

    const base = reportFileBase(model.meta.projectName, branding.brandName, new Date());
    const filename = `${base}.pdf`;
    // This is a live export, independent of the latest saved report snapshot.
    // A unique directory also keeps repeated same-day downloads from replacing
    // bytes belonging to an earlier export.
    const saved = await writeArtifact(id, filename, pdf, `export-${randomUUID()}`);
    await prisma.generatedFile.create({
      data: { caseId: id, reportId: null, kind: "pdf", filename, path: saved.path, mimeType: "application/pdf", sizeBytes: saved.sizeBytes },
    });

    return new Response(new Uint8Array(pdf), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `inline; filename="${filename}"`,
      },
    });
  } catch (err) {
    const title = "The PDF could not be created";
    if (err instanceof PdfRenderError) return failPage(req, title, err.message, 503);
    return failPage(req, title, `Could not render PDF: ${err instanceof Error ? err.message : String(err)}`, 500);
  }
}
