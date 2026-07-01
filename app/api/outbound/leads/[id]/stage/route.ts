import { handleRoute, ok } from "@server/platform/http/responses";
import { assertRole } from "@server/platform/auth/rbac";
import { Role } from "@domain/enums";
import { withOutboundOrg } from "@server/features/outbound/guard";
import { updateLeadStage } from "@server/features/outbound/leads.service";
import { UpdateLeadStageRequest } from "@contracts/outbound-leads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// Move a lead to a new stage (drag on the Kanban / dropdown on the table). LOST needs a reason.
export const PUT = handleRoute(async (req, ctx) => {
  const { principal, organizationId } = await withOutboundOrg(req);
  assertRole(principal, [Role.ORG_ADMIN, Role.ORG_STAFF, Role.SUPER_ADMIN]);
  const { id } = await (ctx as Ctx).params;
  const body = UpdateLeadStageRequest.parse(await req.json());
  return ok({
    lead: await updateLeadStage(organizationId, id, body.stage, {
      userId: principal.userId,
      lostReason: body.lostReason,
    }),
  });
});
