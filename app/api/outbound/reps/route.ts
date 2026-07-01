import { handleRoute, ok } from "@server/platform/http/responses";
import { withOutboundOrg } from "@server/features/outbound/guard";
import { listReps } from "@server/features/outbound/reps.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The org's users — meeting owners / lead owners.
export const GET = handleRoute(async (req) => {
  const { organizationId } = await withOutboundOrg(req);
  return ok({ reps: await listReps(organizationId) });
});
