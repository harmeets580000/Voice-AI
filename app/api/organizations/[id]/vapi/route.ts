import { handleRoute, ok } from "@server/platform/http/responses";
import {
  UpdateVapiSettingsRequest,
  type VapiSettingsResponse,
} from "@contracts/vapi";
import { requireRole } from "@server/platform/auth/context";
import { Role } from "@domain/enums";
import {
  getVapiSettings,
  updateVapiSettings,
} from "@server/features/organizations/organizations.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// Vapi settings (incl. ids/keys) are SUPER-ADMIN ONLY — org_admins never see them
// (tests I-ISO-09, I-AUTH-13).
export const GET = handleRoute(async (_req, ctx) => {
  await requireRole([Role.SUPER_ADMIN]);
  const { id } = await (ctx as Ctx).params;
  const res: VapiSettingsResponse = { settings: await getVapiSettings(id) };
  return ok(res);
});

export const PUT = handleRoute(async (req, ctx) => {
  await requireRole([Role.SUPER_ADMIN]);
  const { id } = await (ctx as Ctx).params;
  const body = UpdateVapiSettingsRequest.parse(await req.json());
  const res: VapiSettingsResponse = {
    settings: await updateVapiSettings(id, body),
  };
  return ok(res);
});
