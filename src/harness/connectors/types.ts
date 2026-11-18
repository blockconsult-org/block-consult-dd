/**
 * Connector abstractions. Each connector has a provider ("manual" | "<api>"),
 * obeys timeouts/rate limits, and returns a uniform result with provenance. When
 * API keys are absent every connector degrades to "manual" mode and returns no
 * data (the analyst enters sources by hand) — never a fabricated result.
 */

export interface ConnectorMeta {
  provider: string;
  retrievedAt: string;
  ok: boolean;
  note?: string;
}

export interface WebSearchHit {
  title: string;
  url: string;
  snippet: string;
}

export interface WebSearchResult extends ConnectorMeta {
  query: string;
  hits: WebSearchHit[];
}

export interface MarketDataResult extends ConnectorMeta {
  symbol: string;
  price?: number;
  marketCap?: number;
  fdv?: number;
  volume24h?: number;
  circulatingSupply?: number;
  totalSupply?: number;
  maxSupply?: number;
  venues?: { exchange: string; pair: string; volume24h?: number }[];
}

export interface OnChainResult extends ConnectorMeta {
  chain: string;
  address: string;
  verified?: boolean;
  proxy?: boolean;
  ownerAddress?: string;
  holders?: number;
  topHolderPct?: number;
}

export interface WebSearchConnector {
  readonly provider: string;
  search(query: string): Promise<WebSearchResult>;
}

export interface MarketDataConnector {
  readonly provider: string;
  lookup(symbol: string): Promise<MarketDataResult>;
}

export interface OnChainConnector {
  readonly provider: string;
  inspect(chain: string, address: string): Promise<OnChainResult>;
}

export interface Connectors {
  web: WebSearchConnector;
  market: MarketDataConnector;
  onchain: OnChainConnector;
}
