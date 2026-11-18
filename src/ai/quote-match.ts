/**
 * Checks whether a quote an AI researcher attributed to a page actually
 * appears on that page. Matching ignores case, whitespace, typographic quote
 * and dash variants, and punctuation; a quote that only mostly matches
 * (paraphrased, elided or reflowed) counts as partial.
 */

export type QuoteMatch = "verified" | "partial" | "not_found";

export function normalizeForMatch(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/[‘’‚‛′`]/g, "'")
    .replace(/[“”„‟″]/g, '"')
    .replace(/[‐-―−]/g, "-")
    .replace(/ /g, " ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function words(text: string): string[] {
  return normalizeForMatch(text)
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function containsWords(haystack: string, needle: string[]): boolean {
  return needle.length > 0 && haystack.includes(` ${needle.join(" ")} `);
}

/** Share of the quote's word n-grams that occur on the page. */
function shingleOverlap(quote: string[], page: string[], n: number): number {
  if (quote.length < n) return 0;
  const pageShingles = new Set<string>();
  for (let i = 0; i + n <= page.length; i++) pageShingles.add(page.slice(i, i + n).join(" "));
  let hits = 0;
  let total = 0;
  for (let i = 0; i + n <= quote.length; i++) {
    total += 1;
    if (pageShingles.has(quote.slice(i, i + n).join(" "))) hits += 1;
  }
  return total === 0 ? 0 : hits / total;
}

export function matchQuote(quote: string, pageText: string): QuoteMatch {
  const q = normalizeForMatch(quote);
  if (!q) return "not_found";
  if (normalizeForMatch(pageText).includes(q)) return "verified";

  const pageWords = words(pageText);
  const joined = ` ${pageWords.join(" ")} `;
  const quoteWords = words(quote);
  if (quoteWords.length === 0) return "not_found";
  if (containsWords(joined, quoteWords)) return "verified";

  // Quotes elided with "..." match when every substantial piece is on the page.
  const pieces = quote
    .split(/\.{3}|…|\[\.\.\.\]/)
    .map(words)
    .filter((piece) => piece.length >= 3);
  if (pieces.length > 1 && pieces.every((piece) => containsWords(joined, piece))) return "partial";

  if (quoteWords.length < 5) return "not_found";
  const n = quoteWords.length >= 10 ? 4 : 3;
  return shingleOverlap(quoteWords, pageWords, n) >= 0.6 ? "partial" : "not_found";
}
