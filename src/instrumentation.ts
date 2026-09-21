/**
 * Next.js runs this once when the server process starts.
 *
 * The scheduler lives in the server process, so it only runs while the app is
 * running - which is exactly the case for the installed background service.
 * It stays off under `next dev`, where the process restarts on every file
 * change and an unattended bank scrape in the middle of editing is the last
 * thing anyone wants.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NODE_ENV !== "production") return;
  if (process.env.SPENT_DISABLE_SCHEDULER === "1") return;

  const { initScheduler } = await import("@/server/sync/scheduler");
  initScheduler();
}
