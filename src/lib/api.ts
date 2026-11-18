import { NextResponse } from "next/server";
import { ZodError, type ZodSchema } from "zod";
import { escapeHtml } from "./utils";

export function ok<T>(data: T, init?: number): NextResponse {
  return NextResponse.json(data, { status: init ?? 200 });
}

export function fail(message: string, status = 400, extra?: unknown): NextResponse {
  return NextResponse.json({ error: message, details: extra }, { status });
}

/**
 * Error for a route the user opens in its own window or tab (report preview,
 * PDF): a short readable page for browsers, the usual JSON for API clients.
 */
export function failPage(req: Request, title: string, message: string, status: number): Response {
  if (!req.headers.get("accept")?.includes("text/html")) return fail(message, status);
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>body{font-family:system-ui,sans-serif;line-height:1.5;max-width:40rem;margin:4rem auto;padding:0 1rem}</style>
</head>
<body>
<h1>${escapeHtml(title)}</h1>
<p>${escapeHtml(message)}</p>
<p>You can close this page and go back to the case.</p>
</body>
</html>`;
  return new Response(html, { status, headers: { "content-type": "text/html; charset=utf-8" } });
}

/** Parse + validate a JSON request body against a Zod schema. */
export async function parseBody<T>(req: Request, schema: ZodSchema<T>): Promise<{ data: T } | { error: NextResponse }> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return { error: fail("Invalid JSON body") };
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    const err = result.error as ZodError;
    return { error: fail("Validation failed", 422, err.flatten()) };
  }
  return { data: result.data };
}
