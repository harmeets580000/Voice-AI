import { handleRoute, ok } from "@server/platform/http/responses";
import { assertRole } from "@server/platform/auth/rbac";
import { Role } from "@domain/enums";
import { withOutboundOrg } from "@server/features/outbound/guard";
import { assignLead } from "@server/features/outbound/leads.service";
import { AssignLeadRequest } from "@contracts/outbound-leads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export const PUT = handleRoute(async (req, ctx) => {
  const { principal, organizationId } = await withOutboundOrg(req);
  assertRole(principal, [Role.ORG_ADMIN, Role.ORG_STAFF, Role.SUPER_ADMIN]);
  const { id } = await (ctx as Ctx).params;
  const body = AssignLeadRequest.parse(await req.json());
  return ok({
    lead: await assignLead(
      organizationId,
      id,
      body.ownerUserId,
      principal.userId,
    ),
  });
});
