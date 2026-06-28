import { z } from "zod";
import { handleRoute, ok, created } from "@server/platform/http/responses";
import { withRequiredOrg } from "@server/platform/auth/context";
import { assertRole } from "@server/platform/auth/rbac";
import { Role } from "@domain/enums";
import {
  listServices,
  createService,
} from "@server/features/services/services.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CreateService = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  durationMinutes: z.number().int().positive(),
  price: z.number().nonnegative().optional(),
});

export const GET = handleRoute(async (req) => {
  const { organizationId } = await withRequiredOrg(req);
  return ok({ services: await listServices(organizationId) });
});

export const POST = handleRoute(async (req) => {
  const { principal, organizationId } = await withRequiredOrg(req);
  assertRole(principal, [Role.ORG_ADMIN, Role.SUPER_ADMIN]);
  const body = CreateService.parse(await req.json());
  return created({ service: await createService(organizationId, body) });
});
