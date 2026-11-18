"use client";
import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";

/** Run a mutation, surface errors, and refresh server data on success. */
export function useMutate() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async (fn: () => Promise<unknown>, opts?: { refresh?: boolean }) => {
      setBusy(true);
      setError(null);
      try {
        await fn();
        if (opts?.refresh !== false) router.refresh();
        return true;
      } catch (e) {
        setError((e as Error).message);
        return false;
      } finally {
        setBusy(false);
      }
    },
    [router],
  );

  return { busy, error, run, setError };
}
