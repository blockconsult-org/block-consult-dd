import { aiSettingsView } from "@/ai/settings-view";
import { AiSettingsPanel } from "@/components/settings/ai-settings-panel";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const view = await aiSettingsView();
  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-8">
        <span className="eyebrow">Settings</span>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-fg sm:text-4xl">AI & research<span className="text-accent">.</span></h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
          Choose the provider for research, intake extraction and report drafting. Connect an API key or a signed-in CLI on this computer.
        </p>
        <p className="mt-3 max-w-2xl text-xs leading-relaxed text-faint">AI requests send case details to the selected provider. Saved keys are sent only to their own provider. Cases and rule-based checks remain available with AI turned off.</p>
      </div>
      <AiSettingsPanel initial={view} />
    </div>
  );
}
