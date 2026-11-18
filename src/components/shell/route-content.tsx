"use client";

import type { ReactNode } from "react";

/** Give pending routes their own boundary so hydration retries do not reclaim the main element. */
export function RouteContent({ children }: { children: ReactNode }) {
  return children;
}
