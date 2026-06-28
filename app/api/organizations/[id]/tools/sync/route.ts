import { handleRoute, ok } from "@server/platform/http/responses";
import type { ToolsSyncResponse } from "@contracts/vapi";
import { requireRole } from "@server/platform/auth/context";
import { Role } from "@domain/enums";
import { reconcileOrganizationTools } from "@server/features/tools/tools.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** Reconcile the org's tools into Vapi (create enabled / delete disabled). Super-admin only. */
export const POST = handleRoute(async (_req, ctx) => {
  const principal = await requireRole([Role.SUPER_ADMIN]);
  const { id } = await (ctx as Ctx).params;
  const res: ToolsSyncResponse = await reconcileOrganizationTools(
    id,
    principal.userId,
  );
  return ok(res);
});
