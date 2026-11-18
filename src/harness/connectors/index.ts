/**
 * Connector factory. Defaults to safe "manual" providers (no network, no
 * fabricated data). When the relevant API key is configured a live provider is
 * used instead. Live calls are timeout-bounded and fail closed to manual.
 */
import { env } from "@/lib/env";
import type {
  Connectors,
  MarketDataConnector,
  MarketDataResult,
  OnChainConnector,
  OnChainResult,
  WebSearchConnector,
  WebSearchResult,
} from "./types";

function nowIso(): string {
  return new Date().toISOString();
}

async function fetchJson(url: string, init?: RequestInit): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), env.connectorTimeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as unknown;
  } finally {
    clearTimeout(timer);
  }
}

// ---- Manual providers (default) -------------------------------------------

const manualWeb: WebSearchConnector = {
  provider: "manual",
  async search(query: string): Promise<WebSearchResult> {
    return {
      provider: "manual",
      retrievedAt: nowIso(),
      ok: false,
      note: "Manual mode: no web-search API key configured. Add sources by hand.",
      query,
      hits: [],
    };
  },
};

const manualMarket: MarketDataConnector = {
  provider: "manual",
  async lookup(symbol: string): Promise<MarketDataResult> {
    return {
      provider: "manual",
      retrievedAt: nowIso(),
      ok: false,
      note: "Manual mode: no market-data API key configured. Enter market data by hand.",
      symbol,
    };
  },
};

const manualOnchain: OnChainConnector = {
  provider: "manual",
  async inspect(chain: string, address: string): Promise<OnChainResult> {
    return {
      provider: "manual",
      retrievedAt: nowIso(),
      ok: false,
      note: "Manual mode: no explorer API key configured. Enter on-chain data by hand.",
      chain,
      address,
    };
  },
};

// ---- Live providers (used only when a key is present) ---------------------

const coingeckoMarket: MarketDataConnector = {
  provider: "coingecko",
  async lookup(symbol: string): Promise<MarketDataResult> {
    try {
      const base = "https://api.coingecko.com/api/v3";
      const headers = env.keys.coingecko
        ? { "x-cg-demo-api-key": env.keys.coingecko }
        : undefined;
      const search = (await fetchJson(`${base}/search?query=${encodeURIComponent(symbol)}`, { headers })) as {
        coins?: { id: string }[];
      };
      const id = search.coins?.[0]?.id;
      if (!id) {
        return { provider: "coingecko", retrievedAt: nowIso(), ok: false, note: "No CoinGecko match", symbol };
      }
      const data = (await fetchJson(
        `${base}/coins/${id}?localization=false&tickers=true&market_data=true&community_data=false&developer_data=false`,
        { headers },
      )) as {
        market_data?: {
          current_price?: { usd?: number };
          market_cap?: { usd?: number };
          fully_diluted_valuation?: { usd?: number };
          total_volume?: { usd?: number };
          circulating_supply?: number;
          total_supply?: number;
          max_supply?: number;
        };
        tickers?: { market?: { name?: string }; base?: string; target?: string; volume?: number }[];
      };
      const md = data.market_data;
      return {
        provider: "coingecko",
        retrievedAt: nowIso(),
        ok: true,
        symbol,
        price: md?.current_price?.usd,
        marketCap: md?.market_cap?.usd,
        fdv: md?.fully_diluted_valuation?.usd,
        volume24h: md?.total_volume?.usd,
        circulatingSupply: md?.circulating_supply,
        totalSupply: md?.total_supply ?? undefined,
        maxSupply: md?.max_supply ?? undefined,
        venues: (data.tickers ?? []).slice(0, 12).map((t) => ({
          exchange: t.market?.name ?? "unknown",
          pair: `${t.base ?? ""}/${t.target ?? ""}`,
          volume24h: t.volume,
        })),
      };
    } catch (err) {
      return {
        provider: "coingecko",
        retrievedAt: nowIso(),
        ok: false,
        note: `CoinGecko error: ${(err as Error).message}`,
        symbol,
      };
    }
  },
};

const tavilyWeb: WebSearchConnector = {
  provider: "tavily",
  async search(query: string): Promise<WebSearchResult> {
    try {
      const data = (await fetchJson("https://api.tavily.com/search", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ api_key: env.keys.tavily, query, max_results: 8 }),
      })) as { results?: { title?: string; url?: string; content?: string }[] };
      return {
        provider: "tavily",
        retrievedAt: nowIso(),
        ok: true,
        query,
        hits: (data.results ?? []).map((r) => ({
          title: r.title ?? "",
          url: r.url ?? "",
          snippet: r.content ?? "",
        })),
      };
    } catch (err) {
      return { provider: "tavily", retrievedAt: nowIso(), ok: false, note: (err as Error).message, query, hits: [] };
    }
  },
};

const etherscanOnchain: OnChainConnector = {
  provider: "etherscan",
  async inspect(chain: string, address: string): Promise<OnChainResult> {
    try {
      const data = (await fetchJson(
        `https://api.etherscan.io/api?module=contract&action=getsourcecode&address=${address}&apikey=${env.keys.etherscan}`,
      )) as { result?: { ABI?: string; Proxy?: string; Implementation?: string }[] };
      const r = data.result?.[0];
      const verified = Boolean(r && r.ABI && r.ABI !== "Contract source code not verified");
      return {
        provider: "etherscan",
        retrievedAt: nowIso(),
        ok: true,
        chain,
        address,
        verified,
        proxy: r?.Proxy === "1",
      };
    } catch (err) {
      return { provider: "etherscan", retrievedAt: nowIso(), ok: false, note: (err as Error).message, chain, address };
    }
  },
};

export function getConnectors(): Connectors {
  return {
    web: env.keys.tavily ? tavilyWeb : manualWeb,
    // CoinGecko has a keyless public tier, but we keep it opt-in via key to stay
    // deterministic/offline-safe by default for local MVP runs.
    market: env.keys.coingecko ? coingeckoMarket : manualMarket,
    onchain: env.keys.etherscan ? etherscanOnchain : manualOnchain,
  };
}
