import { handleRoute, ok, created } from "@server/platform/http/responses";
import { assertRole } from "@server/platform/auth/rbac";
import { Role } from "@domain/enums";
import { withOutboundOrg } from "@server/features/outbound/guard";
import {
  listAgents,
  createAgent,
} from "@server/features/outbound/agents.service";
import { CreateAgentRequest } from "@contracts/outbound-agents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Reps may view agents; only admins create/edit them (RBAC matrix).
export const GET = handleRoute(async (req) => {
  const { organizationId } = await withOutboundOrg(req);
  return ok({ agents: await listAgents(organizationId) });
});

export const POST = handleRoute(async (req) => {
  const { principal, organizationId } = await withOutboundOrg(req);
  assertRole(principal, [Role.ORG_ADMIN, Role.SUPER_ADMIN]);
  const body = CreateAgentRequest.parse(await req.json());
  return created({ agent: await createAgent(organizationId, body) });
});
