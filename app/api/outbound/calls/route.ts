import { handleRoute, ok, created } from "@server/platform/http/responses";
import { assertRole } from "@server/platform/auth/rbac";
import { Role } from "@domain/enums";
import { withOutboundOrg } from "@server/features/outbound/guard";
import {
  listOutboundCalls,
  placeOneOffCall,
} from "@server/features/outbound/outbound-call.service";
import { PlaceCallRequest } from "@contracts/outbound-calls";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handleRoute(async (req) => {
  const { organizationId } = await withOutboundOrg(req);
  const url = new URL(req.url);
  return ok({
    calls: await listOutboundCalls(organizationId, {
      status: url.searchParams.get("status") ?? undefined,
      leadId: url.searchParams.get("leadId") ?? undefined,
      contactId: url.searchParams.get("contactId") ?? undefined,
    }),
  });
});

// Place a one-off stub call. Reps + admins. Opted-out contacts are hard-blocked server-side.
export const POST = handleRoute(async (req) => {
  const { principal, organizationId } = await withOutboundOrg(req);
  assertRole(principal, [Role.ORG_ADMIN, Role.ORG_STAFF, Role.SUPER_ADMIN]);
  const body = PlaceCallRequest.parse(await req.json());
  return created({
    call: await placeOneOffCall(
      organizationId,
      {
        contactId: body.contactId,
        leadId: body.leadId,
        agentId: body.agentId,
      },
      principal.userId,
    ),
  });
});
