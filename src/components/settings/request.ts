/** JSON fetch helper for the Settings page with readable error messages. */

function firstFieldError(details: unknown): string | null {
  if (typeof details !== "object" || details === null || !("fieldErrors" in details)) return null;
  const fieldErrors = details.fieldErrors;
  if (typeof fieldErrors !== "object" || fieldErrors === null) return null;
  for (const messages of Object.values(fieldErrors)) {
    if (Array.isArray(messages) && typeof messages[0] === "string") return messages[0];
  }
  return null;
}

export async function sendJson(method: "GET" | "POST" | "PUT" | "DELETE", url: string, body?: unknown): Promise<unknown> {
  const res = await fetch(url, {
    method,
    cache: "no-store",
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const record = typeof data === "object" && data !== null ? (data as Record<string, unknown>) : {};
    const message = firstFieldError(record.details) ?? (typeof record.error === "string" ? record.error : `Request failed (${res.status})`);
    throw new Error(message);
  }
  return data;
}

export function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
