import { handleRoute, ok } from "@server/platform/http/responses";
import { assertRole } from "@server/platform/auth/rbac";
import { AppError } from "@server/platform/http/errors";
import { Role } from "@domain/enums";
import { withOutboundOrg } from "@server/features/outbound/guard";
import {
  getCampaign,
  updateCampaign,
  deleteCampaign,
} from "@server/features/outbound/campaigns.service";
import { UpdateCampaignRequest } from "@contracts/outbound-campaigns";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handleRoute(async (req, ctx) => {
  const { organizationId } = await withOutboundOrg(req);
  const { id } = await (ctx as Ctx).params;
  const c = await getCampaign(organizationId, id);
  if (!c) throw AppError.notFound("Campaign not found");
  return ok({
    campaign: {
      id: c.id,
      name: c.name,
      channel: c.channel,
      outboundAgentId: c.outboundAgentId,
      segmentId: c.segmentId,
      pacingPerHour: c.pacingPerHour,
      status: c.status,
      stats: c.statsJson ?? null,
      scheduledAt: c.scheduledAt ? c.scheduledAt.toISOString() : null,
      createdAt: c.createdAt.toISOString(),
      members: c.members.map((m) => ({
        id: m.id,
        contactId: m.contactId,
        status: m.status,
        outboundCallId: m.outboundCallId,
      })),
    },
  });
});

export const PATCH = handleRoute(async (req, ctx) => {
  const { principal, organizationId } = await withOutboundOrg(req);
  assertRole(principal, [Role.ORG_ADMIN, Role.SUPER_ADMIN]);
  const { id } = await (ctx as Ctx).params;
  const body = UpdateCampaignRequest.parse(await req.json());
  return ok({ campaign: await updateCampaign(organizationId, id, body) });
});

export const DELETE = handleRoute(async (req, ctx) => {
  const { principal, organizationId } = await withOutboundOrg(req);
  assertRole(principal, [Role.ORG_ADMIN, Role.SUPER_ADMIN]);
  const { id } = await (ctx as Ctx).params;
  return ok(await deleteCampaign(organizationId, id));
});
