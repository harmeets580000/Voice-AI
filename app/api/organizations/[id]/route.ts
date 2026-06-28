import { handleRoute, ok } from "@server/platform/http/responses";
import { UpdateOrgRequest } from "@contracts/organizations";
import { requireRole } from "@server/platform/auth/context";
import { Role } from "@domain/enums";
import {
  getOrganization,
  updateOrganization,
} from "@server/features/organizations/organizations.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handleRoute(async (_req, ctx) => {
  await requireRole([Role.SUPER_ADMIN]);
  const { id } = await (ctx as Ctx).params;
  return ok({ organization: await getOrganization(id) });
});

export const PATCH = handleRoute(async (req, ctx) => {
  await requireRole([Role.SUPER_ADMIN]);
  const { id } = await (ctx as Ctx).params;
  const body = UpdateOrgRequest.parse(await req.json());
  return ok({ organization: await updateOrganization(id, body) });
});
