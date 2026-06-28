import { z } from "zod";
import { handleRoute, ok, created } from "@server/platform/http/responses";
import { withRequiredOrg } from "@server/platform/auth/context";
import { assertRole } from "@server/platform/auth/rbac";
import { Role } from "@domain/enums";
import {
  listCustomers,
  createCustomer,
} from "@server/features/customers/customers.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CreateCustomer = z
  .object({
    name: z.string().optional(),
    phone: z.string().optional(),
    email: z.string().email().optional(),
  })
  .refine((v) => v.name || v.phone || v.email, {
    message: "Provide at least a name, phone, or email",
  });

export const GET = handleRoute(async (req) => {
  const { organizationId } = await withRequiredOrg(req);
  const search = new URL(req.url).searchParams.get("q") ?? undefined;
  return ok({ customers: await listCustomers(organizationId, search) });
});

export const POST = handleRoute(async (req) => {
  const { principal, organizationId } = await withRequiredOrg(req);
  assertRole(principal, [Role.ORG_ADMIN, Role.ORG_STAFF, Role.SUPER_ADMIN]);
  const body = CreateCustomer.parse(await req.json());
  return created({ customer: await createCustomer(organizationId, body) });
});
