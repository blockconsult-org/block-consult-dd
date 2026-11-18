"use client";

import { useEffect, useState, type ReactNode } from "react";
import { AppHeader } from "./app-header";
import { AppReadyContext } from "./app-ready";

/** Keep portal controls inactive until React has claimed the document's main structure. */
export function AppShell({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  useEffect(() => { setReady(true); }, []);

  return (
    <AppReadyContext.Provider value={ready}>
      <AppHeader />
      <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 focus:outline-none sm:px-6 sm:py-8">{children}</main>
      <footer className="mx-auto w-full max-w-7xl px-4 pb-6 pt-8 text-xs leading-5 text-faint sm:px-6">
        <div className="flex flex-col gap-2 border-t border-line pt-5 sm:flex-row sm:items-start sm:justify-between sm:gap-8">
          <span className="shrink-0 font-medium text-muted">Block Consult GmbH</span>
          <p className="max-w-xl sm:text-right">Due diligence supports professional judgment. It is not legal, tax, accounting or investment advice.</p>
        </div>
      </footer>
    </AppReadyContext.Provider>
  );
}
