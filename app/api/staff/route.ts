import { z } from "zod";
import { handleRoute, ok, created } from "@server/platform/http/responses";
import { withRequiredOrg } from "@server/platform/auth/context";
import { assertRole } from "@server/platform/auth/rbac";
import { Role } from "@domain/enums";
import { listStaff, createStaff } from "@server/features/staff/staff.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CreateStaff = z.object({
  name: z.string().min(1),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  title: z.string().optional(),
});

export const GET = handleRoute(async (req) => {
  const { organizationId } = await withRequiredOrg(req);
  return ok({ staff: await listStaff(organizationId) });
});

export const POST = handleRoute(async (req) => {
  const { principal, organizationId } = await withRequiredOrg(req);
  assertRole(principal, [Role.ORG_ADMIN, Role.SUPER_ADMIN]);
  const body = CreateStaff.parse(await req.json());
  return created({ staff: await createStaff(organizationId, body) });
});
