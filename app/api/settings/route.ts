import { handleRoute, ok } from "@server/platform/http/responses";
import {
  UpdateSettingsRequest,
  type SettingsResponse,
} from "@contracts/settings";
import { withActiveOrg, withRequiredOrg } from "@server/platform/auth/context";
import { assertRole } from "@server/platform/auth/rbac";
import { Role } from "@domain/enums";
import {
  getOrgSettings,
  updateOrgSettings,
} from "@server/features/settings/settings.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Active-org settings (date format). Falls back to the default in platform view. */
export const GET = handleRoute(async (req) => {
  const { organizationId } = await withActiveOrg(req);
  const res: SettingsResponse = await getOrgSettings(organizationId);
  return ok(res);
});

export const PUT = handleRoute(async (req) => {
  const { principal, organizationId } = await withRequiredOrg(req);
  assertRole(principal, [Role.ORG_ADMIN, Role.SUPER_ADMIN]);
  const body = UpdateSettingsRequest.parse(await req.json());
  const res: SettingsResponse = await updateOrgSettings(organizationId, body);
  return ok(res);
});
