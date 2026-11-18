/**
 * List prices used to estimate API cost per call (USD per million tokens).
 * Estimates only: negotiated rates, batch discounts and regional pricing are
 * ignored, and an unknown model reports no cost at all rather than a guess.
 */

interface Price {
  input: number;
  output: number;
  /** Cache-read price as a fraction of the input price. */
  cacheRead: number;
  /** Prompts above `threshold` input tokens bill at these rates instead. */
  longPrompt?: { threshold: number; input: number; output: number };
}

const ANTHROPIC_PRICES: Record<string, Price> = {
  "claude-fable-5-2": { input: 8, output: 40, cacheRead: 0.025 },
  "claude-fable-5-1": { input: 10, output: 50, cacheRead: 0.025 },
  "claude-fable-5": { input: 10, output: 50, cacheRead: 0.1 },
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.05 },
  "claude-opus-5": { input: 5, output: 25, cacheRead: 0.1 },
  "claude-opus-4-8": { input: 5, output: 25, cacheRead: 0.1 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.05 },
  "claude-sonnet-5": { input: 2, output: 10, cacheRead: 0.1 },
  "claude-haiku-5-5": {
    input: 0.1,
    output: 0.5,
    cacheRead: 0.1,
    longPrompt: { threshold: 100_000, input: 0.5, output: 2.5 },
  },
};

/** Five-minute cache writes cost 1.25x the input price. */
const CACHE_WRITE_MULTIPLIER = 1.25;

/** Anthropic web search: $10 per 1,000 searches. Web fetch has no per-call fee. */
const ANTHROPIC_SEARCH_USD = 0.01;

export interface AnthropicTokenCounts {
  /** Uncached input tokens. */
  input: number;
  cacheWrite: number;
  cacheRead: number;
  output: number;
  searches: number;
}

function priceFor(model: string): Price | undefined {
  const key = Object.keys(ANTHROPIC_PRICES)
    .sort((a, b) => b.length - a.length)
    .find((id) => model === id || model.startsWith(`${id}-`));
  return key ? ANTHROPIC_PRICES[key] : undefined;
}

/** Estimated cost of one API response, or null for a model without a known price. */
export function anthropicCost(model: string, tokens: AnthropicTokenCounts): number | null {
  const price = priceFor(model);
  if (!price) return null;
  const promptTokens = tokens.input + tokens.cacheWrite + tokens.cacheRead;
  const long = price.longPrompt && promptTokens > price.longPrompt.threshold ? price.longPrompt : null;
  const inputRate = long?.input ?? price.input;
  const outputRate = long?.output ?? price.output;
  const usd =
    (tokens.input * inputRate +
      tokens.cacheWrite * inputRate * CACHE_WRITE_MULTIPLIER +
      tokens.cacheRead * inputRate * price.cacheRead +
      tokens.output * outputRate) /
      1_000_000 +
    tokens.searches * ANTHROPIC_SEARCH_USD;
  return Math.round(usd * 10_000) / 10_000;
}

/** Curated choices, shown first and used when the live model list cannot load. */
export const ANTHROPIC_MODEL_CHOICES = [
  { id: "claude-opus-5-5", label: "Claude Opus 5.5 (recommended)" },
  { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5 (lower cost)" },
  { id: "claude-fable-5-2", label: "Claude Fable 5.2 (most capable, higher cost)" },
  { id: "claude-haiku-5-5", label: "Claude Haiku 5.5 (fastest, lowest cost)" },
];
