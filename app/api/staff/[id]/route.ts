import { z } from "zod";
import { handleRoute, ok } from "@server/platform/http/responses";
import { withRequiredOrg } from "@server/platform/auth/context";
import { assertRole } from "@server/platform/auth/rbac";
import { Role } from "@domain/enums";
import { updateStaff, deleteStaff } from "@server/features/staff/staff.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const UpdateStaff = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  title: z.string().optional(),
  isActive: z.boolean().optional(),
  serviceIds: z.array(z.string()).optional(),
});

export const PATCH = handleRoute(async (req, ctx) => {
  const { principal, organizationId } = await withRequiredOrg(req);
  assertRole(principal, [Role.ORG_ADMIN, Role.SUPER_ADMIN]);
  const { id } = await (ctx as Ctx).params;
  const body = UpdateStaff.parse(await req.json());
  return ok({ staff: await updateStaff(organizationId, id, body) });
});

export const DELETE = handleRoute(async (req, ctx) => {
  const { principal, organizationId } = await withRequiredOrg(req);
  assertRole(principal, [Role.ORG_ADMIN, Role.SUPER_ADMIN]);
  const { id } = await (ctx as Ctx).params;
  return ok(await deleteStaff(organizationId, id));
});
