/**
 * In-process registry of running research jobs, one per case. The app runs
 * as a single long-lived Node server (desktop or self-hosted), so a job keeps
 * running after the request that started it has returned. The registry lives
 * on globalThis so dev-mode module reloads do not lose track of jobs.
 */

interface Job {
  runId: string;
  controller: AbortController;
  startedAt: number;
}

const registry = globalThis as typeof globalThis & { __bcResearchJobs?: Map<string, Job> };
const jobs: Map<string, Job> = (registry.__bcResearchJobs ??= new Map());

export function activeJob(caseId: string): { runId: string; startedAt: number } | null {
  const job = jobs.get(caseId);
  return job ? { runId: job.runId, startedAt: job.startedAt } : null;
}

/**
 * Start `work` in the background for a case. Returns false when the case
 * already has a running job. `work` must handle its own errors; anything it
 * throws is logged and swallowed so the server never sees an unhandled rejection.
 */
export function startJob(caseId: string, runId: string, work: (signal: AbortSignal) => Promise<void>): boolean {
  if (jobs.has(caseId)) return false;
  const controller = new AbortController();
  jobs.set(caseId, { runId, controller, startedAt: Date.now() });
  void work(controller.signal)
    .catch((err: unknown) => {
      console.error(`[research] job ${runId} crashed:`, err);
    })
    .finally(() => {
      if (jobs.get(caseId)?.runId === runId) jobs.delete(caseId);
    });
  return true;
}

/** Ask a running job to stop. Returns false when nothing is running for the case. */
export function cancelJob(caseId: string): boolean {
  const job = jobs.get(caseId);
  if (!job) return false;
  job.controller.abort();
  return true;
}
