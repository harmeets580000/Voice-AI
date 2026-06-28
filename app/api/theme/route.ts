import { handleRoute, ok } from "@server/platform/http/responses";
import {
  PutThemeRequest,
  type GetThemeResponse,
  type PutThemeResponse,
} from "@contracts/theme";
import { withActiveOrg, withRequiredOrg } from "@server/platform/auth/context";
import { assertRole } from "@server/platform/auth/rbac";
import { Role } from "@domain/enums";
import {
  getResolvedTheme,
  getPlatformResolved,
  saveOrgOverride,
} from "@server/features/theme/theme.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Resolved theme for the active org (or platform default in the platform view). */
export const GET = handleRoute(async (req) => {
  const { organizationId } = await withActiveOrg(req);
  if (!organizationId) {
    const theme = await getPlatformResolved();
    const res: GetThemeResponse = { theme, override: null };
    return ok(res);
  }
  const { theme, override } = await getResolvedTheme(organizationId);
  const res: GetThemeResponse = { theme, override };
  return ok(res);
});

/** Save the active org's theme override. org_admin (own org) or super-admin (acting in). */
export const PUT = handleRoute(async (req) => {
  const { principal, organizationId } = await withRequiredOrg(req);
  assertRole(principal, [Role.ORG_ADMIN, Role.SUPER_ADMIN]);
  const body = PutThemeRequest.parse(await req.json());
  const theme = await saveOrgOverride(organizationId, body);
  const res: PutThemeResponse = { theme };
  return ok(res);
});
