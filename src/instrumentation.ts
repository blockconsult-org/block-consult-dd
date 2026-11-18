/**
 * Next.js startup hook: runs once per server process before requests are
 * served. Brings the database schema up to date and closes out research runs
 * that were interrupted by a previous shutdown.
 */
export async function register(): Promise<void> {
  // Keep the import inside this block: Next also compiles this file for the
  // edge runtime, and webpack only drops the Node-only import from that bundle
  // when it sits in a branch it can prove false. An early return is not enough.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    if (process.env.NEXT_PHASE === "phase-production-build") return;
    const { prepareServer } = await import("./lib/startup");
    await prepareServer();
  }
}
