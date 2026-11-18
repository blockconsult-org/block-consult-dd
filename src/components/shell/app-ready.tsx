"use client";

import { createContext, useContext } from "react";

// Standalone controls have no document shell to wait for, including the component test fixture.
export const AppReadyContext = createContext(true);

export function useAppReady() {
  return useContext(AppReadyContext);
}
