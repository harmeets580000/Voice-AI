import { handleRoute, ok, created } from "@server/platform/http/responses";
import { assertRole } from "@server/platform/auth/rbac";
import { Role } from "@domain/enums";
import { withOutboundOrg } from "@server/features/outbound/guard";
import {
  listCampaigns,
  createCampaign,
} from "@server/features/outbound/campaigns.service";
import { CreateCampaignRequest } from "@contracts/outbound-campaigns";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handleRoute(async (req) => {
  const { organizationId } = await withOutboundOrg(req);
  const campaigns = await listCampaigns(organizationId);
  return ok({
    campaigns: campaigns.map((c) => ({
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
      memberCount: c._count.members,
    })),
  });
});

// Creating/editing/launching campaigns is admin-only (reps can view).
export const POST = handleRoute(async (req) => {
  const { principal, organizationId } = await withOutboundOrg(req);
  assertRole(principal, [Role.ORG_ADMIN, Role.SUPER_ADMIN]);
  const body = CreateCampaignRequest.parse(await req.json());
  return created({ campaign: await createCampaign(organizationId, body) });
});
