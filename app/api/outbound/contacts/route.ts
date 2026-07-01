import { handleRoute, ok, created } from "@server/platform/http/responses";
import { assertRole } from "@server/platform/auth/rbac";
import { Role } from "@domain/enums";
import { withOutboundOrg } from "@server/features/outbound/guard";
import {
  listContacts,
  createContact,
} from "@server/features/outbound/contacts.service";
import { CreateContactRequest } from "@contracts/outbound-contacts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WRITE_ROLES = [Role.ORG_ADMIN, Role.ORG_STAFF, Role.SUPER_ADMIN];

export const GET = handleRoute(async (req) => {
  const { organizationId } = await withOutboundOrg(req);
  const url = new URL(req.url);
  const tagsParam = url.searchParams.get("tags");
  const optOutParam = url.searchParams.get("optOut");
  return ok({
    contacts: await listContacts(organizationId, {
      search: url.searchParams.get("search") ?? undefined,
      source: url.searchParams.get("source") ?? undefined,
      tags: tagsParam ? tagsParam.split(",").filter(Boolean) : undefined,
      optOut: optOutParam === null ? undefined : optOutParam === "true",
    }),
  });
});

export const POST = handleRoute(async (req) => {
  const { principal, organizationId } = await withOutboundOrg(req);
  assertRole(principal, WRITE_ROLES);
  const body = CreateContactRequest.parse(await req.json());
  return created({ contact: await createContact(organizationId, body) });
});
