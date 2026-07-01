import { handleRoute, ok } from "@server/platform/http/responses";
import { assertRole } from "@server/platform/auth/rbac";
import { Role } from "@domain/enums";
import { withOutboundOrg } from "@server/features/outbound/guard";
import { createManualLead } from "@server/features/outbound/lead-intake.service";
import { ManualLeadRequest } from "@contracts/outbound-lead-intake";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Manual "New lead" form → upserts a contact then creates a lead (or routes to an existing
// open lead). Reps + admins.
export const POST = handleRoute(async (req) => {
  const { principal, organizationId } = await withOutboundOrg(req);
  assertRole(principal, [Role.ORG_ADMIN, Role.ORG_STAFF, Role.SUPER_ADMIN]);
  const body = ManualLeadRequest.parse(await req.json());
  return ok(await createManualLead(organizationId, body, principal.userId));
});
