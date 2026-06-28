import { handleRoute, ok } from "@server/platform/http/responses";
import type { ProvisionResponse } from "@contracts/vapi";
import { requireRole } from "@server/platform/auth/context";
import { Role } from "@domain/enums";
import { provisionOrganization } from "@server/features/organizations/organizations.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** Provision (or re-provision, idempotently) an org's Vapi setup. Super-admin only. */
export const POST = handleRoute(async (_req, ctx) => {
  const principal = await requireRole([Role.SUPER_ADMIN]);
  const { id } = await (ctx as Ctx).params;
  const result = await provisionOrganization(id, principal.userId);
  const res: ProvisionResponse = {
    syncStatus: result.syncStatus as ProvisionResponse["syncStatus"],
    syncError: result.syncError,
  };
  return ok(res);
});
