import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ create: vi.fn(), write: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { generatedFile: { create: mocks.create } } }));
vi.mock("@/lib/storage", () => ({ writeArtifact: mocks.write }));
vi.mock("@/report/build", () => ({
  buildReportModel: vi.fn(async () => ({ model: { meta: { projectName: "Example" } }, branding: { brandName: "Block Consult" } })),
}));
vi.mock("@/report/render-html", () => ({ renderReportHtml: vi.fn(async () => "<html></html>") }));
vi.mock("@/report/pdf", () => ({
  renderReportPdf: vi.fn(async () => Buffer.from("%PDF-1.7")),
  PdfRenderError: class extends Error {},
}));

import { GET } from "./route";

describe("live PDF exports", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.write.mockImplementation(async (caseId, filename, bytes, directory) => ({
      path: `${caseId}/${directory}/${filename}`, sizeBytes: bytes.length,
    }));
  });

  it("keeps repeated exports independent of saved report snapshots and prior files", async () => {
    const request = new Request("http://localhost/api/cases/example/report/pdf");
    const params = { params: Promise.resolve({ id: "example" }) };
    const first = await GET(request, params);
    const second = await GET(request, params);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(first.headers.get("content-type")).toBe("application/pdf");
    expect(mocks.create).toHaveBeenCalledTimes(2);
    const [a, b] = mocks.create.mock.calls.map(([input]) => input.data);
    expect(a.reportId).toBeNull();
    expect(b.reportId).toBeNull();
    expect(a.path).not.toBe(b.path);
    expect(a.filename).toBe(b.filename);
    expect(a.path).toMatch(/^example\/export-[a-f0-9-]+\//);
  });
});
