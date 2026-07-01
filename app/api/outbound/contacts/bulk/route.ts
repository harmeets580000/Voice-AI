import { handleRoute, ok } from "@server/platform/http/responses";
import { assertRole } from "@server/platform/auth/rbac";
import { AppError } from "@server/platform/http/errors";
import { Role } from "@domain/enums";
import { withOutboundOrg } from "@server/features/outbound/guard";
import {
  setContactsOptOut,
  addTagToContacts,
  deleteContact,
} from "@server/features/outbound/contacts.service";
import { bulkPromoteToLeads } from "@server/features/outbound/leads.service";
import { BulkContactRequest } from "@contracts/outbound-contacts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Bulk actions from the Contacts list. Delete is admin-only; the rest are reps + admins.
export const POST = handleRoute(async (req) => {
  const { principal, organizationId } = await withOutboundOrg(req);
  const body = BulkContactRequest.parse(await req.json());

  if (body.action === "delete") {
    assertRole(principal, [Role.ORG_ADMIN, Role.SUPER_ADMIN]);
    let deleted = 0;
    for (const id of body.ids) {
      deleted += (await deleteContact(organizationId, id)).deleted;
    }
    return ok({ deleted });
  }

  assertRole(principal, [Role.ORG_ADMIN, Role.ORG_STAFF, Role.SUPER_ADMIN]);
  switch (body.action) {
    case "opt_out":
      return ok(
        await setContactsOptOut(organizationId, body.ids, true, body.reason),
      );
    case "opt_in":
      return ok(await setContactsOptOut(organizationId, body.ids, false));
    case "add_tag":
      if (!body.tag) throw AppError.badRequest("tag is required for add_tag");
      return ok(await addTagToContacts(organizationId, body.ids, body.tag));
    case "promote":
      return ok(
        await bulkPromoteToLeads(organizationId, body.ids, principal.userId),
      );
    default:
      throw AppError.badRequest(`Unsupported bulk action: ${body.action}`);
  }
});
