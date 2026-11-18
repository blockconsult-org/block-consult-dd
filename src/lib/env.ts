/** Centralised environment access with safe defaults for local MVP use. */

export const env = {
  databaseUrl: process.env.DATABASE_URL || "file:./dev.db",
  storageDir: process.env.STORAGE_DIR || "./storage",
  connectorTimeoutMs: Number(process.env.CONNECTOR_TIMEOUT_MS || "15000"),
  appAccessToken: process.env.APP_ACCESS_TOKEN || "",
  keys: {
    tavily: process.env.TAVILY_API_KEY || "",
    serpapi: process.env.SERPAPI_API_KEY || "",
    coingecko: process.env.COINGECKO_API_KEY || "",
    coinmarketcap: process.env.COINMARKETCAP_API_KEY || "",
    etherscan: process.env.ETHERSCAN_API_KEY || "",
  },
} as const;

export function hasKey(name: keyof typeof env.keys): boolean {
  return Boolean(env.keys[name]);
}
