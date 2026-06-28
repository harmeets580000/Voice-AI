import { handleRoute, ok, created } from "@server/platform/http/responses";
import {
  CreateOrgRequest,
  type OrgListResponse,
  type CreateOrgResponse,
} from "@contracts/organizations";
import { requireAuth, requireRole } from "@server/platform/auth/context";
import { prisma } from "@server/platform/db/client";
import { Role } from "@domain/enums";
import { createOrganization } from "@server/features/organizations/organizations.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** List organizations. Super-admin → all (for the switcher); org user → their own. */
export const GET = handleRoute(async () => {
  const principal = await requireAuth();
  const where =
    principal.role === Role.SUPER_ADMIN
      ? {}
      : { id: principal.organizationId ?? "__none__" };
  const orgs = await prisma.organization.findMany({
    where,
    select: { id: true, name: true, slug: true, status: true },
    orderBy: { name: "asc" },
  });
  const res: OrgListResponse = { organizations: orgs };
  return ok(res);
});

/** Create + onboard an organization (super-admin only). */
export const POST = handleRoute(async (req) => {
  await requireRole([Role.SUPER_ADMIN]);
  const body = CreateOrgRequest.parse(await req.json());
  const { organization, tempPassword } = await createOrganization(body);
  const res: CreateOrgResponse = { organization, tempPassword };
  return created(res);
});
