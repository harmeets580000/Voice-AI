import { handleRoute, ok } from "@server/platform/http/responses";
import type { VapiSettingsResponse } from "@contracts/vapi";
import { requireRole } from "@server/platform/auth/context";
import { Role } from "@domain/enums";
import { resetOrgVapiData } from "@server/features/organizations/organizations.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Reset everything Vapi-derived for an org (mirror ids, synced config, imported calls, tool ids,
 * sync history) — keeps the saved API key. Super-admin only.
 */
export const POST = handleRoute(async (_req, ctx) => {
  await requireRole([Role.SUPER_ADMIN]);
  const { id } = await (ctx as Ctx).params;
  const res: VapiSettingsResponse = { settings: await resetOrgVapiData(id) };
  return ok(res);
});
