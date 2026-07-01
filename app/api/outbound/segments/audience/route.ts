import { handleRoute, ok } from "@server/platform/http/responses";
import { withOutboundOrg } from "@server/features/outbound/guard";
import { countAudience } from "@server/features/outbound/segments.service";
import { AudienceCountRequest } from "@contracts/outbound-segments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Live audience count for a filter (opt-out always excluded). Drives the campaign wizard's
// "N contacts" count and the segment preview.
export const POST = handleRoute(async (req) => {
  const { organizationId } = await withOutboundOrg(req);
  const body = AudienceCountRequest.parse(await req.json());
  return ok({ count: await countAudience(organizationId, body.filter) });
});
