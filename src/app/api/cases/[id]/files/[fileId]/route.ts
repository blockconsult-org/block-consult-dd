import { prisma } from "@/lib/db";
import { fail } from "@/lib/api";
import { readArtifact } from "@/lib/storage";

type Params = { params: Promise<{ id: string; fileId: string }> };

export async function GET(req: Request, { params }: Params) {
  const { fileId } = await params;
  const file = await prisma.generatedFile.findUnique({ where: { id: fileId } });
  if (!file) return fail("File not found", 404);
  try {
    const data = await readArtifact(file.path);
    const download = new URL(req.url).searchParams.get("download") === "1";
    return new Response(new Uint8Array(data), {
      headers: {
        "content-type": file.mimeType,
        "content-disposition": `${download ? "attachment" : "inline"}; filename="${file.filename}"`,
      },
    });
  } catch (err) {
    return fail(`Could not read file: ${(err as Error).message}`, 500);
  }
}
