import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { fail, parseBody } from "@/lib/api";
import { ACCESS_COOKIE } from "@/lib/access";

const unlockSchema = z.object({ token: z.string().min(1).max(512) });

const WINDOW_MS = 10 * 60_000;
const MAX_ATTEMPTS = 10;
const MAX_TRACKED = 1000;
const attempts = new Map<string, { count: number; resetAt: number }>();

function clientKey(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
}

function rateLimited(key: string): boolean {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || entry.resetAt <= now) {
    if (attempts.size >= MAX_TRACKED) {
      for (const [k, v] of attempts) if (v.resetAt <= now) attempts.delete(k);
    }
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > MAX_ATTEMPTS;
}

function matches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

function isHttps(req: Request): boolean {
  const forwarded = req.headers.get("x-forwarded-proto");
  return forwarded ? forwarded.split(",")[0]?.trim() === "https" : new URL(req.url).protocol === "https:";
}

/** Exchange the access token for a cookie (self-hosted web mode, APP_ACCESS_TOKEN set). */
export async function POST(req: Request) {
  const expected = process.env.APP_ACCESS_TOKEN;
  if (!expected) return fail("This installation has no access token.", 404);
  if (rateLimited(clientKey(req))) return fail("Too many attempts. Wait ten minutes and try again.", 429);

  const parsed = await parseBody(req, unlockSchema);
  if ("error" in parsed) return parsed.error;
  if (!matches(parsed.data.token, expected)) return fail("That access token is not correct.", 401);

  const res = NextResponse.json({ ok: true });
  res.cookies.set(ACCESS_COOKIE, expected, {
    httpOnly: true,
    sameSite: "strict",
    secure: isHttps(req),
    path: "/",
    maxAge: 30 * 24 * 60 * 60,
  });
  return res;
}
