import { aiSettingsView } from "@/ai/settings-view";
import { AiSettingsPanel } from "@/components/settings/ai-settings-panel";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const view = await aiSettingsView();
  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6">
        <span className="eyebrow">Workspace preferences</span>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-fg">Settings<span className="text-accent">.</span></h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">Manage appearance, AI connections and research defaults for this app.</p>
      </div>
      <AiSettingsPanel initial={view} />
    </div>
  );
}
