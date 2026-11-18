import { z } from "zod";
import { fail, ok } from "@/lib/api";
import { getProvider } from "@/ai/registry";
import { PROVIDER_IDS } from "@/ai/types";

const providerSchema = z.enum(PROVIDER_IDS);

/** Models the provider offers for this account. Falls back to an empty list with an error message. */
export async function GET(req: Request) {
  const parsed = providerSchema.safeParse(new URL(req.url).searchParams.get("provider"));
  if (!parsed.success) return fail("Unknown provider", 400);
  const signal = AbortSignal.any([req.signal, AbortSignal.timeout(30_000)]);
  try {
    return ok({ models: await getProvider(parsed.data).listModels(signal) });
  } catch (err) {
    return ok({ models: [], error: err instanceof Error ? err.message : String(err) });
  }
}
