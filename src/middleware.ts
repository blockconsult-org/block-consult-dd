/**
 * Access gate.
 *
 * Desktop app: the Electron shell starts the server on 127.0.0.1 with a random
 * port and a per-launch BC_SESSION_TOKEN, and sets that token as a cookie in
 * its own window. Every request must carry the cookie and the expected Host
 * header, which keeps other local processes and DNS-rebinding pages out.
 *
 * Self-hosted web: when APP_ACCESS_TOKEN is set, visitors unlock once at
 * /unlock (cookie) or send the token in the x-bc-token header.
 *
 * Neither variable set (local `npm run dev`): open, as before.
 */
import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { ACCESS_COOKIE, SESSION_COOKIE } from "@/lib/access";

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

function deny(req: NextRequest, status: 401 | 403, message: string): NextResponse {
  if (req.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: message }, { status });
  }
  return new NextResponse(message, { status, headers: { "content-type": "text/plain; charset=utf-8" } });
}

export function middleware(req: NextRequest): NextResponse {
  const sessionToken = process.env.BC_SESSION_TOKEN;
  if (sessionToken) {
    const expectedHost = process.env.BC_EXPECTED_HOST;
    if (expectedHost && req.headers.get("host") !== expectedHost) return deny(req, 403, "Forbidden");
    const cookie = req.cookies.get(SESSION_COOKIE)?.value ?? "";
    if (!safeEqual(cookie, sessionToken)) return deny(req, 401, "This page only opens inside the Block Consult DD app.");
    return NextResponse.next();
  }

  const accessToken = process.env.APP_ACCESS_TOKEN;
  if (accessToken) {
    const path = req.nextUrl.pathname;
    if (path === "/unlock" || path === "/api/unlock") return NextResponse.next();
    const provided = req.cookies.get(ACCESS_COOKIE)?.value ?? req.headers.get("x-bc-token") ?? "";
    if (safeEqual(provided, accessToken)) return NextResponse.next();
    if (path.startsWith("/api/")) return deny(req, 401, "Access token required");
    const url = req.nextUrl.clone();
    url.pathname = "/unlock";
    url.search = `?next=${encodeURIComponent(path + req.nextUrl.search)}`;
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  runtime: "nodejs",
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico).*)"],
};
