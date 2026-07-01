import { handleRoute, ok } from "@server/platform/http/responses";
import { assertRole } from "@server/platform/auth/rbac";
import { Role } from "@domain/enums";
import { withOutboundOrg } from "@server/features/outbound/guard";
import { setAgentAction } from "@server/features/outbound/agents.service";
import {
  OutboundActionTypeSchema,
  SetAgentActionRequest,
} from "@contracts/outbound-agents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; type: string }> };

// Enable/configure one action on an agent (config-only, admin). Nothing executes.
export const PUT = handleRoute(async (req, ctx) => {
  const { principal, organizationId } = await withOutboundOrg(req);
  assertRole(principal, [Role.ORG_ADMIN, Role.SUPER_ADMIN]);
  const { id, type } = await (ctx as Ctx).params;
  const actionType = OutboundActionTypeSchema.parse(type);
  const body = SetAgentActionRequest.parse(await req.json());
  return ok({
    action: await setAgentAction(organizationId, id, actionType, body),
  });
});
