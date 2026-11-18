import { z } from "zod";
import { fail, ok, parseBody } from "@/lib/api";
import { INTAKE_SYSTEM, intakePrompt } from "@/ai/prompts";
import { runTask } from "@/ai/registry";
import { JSON_SCHEMAS, intakeExtractSchema, type IntakeExtract } from "@/ai/schemas";
import { aiErrorStatus, isAiError } from "@/ai/settings-view";

const extractSchema = z.object({
  text: z
    .string()
    .trim()
    .min(40, "Paste at least a few sentences of the offer.")
    .max(100_000, "That text is too long. Paste the offer itself, up to about 100,000 characters."),
});

/** Pull intake fields out of pasted offer text. Nothing is saved; the form shows the result for review. */
export async function POST(req: Request) {
  const parsed = await parseBody(req, extractSchema);
  if ("error" in parsed) return parsed.error;
  try {
    const result = await runTask<IntakeExtract>({
      purpose: "intake",
      system: INTAKE_SYSTEM,
      prompt: intakePrompt(parsed.data.text),
      schemaName: "submit_intake",
      schemaDescription: "Submit the intake fields found in the pasted text.",
      jsonSchema: JSON_SCHEMAS.intake,
      parse: (value) => intakeExtractSchema.parse(value),
      web: null,
      effortOverride: "low",
      maxOutputTokens: 16_000,
      signal: req.signal,
    });
    return ok({ extract: result.data, provider: result.provider, model: result.model, notes: result.notes });
  } catch (err) {
    if (isAiError(err)) return fail(err.message, aiErrorStatus(err.code), { code: err.code });
    throw err;
  }
}
