import { handleRoute, ok } from "@server/platform/http/responses";
import { assertRole } from "@server/platform/auth/rbac";
import { Role } from "@domain/enums";
import { withOutboundOrg } from "@server/features/outbound/guard";
import { importContacts } from "@server/features/outbound/contacts.service";
import { ImportContactsRequest } from "@contracts/outbound-contacts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// CSV contact import (rows already parsed + column-mapped on the client). Reps + admins.
export const POST = handleRoute(async (req) => {
  const { principal, organizationId } = await withOutboundOrg(req);
  assertRole(principal, [Role.ORG_ADMIN, Role.ORG_STAFF, Role.SUPER_ADMIN]);
  const body = ImportContactsRequest.parse(await req.json());
  return ok({
    summary: await importContacts(organizationId, {
      filename: body.filename,
      mapping: body.mapping,
      rows: body.rows,
    }),
  });
});
