import { z } from "zod";
import { fail, ok, parseBody } from "@/lib/api";
import { deleteSecret, secretStatus, setSecret } from "@/lib/secrets";
import { getAiSettings, updateAiSettings } from "@/ai/settings";
import { KEY_PROVIDERS, KEY_SECRETS, keyShapeError, type KeyProvider } from "@/ai/settings-view";

type Params = { params: Promise<{ provider: string }> };

const keySchema = z.object({
  key: z
    .string()
    .trim()
    .min(20, "That key is too short.")
    .max(400, "That key is too long.")
    .regex(/^\S+$/, "API keys contain no spaces or line breaks."),
});

function keyProvider(value: string): KeyProvider | null {
  return (KEY_PROVIDERS as string[]).includes(value) ? (value as KeyProvider) : null;
}

/** Save an API key. The response carries presence and a hint, never the key. */
export async function PUT(req: Request, { params }: Params) {
  const provider = keyProvider((await params).provider);
  if (!provider) return fail("This provider does not use an API key.", 404);
  const parsed = await parseBody(req, keySchema);
  if ("error" in parsed) return parsed.error;
  const shapeError = keyShapeError(provider, parsed.data.key);
  if (shapeError) return fail(shapeError, 422);

  const status = await setSecret(KEY_SECRETS[provider], parsed.data.key);
  const settings = await getAiSettings();
  if (!settings.activeProvider) await updateAiSettings({ activeProvider: provider });
  return ok(status);
}

export async function DELETE(_req: Request, { params }: Params) {
  const provider = keyProvider((await params).provider);
  if (!provider) return fail("This provider does not use an API key.", 404);
  await deleteSecret(KEY_SECRETS[provider]);
  return ok(await secretStatus(KEY_SECRETS[provider]));
}
