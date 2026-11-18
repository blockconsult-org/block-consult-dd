"use client";
import { useCallback, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

/** Run a mutation, surface errors, and refresh server data on success. */
export function useMutate() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [refreshing, startRefresh] = useTransition();
  const inFlight = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const run = useCallback(
    async (fn: () => Promise<unknown>, opts?: { refresh?: boolean; success?: string }) => {
      if (inFlight.current) return false;
      inFlight.current = true;
      setBusy(true);
      setError(null);
      setSuccess(null);
      try {
        await fn();
        if (opts?.refresh !== false) startRefresh(() => router.refresh());
        setSuccess(opts?.success ?? null);
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not save this change. Try again.");
        return false;
      } finally {
        setBusy(false);
        inFlight.current = false;
      }
    },
    [router],
  );

  return { busy: busy || refreshing, error, success, run, setError, setSuccess };
}
