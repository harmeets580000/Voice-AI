import { handleRoute, ok } from "@server/platform/http/responses";
import { assertRole } from "@server/platform/auth/rbac";
import { Role } from "@domain/enums";
import { withOutboundOrg } from "@server/features/outbound/guard";
import { launchCampaign } from "@server/features/outbound/campaign.launch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// Launch (stub): generate QUEUED OutboundCalls in batches. Over-cap is rejected. Admin only.
export const POST = handleRoute(async (req, ctx) => {
  const { principal, organizationId } = await withOutboundOrg(req);
  assertRole(principal, [Role.ORG_ADMIN, Role.SUPER_ADMIN]);
  const { id } = await (ctx as Ctx).params;
  return ok(await launchCampaign(organizationId, id));
});
