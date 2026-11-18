import { ok } from "@/lib/api";
import { getAiSettings, PROVIDER_SECTION } from "@/ai/settings";
import { PROVIDER_LABELS, PROVIDER_SHORT_LABELS } from "@/ai/types";

/** Lightweight status for the header: which provider is active, without touching stored keys. */
export async function GET() {
  const settings = await getAiSettings();
  const id = settings.activeProvider;
  return ok(
    id
      ? { activeProvider: id, label: PROVIDER_LABELS[id], shortLabel: PROVIDER_SHORT_LABELS[id], model: settings[PROVIDER_SECTION[id]].model }
      : { activeProvider: null, label: null, shortLabel: null, model: null },
  );
}
