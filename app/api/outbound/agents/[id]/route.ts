import { handleRoute, ok } from "@server/platform/http/responses";
import { assertRole } from "@server/platform/auth/rbac";
import { AppError } from "@server/platform/http/errors";
import { Role } from "@domain/enums";
import { withOutboundOrg } from "@server/features/outbound/guard";
import {
  getAgent,
  updateAgent,
  deleteAgent,
} from "@server/features/outbound/agents.service";
import { UpdateAgentRequest } from "@contracts/outbound-agents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handleRoute(async (req, ctx) => {
  const { organizationId } = await withOutboundOrg(req);
  const { id } = await (ctx as Ctx).params;
  const agent = await getAgent(organizationId, id);
  if (!agent) throw AppError.notFound("Agent not found");
  return ok({ agent });
});

export const PATCH = handleRoute(async (req, ctx) => {
  const { principal, organizationId } = await withOutboundOrg(req);
  assertRole(principal, [Role.ORG_ADMIN, Role.SUPER_ADMIN]);
  const { id } = await (ctx as Ctx).params;
  const body = UpdateAgentRequest.parse(await req.json());
  return ok({ agent: await updateAgent(organizationId, id, body) });
});

export const DELETE = handleRoute(async (req, ctx) => {
  const { principal, organizationId } = await withOutboundOrg(req);
  assertRole(principal, [Role.ORG_ADMIN, Role.SUPER_ADMIN]);
  const { id } = await (ctx as Ctx).params;
  return ok(await deleteAgent(organizationId, id));
});
