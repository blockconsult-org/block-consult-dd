/**
 * Fetch a public web page for source verification. Server-only.
 *
 * The URLs come from AI output, so the fetcher refuses anything that is not
 * a public internet address: loopback, private ranges, link-local (cloud
 * metadata), carrier-grade NAT, multicast and reserved space are blocked for
 * IPv4 and IPv6. The check runs inside the socket's DNS lookup, so a host
 * cannot pass the check and then resolve somewhere else (DNS rebinding).
 * Redirects are followed by hand, each hop checked the same way.
 */
import dns, { type LookupAddress } from "node:dns";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import zlib from "node:zlib";

const MAX_REDIRECTS = 5;
const MAX_BYTES = 6 * 1024 * 1024;
const TIMEOUT_MS = 20_000;
const USER_AGENT = "Mozilla/5.0 (compatible; BlockConsultDD/1.0; source verification)";

export class BlockedAddressError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BlockedAddressError";
  }
}

const blockList = new net.BlockList();
for (const [address, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  blockList.addSubnet(address, prefix, "ipv4");
}
for (const [address, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["64:ff9b::", 96],
  ["64:ff9b:1::", 48],
  ["100::", 64],
  ["2001::", 23],
  ["2001:db8::", 32],
  ["2002::", 16],
  ["fc00::", 7],
  ["fe80::", 10],
  ["fec0::", 10],
  ["ff00::", 8],
] as const) {
  blockList.addSubnet(address, prefix, "ipv6");
}

/** True for any address that is not a routable public address. */
export function isBlockedAddress(address: string): boolean {
  const family = net.isIP(address);
  if (family === 4) return blockList.check(address, "ipv4");
  if (family === 6) {
    const mapped = address.toLowerCase().match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped?.[1]) return blockList.check(mapped[1], "ipv4");
    // IPv4-mapped in hex form, e.g. ::ffff:7f00:1
    const hexMapped = address.toLowerCase().match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
    if (hexMapped?.[1] && hexMapped[2]) {
      const hi = parseInt(hexMapped[1], 16);
      const lo = parseInt(hexMapped[2], 16);
      return blockList.check(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`, "ipv4");
    }
    return blockList.check(address, "ipv6");
  }
  return true;
}

type LookupCallback = (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void;

function safeLookup(hostname: string, options: dns.LookupOptions, callback: LookupCallback): void {
  dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) {
      callback(err, "");
      return;
    }
    const list = addresses as LookupAddress[];
    const blocked = list.find((entry) => isBlockedAddress(entry.address));
    if (list.length === 0 || blocked) {
      callback(new BlockedAddressError(`${hostname} resolves to a non-public address`), "");
      return;
    }
    if (options.all) {
      callback(null, list);
      return;
    }
    const first = list[0];
    if (!first) {
      callback(new BlockedAddressError(`${hostname} did not resolve`), "");
      return;
    }
    callback(null, first.address, first.family);
  });
}

export interface FetchedPage {
  url: string;
  finalUrl: string;
  status: number;
  contentType: string;
  body: Buffer;
}

function decompress(body: Buffer, encoding: string | undefined): Buffer {
  const enc = (encoding ?? "").toLowerCase().trim();
  const opts = { maxOutputLength: MAX_BYTES };
  if (enc === "gzip" || enc === "x-gzip") return zlib.gunzipSync(body, opts);
  if (enc === "deflate") return zlib.inflateSync(body, opts);
  if (enc === "br") return zlib.brotliDecompressSync(body, opts);
  return body;
}

function requestOnce(target: URL, signal?: AbortSignal): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: Buffer }> {
  return new Promise((resolve, reject) => {
    const client = target.protocol === "https:" ? https : http;
    const req = client.request(
      target,
      {
        method: "GET",
        lookup: safeLookup,
        timeout: TIMEOUT_MS,
        signal,
        headers: {
          "user-agent": USER_AGENT,
          accept: "text/html,application/xhtml+xml,text/plain;q=0.9,application/pdf;q=0.8,*/*;q=0.5",
          "accept-encoding": "gzip, deflate, br",
          "accept-language": "en;q=1.0, *;q=0.5",
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > MAX_BYTES) {
            req.destroy(new Error("page is larger than the 6 MB limit"));
            return;
          }
          chunks.push(chunk);
        });
        res.on("end", () => {
          try {
            const raw = Buffer.concat(chunks);
            const encoding = Array.isArray(res.headers["content-encoding"]) ? res.headers["content-encoding"][0] : res.headers["content-encoding"];
            resolve({ status: res.statusCode ?? 0, headers: res.headers, body: decompress(raw, encoding) });
          } catch (err) {
            reject(err);
          }
        });
        res.on("error", reject);
      },
    );
    req.on("timeout", () => req.destroy(new Error("the page did not respond within 20 seconds")));
    req.on("error", reject);
    req.end();
  });
}

/** Fetch a public http(s) URL, following up to five redirects. Throws BlockedAddressError for non-public targets. */
export async function safeFetch(rawUrl: string, signal?: AbortSignal): Promise<FetchedPage> {
  let current: URL;
  try {
    current = new URL(rawUrl);
  } catch {
    throw new BlockedAddressError("not a valid URL");
  }
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (current.protocol !== "http:" && current.protocol !== "https:") throw new BlockedAddressError(`${current.protocol} URLs are not fetched`);
    if (current.username || current.password) throw new BlockedAddressError("URLs with credentials are not fetched");
    const host = current.hostname.replace(/^\[|\]$/g, "");
    if (net.isIP(host) && isBlockedAddress(host)) throw new BlockedAddressError(`${host} is not a public address`);
    if (/^localhost$|\.localhost$|\.local$|\.internal$/i.test(host)) throw new BlockedAddressError(`${host} is a local name`);

    const res = await requestOnce(current, signal);
    const location = res.headers.location;
    if (res.status >= 300 && res.status < 400 && location) {
      current = new URL(location, current);
      continue;
    }
    const contentType = String(res.headers["content-type"] ?? "").toLowerCase();
    return { url: rawUrl, finalUrl: current.toString(), status: res.status, contentType, body: res.body };
  }
  throw new Error("too many redirects");
}

// ---------------------------------------------------------------------------
// HTML to text
// ---------------------------------------------------------------------------

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
  hellip: "…",
  copy: "©",
  reg: "®",
  trade: "™",
  euro: "€",
  pound: "£",
  middot: "·",
  bull: "•",
};

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code: string) => {
    if (code[0] === "#") {
      const n = code[1] === "x" || code[1] === "X" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : match;
    }
    return NAMED_ENTITIES[code.toLowerCase()] ?? match;
  });
}

const BLOCK_TAGS = /<\/?(p|div|br|li|ul|ol|h[1-6]|tr|td|th|table|section|article|header|footer|main|aside|nav|blockquote|pre|dd|dt|figcaption|hr)\b[^>]*>/gi;

export function htmlToText(html: string): { title: string; text: string } {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch?.[1] ? decodeEntities(titleMatch[1]).replace(/\s+/g, " ").trim() : "";
  const text = decodeEntities(
    html
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<(script|style|noscript|template|svg|iframe|head)\b[\s\S]*?<\/\1>/gi, " ")
      .replace(BLOCK_TAGS, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
  return { title, text };
}

/** Readable text from a fetched page, or null for content we cannot read (PDF, images, binaries). */
export function pageText(page: FetchedPage): { title: string; text: string } | null {
  const type = page.contentType;
  const charset = type.match(/charset=([^;]+)/)?.[1]?.trim() ?? "utf-8";
  let decoded: string;
  try {
    decoded = new TextDecoder(charset, { fatal: false }).decode(page.body);
  } catch {
    decoded = new TextDecoder("utf-8").decode(page.body);
  }
  if (type.includes("html") || type.includes("xml") || (!type && /<html|<body/i.test(decoded.slice(0, 2000)))) return htmlToText(decoded);
  if (type.startsWith("text/") || type.includes("json")) return { title: "", text: decoded };
  return null;
}
