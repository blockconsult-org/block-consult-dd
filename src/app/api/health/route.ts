import { prisma } from "@/lib/db";
import { getDesktopBridge } from "@/lib/desktop-bridge";

export const dynamic = "force-dynamic";

/** Liveness check used by the desktop shell after starting the server. */
export async function GET() {
  try {
    await prisma.$queryRawUnsafe("SELECT 1");
    return Response.json({ ok: true, desktop: getDesktopBridge() !== null });
  } catch (err) {
    return Response.json({ ok: false, error: (err as Error).message }, { status: 503 });
  }
}
