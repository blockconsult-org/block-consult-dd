import { Suspense } from "react";
import { UnlockForm } from "./unlock-form";

export const metadata = { title: "Unlock · Block Consult" };

export default function UnlockPage() {
  return (
    <div className="mx-auto max-w-sm py-16">
      <span className="eyebrow">Private installation</span>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight text-fg">Enter the access token</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted">This server is protected. Ask the person who runs it for the access token.</p>
      <Suspense>
        <UnlockForm />
      </Suspense>
    </div>
  );
}
