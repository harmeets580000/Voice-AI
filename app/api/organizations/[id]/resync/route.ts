import { handleRoute, ok } from "@server/platform/http/responses";
import type { SyncResponse } from "@contracts/vapi";
import { requireRole } from "@server/platform/auth/context";
import { Role } from "@domain/enums";
import { syncOrganizationFromVapi } from "@server/features/organizations/organizations.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Pull-sync from Vapi: read the org's assistant config, phone number, KB, and historical
 * calls back into the portal (idempotent). Super-admin only.
 */
export const POST = handleRoute(async (_req, ctx) => {
  const principal = await requireRole([Role.SUPER_ADMIN]);
  const { id } = await (ctx as Ctx).params;
  const r = await syncOrganizationFromVapi(id, { triggeredBy: principal.userId });
  const res: SyncResponse = {
    syncStatus: r.syncStatus as SyncResponse["syncStatus"],
    importedCalls: r.importedCalls,
    syncError: r.syncError,
  };
  return ok(res);
});
