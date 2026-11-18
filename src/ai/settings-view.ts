/**
 * What the Settings page needs in one payload: the stored settings, which keys
 * are saved (presence and a four-character hint only), and where keys are kept.
 */
import { isDesktopApp } from "@/lib/desktop-bridge";
import { secretStatus, secretStorageDescription, type SecretScheme, type SecretStatus } from "@/lib/secrets";
import { ANTHROPIC_KEY_SECRET } from "./providers/anthropic";
import { OPENAI_KEY_SECRET } from "./providers/openai";
import { getAiSettings, type AiSettings } from "./settings";
import { AiError, PROVIDER_IDS, PROVIDER_LABELS, type AiErrorCode, type ProviderId } from "./types";

/** Providers that use an API key saved in the app, and the secret that holds it. */
export const KEY_SECRETS = {
  anthropic: ANTHROPIC_KEY_SECRET,
  openai: OPENAI_KEY_SECRET,
} as const;
export type KeyProvider = keyof typeof KEY_SECRETS;
export const KEY_PROVIDERS = Object.keys(KEY_SECRETS) as KeyProvider[];

export interface ProviderSummary {
  id: ProviderId;
  label: string;
  kind: "api_key" | "subscription";
}

export interface AiSettingsView {
  settings: AiSettings;
  providers: ProviderSummary[];
  keys: Record<KeyProvider, SecretStatus>;
  keyStorage: { scheme: SecretScheme; label: string };
  desktop: boolean;
  /** ANTHROPIC_API_KEY is set in the server's environment. */
  anthropicEnvKey: boolean;
}

export async function aiSettingsView(): Promise<AiSettingsView> {
  const [settings, anthropicKey, openaiKey, keyStorage] = await Promise.all([
    getAiSettings(),
    secretStatus(KEY_SECRETS.anthropic),
    secretStatus(KEY_SECRETS.openai),
    secretStorageDescription(),
  ]);
  return {
    settings,
    providers: PROVIDER_IDS.map((id) => ({
      id,
      label: PROVIDER_LABELS[id],
      kind: id === "anthropic" || id === "openai" ? "api_key" : "subscription",
    })),
    keys: { anthropic: anthropicKey, openai: openaiKey },
    keyStorage,
    desktop: isDesktopApp(),
    anthropicEnvKey: Boolean(process.env.ANTHROPIC_API_KEY),
  };
}

/** Rejects keys pasted into the wrong provider's field. Returns an error message, or null when the shape looks right. */
export function keyShapeError(provider: KeyProvider, key: string): string | null {
  if (provider === "anthropic" && !key.startsWith("sk-ant-")) {
    return "That doesn't look like a Claude API key. Claude keys start with sk-ant- and come from console.anthropic.com.";
  }
  if (provider === "openai") {
    if (key.startsWith("sk-ant-")) return "That is a Claude API key. Paste it under Claude API instead.";
    if (!key.startsWith("sk-")) {
      return "That doesn't look like an OpenAI API key. OpenAI keys start with sk- and come from platform.openai.com.";
    }
  }
  return null;
}

/** HTTP status for an AI failure surfaced by an API route. */
export function aiErrorStatus(code: AiErrorCode): number {
  switch (code) {
    case "not_configured":
    case "bad_request":
    case "auth":
    case "cli_missing":
      return 400;
    case "cancelled":
      return 409;
    case "rate_limit":
      return 429;
    case "timeout":
      return 504;
    default:
      return 502;
  }
}

export function isAiError(err: unknown): err is AiError {
  return err instanceof AiError;
}
