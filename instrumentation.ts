/**
 * Next.js instrumentation hook — runs once when the Node server boots.
 *
 * Starts the background auto-sync poller that reflects each keyed org's Vapi account into the portal
 * — new calls AND its assistants (so they appear on /assistants without a manual "Sync from Vapi") —
 * including orgs that have no assistants yet (it bootstraps them). Gated to the real `vapi` provider
 * (never re-imports fake data) and off in tests. Safe-by-design: call import is insert-only and the
 * poller is per-org keyed (see organizations.service `reflectAllOrgsFromVapi`).
 */

export async function register() {
  // Only run in the Node.js server runtime (not edge, not build).
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { env } = await import("@server/config/env");
  if (
    env.NODE_ENV === "test" ||
    !env.AUTO_SYNC_ENABLED ||
    env.VOICE_PROVIDER !== "vapi"
  ) {
    return;
  }

  // Avoid starting a second interval across dev HMR reloads.
  const g = globalThis as typeof globalThis & { __autoSyncStarted?: boolean };
  if (g.__autoSyncStarted) return;
  g.__autoSyncStarted = true;

  const { reflectAllOrgsFromVapi } = await import(
    "@server/features/organizations/organizations.service"
  );
  const { logger } = await import("@server/platform/logging/logger");

  const intervalMs = Math.max(env.AUTO_SYNC_INTERVAL_SECONDS, 30) * 1000;
  logger.info("Auto-sync poller started", {
    intervalSeconds: intervalMs / 1000,
  });

  const run = async () => {
    try {
      const results = await reflectAllOrgsFromVapi();
      const total = results.reduce((sum, r) => sum + r.imported, 0);
      if (total > 0) {
        logger.info("Auto-sync imported calls", { total });
      }
    } catch (e) {
      logger.warn("Auto-sync cycle failed", {
        error: e instanceof Error ? e.message : String(e),
      });
    }
  };

  // First pass shortly after boot, then on the configured interval.
  setTimeout(run, 5_000);
  setInterval(run, intervalMs);
}
