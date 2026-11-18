/**
 * AI settings, stored as one JSON row in AppSetting (key "ai"). API keys are
 * not stored here; they live encrypted in the Secret table (src/lib/secrets.ts).
 */
import { z } from "zod";
import { prisma } from "@/lib/db";
import { parseJson, toJson } from "@/domain/json";
import { EFFORT_LEVELS, PROVIDER_IDS, type ProviderId } from "./types";

const SETTINGS_KEY = "ai";

export const RESEARCH_DEPTHS = ["quick", "standard", "deep"] as const;
export type ResearchDepth = (typeof RESEARCH_DEPTHS)[number];

/** Web tool budgets per research depth (searches, page fetches). */
export const DEPTH_BUDGETS: Record<ResearchDepth, { maxSearches: number; maxFetches: number }> = {
  quick: { maxSearches: 8, maxFetches: 6 },
  standard: { maxSearches: 20, maxFetches: 15 },
  deep: { maxSearches: 40, maxFetches: 30 },
};

export const ANTHROPIC_AUTH_MODES = ["api_key", "environment"] as const;

const modelId = z.string().trim().max(120);

const anthropicSchema = z.object({
  model: modelId.min(1),
  effort: z.enum(EFFORT_LEVELS),
  /** api_key: key saved in this app. environment: ANTHROPIC_API_KEY or an `ant auth login` profile. */
  authMode: z.enum(ANTHROPIC_AUTH_MODES),
  /** Let the API answer with a fallback model when the selected model declines a request. */
  fallbacks: z.boolean(),
});

const openaiSchema = z.object({
  model: modelId.min(1),
  effort: z.enum(EFFORT_LEVELS),
});

const cliSchema = z.object({
  /** Empty = the CLI's own default model. */
  model: modelId,
  effort: z.enum(EFFORT_LEVELS),
  /** Empty = find the CLI on PATH and in the usual install folders. */
  binaryPath: z.string().trim().max(1024),
});

const researchSchema = z.object({
  depth: z.enum(RESEARCH_DEPTHS),
  /** Fetch every cited page and check that the quoted text is on it. */
  verifySources: z.boolean(),
});

export const aiSettingsSchema = z.object({
  activeProvider: z.enum(PROVIDER_IDS).nullable(),
  anthropic: anthropicSchema,
  openai: openaiSchema,
  claudeCode: cliSchema,
  codex: cliSchema,
  research: researchSchema,
});
export type AiSettings = z.infer<typeof aiSettingsSchema>;

export const aiSettingsPatchSchema = z
  .object({
    activeProvider: z.enum(PROVIDER_IDS).nullable(),
    anthropic: anthropicSchema.partial(),
    openai: openaiSchema.partial(),
    claudeCode: cliSchema.partial(),
    codex: cliSchema.partial(),
    research: researchSchema.partial(),
  })
  .partial();
export type AiSettingsPatch = z.infer<typeof aiSettingsPatchSchema>;

export const DEFAULT_AI_SETTINGS: AiSettings = {
  activeProvider: null,
  anthropic: { model: "claude-opus-5-5", effort: "high", authMode: "api_key", fallbacks: true },
  openai: { model: "gpt-6.1-sol", effort: "high" },
  claudeCode: { model: "", effort: "high", binaryPath: "" },
  codex: { model: "", effort: "high", binaryPath: "" },
  research: { depth: "standard", verifySources: true },
};

/** Settings section that holds a provider's options. */
export const PROVIDER_SECTION = {
  anthropic: "anthropic",
  openai: "openai",
  "claude-code": "claudeCode",
  codex: "codex",
} as const satisfies Record<ProviderId, keyof AiSettings>;

export function mergeAiSettings(base: AiSettings, patch: AiSettingsPatch): AiSettings {
  return {
    activeProvider: patch.activeProvider !== undefined ? patch.activeProvider : base.activeProvider,
    anthropic: { ...base.anthropic, ...patch.anthropic },
    openai: { ...base.openai, ...patch.openai },
    claudeCode: { ...base.claudeCode, ...patch.claudeCode },
    codex: { ...base.codex, ...patch.codex },
    research: { ...base.research, ...patch.research },
  };
}

/**
 * Read stored settings over the defaults. Each section is validated on its
 * own, so one invalid value (say, from a newer app version) resets only that
 * section instead of the whole configuration.
 */
export async function getAiSettings(): Promise<AiSettings> {
  const row = await prisma.appSetting.findUnique({ where: { key: SETTINGS_KEY } });
  const stored = parseJson<Record<string, unknown>>(row?.valueJson, {});
  const patch: AiSettingsPatch = {};
  const sections = aiSettingsPatchSchema.shape;
  for (const key of Object.keys(sections) as (keyof typeof sections)[]) {
    if (!(key in stored)) continue;
    const parsed = sections[key].safeParse(stored[key]);
    if (parsed.success) Object.assign(patch, { [key]: parsed.data });
  }
  return mergeAiSettings(DEFAULT_AI_SETTINGS, patch);
}

export async function updateAiSettings(patch: AiSettingsPatch): Promise<AiSettings> {
  const next = aiSettingsSchema.parse(mergeAiSettings(await getAiSettings(), patch));
  await prisma.appSetting.upsert({
    where: { key: SETTINGS_KEY },
    update: { valueJson: toJson(next) },
    create: { key: SETTINGS_KEY, valueJson: toJson(next) },
  });
  return next;
}
