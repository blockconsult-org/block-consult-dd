import { ok, parseBody } from "@/lib/api";
import { aiSettingsPatchSchema, updateAiSettings } from "@/ai/settings";
import { aiSettingsView } from "@/ai/settings-view";

export async function GET() {
  return ok(await aiSettingsView());
}

export async function PUT(req: Request) {
  const parsed = await parseBody(req, aiSettingsPatchSchema);
  if ("error" in parsed) return parsed.error;
  await updateAiSettings(parsed.data);
  return ok(await aiSettingsView());
}
