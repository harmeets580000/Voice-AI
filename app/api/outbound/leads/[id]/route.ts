import { handleRoute, ok } from "@server/platform/http/responses";
import { assertRole } from "@server/platform/auth/rbac";
import { AppError } from "@server/platform/http/errors";
import { Role } from "@domain/enums";
import { withOutboundOrg } from "@server/features/outbound/guard";
import {
  getLead,
  updateLead,
  deleteLead,
} from "@server/features/outbound/leads.service";
import { UpdateLeadRequest } from "@contracts/outbound-leads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handleRoute(async (req, ctx) => {
  const { organizationId } = await withOutboundOrg(req);
  const { id } = await (ctx as Ctx).params;
  const lead = await getLead(organizationId, id);
  if (!lead) throw AppError.notFound("Lead not found");
  return ok({ lead });
});

export const PATCH = handleRoute(async (req, ctx) => {
  const { principal, organizationId } = await withOutboundOrg(req);
  assertRole(principal, [Role.ORG_ADMIN, Role.ORG_STAFF, Role.SUPER_ADMIN]);
  const { id } = await (ctx as Ctx).params;
  const body = UpdateLeadRequest.parse(await req.json());
  return ok({ lead: await updateLead(organizationId, id, body) });
});

// Deleting leads is admin-only (RBAC matrix).
export const DELETE = handleRoute(async (req, ctx) => {
  const { principal, organizationId } = await withOutboundOrg(req);
  assertRole(principal, [Role.ORG_ADMIN, Role.SUPER_ADMIN]);
  const { id } = await (ctx as Ctx).params;
  return ok(await deleteLead(organizationId, id));
});
