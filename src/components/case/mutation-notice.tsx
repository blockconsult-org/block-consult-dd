import { CheckCircle2, CircleAlert } from "lucide-react";

export function MutationNotice({ error, success }: { error?: string | null; success?: string | null }) {
  if (!error && !success) return null;
  const Icon = error ? CircleAlert : CheckCircle2;
  return (
    <div role={error ? "alert" : "status"} className={`flex items-start gap-2 rounded-lg border px-4 py-3 text-sm ${error ? "border-danger/25 bg-danger/10 text-danger" : "border-success/25 bg-success/10 text-success"}`}>
      <Icon aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
      <p className="min-w-0 break-words">{error || success}</p>
    </div>
  );
}
