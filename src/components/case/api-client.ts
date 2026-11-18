/** Thin client-side fetch helpers used by the case workspace tabs. */

async function handle(res: Response): Promise<unknown> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (body as { error?: string }).error ?? `HTTP ${res.status}`;
    const details = (body as { details?: unknown }).details;
    throw new Error(details ? `${msg}: ${JSON.stringify(details)}` : msg);
  }
  return body;
}

export function apiPost(url: string, body: unknown): Promise<unknown> {
  return fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then(handle);
}

export function apiPut(url: string, body: unknown): Promise<unknown> {
  return fetch(url, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then(handle);
}

export function apiPatch(url: string, body: unknown): Promise<unknown> {
  return fetch(url, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then(handle);
}

export function apiDelete(url: string): Promise<unknown> {
  return fetch(url, { method: "DELETE" }).then(handle);
}
