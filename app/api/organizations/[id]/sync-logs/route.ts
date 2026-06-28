import { handleRoute, ok } from "@server/platform/http/responses";
import type { SyncLogListResponse } from "@contracts/sync";
import { requireRole } from "@server/platform/auth/context";
import { Role } from "@domain/enums";
import { listSyncLogs } from "@server/features/sync/sync-log.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** Full sync history for an org (most recent first). Super-admin only. */
export const GET = handleRoute(async (_req, ctx) => {
  await requireRole([Role.SUPER_ADMIN]);
  const { id } = await (ctx as Ctx).params;
  const res: SyncLogListResponse = { logs: await listSyncLogs(id) };
  return ok(res);
});
