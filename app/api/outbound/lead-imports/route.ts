import { handleRoute, ok } from "@server/platform/http/responses";
import { assertRole } from "@server/platform/auth/rbac";
import { Role } from "@domain/enums";
import { withOutboundOrg } from "@server/features/outbound/guard";
import { importLeads } from "@server/features/outbound/lead-intake.service";
import { ImportLeadsRequest } from "@contracts/outbound-lead-intake";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// CSV lead import → each row upserts a contact then creates a lead. Reps + admins.
export const POST = handleRoute(async (req) => {
  const { principal, organizationId } = await withOutboundOrg(req);
  assertRole(principal, [Role.ORG_ADMIN, Role.ORG_STAFF, Role.SUPER_ADMIN]);
  const body = ImportLeadsRequest.parse(await req.json());
  return ok({
    summary: await importLeads(
      organizationId,
      { filename: body.filename, mapping: body.mapping, rows: body.rows },
      principal.userId,
    ),
  });
});
