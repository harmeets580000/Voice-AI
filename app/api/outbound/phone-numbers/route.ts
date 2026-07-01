import { handleRoute, ok } from "@server/platform/http/responses";
import { withOutboundOrg } from "@server/features/outbound/guard";
import { listOrgVapiNumbers } from "@server/features/outbound/phone-numbers.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The org's phone numbers pulled live from the voice provider (Vapi), for the agent's
// from-number picker. Any authenticated org member may read them.
export const GET = handleRoute(async (req) => {
  const { organizationId } = await withOutboundOrg(req);
  return ok({ numbers: await listOrgVapiNumbers(organizationId) });
});
