import { handleRoute, ok } from "@server/platform/http/responses";
import { assertRole } from "@server/platform/auth/rbac";
import { Role } from "@domain/enums";
import { withOutboundOrg } from "@server/features/outbound/guard";
import { deleteSegment } from "@server/features/outbound/segments.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export const DELETE = handleRoute(async (req, ctx) => {
  const { principal, organizationId } = await withOutboundOrg(req);
  assertRole(principal, [Role.ORG_ADMIN, Role.ORG_STAFF, Role.SUPER_ADMIN]);
  const { id } = await (ctx as Ctx).params;
  return ok(await deleteSegment(organizationId, id));
});
