import { handleRoute, ok } from "@server/platform/http/responses";
import { assertRole } from "@server/platform/auth/rbac";
import { Role } from "@domain/enums";
import { withOutboundOrg } from "@server/features/outbound/guard";
import { setCampaignStatus } from "@server/features/outbound/campaigns.service";
import { CampaignStatusRequest } from "@contracts/outbound-campaigns";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// Pause / Resume / Cancel. Admin only.
export const PUT = handleRoute(async (req, ctx) => {
  const { principal, organizationId } = await withOutboundOrg(req);
  assertRole(principal, [Role.ORG_ADMIN, Role.SUPER_ADMIN]);
  const { id } = await (ctx as Ctx).params;
  const body = CampaignStatusRequest.parse(await req.json());
  return ok({
    campaign: await setCampaignStatus(organizationId, id, body.status),
  });
});
