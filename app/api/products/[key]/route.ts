import { z } from "zod";
import { handleRoute, ok } from "@server/platform/http/responses";
import { withRequiredOrg } from "@server/platform/auth/context";
import { assertRole } from "@server/platform/auth/rbac";
import { Role } from "@domain/enums";
import { ProductKeySchema, OrgProductStatusSchema } from "@contracts/products";
import { setProduct } from "@server/platform/registry/registry.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ key: string }> };

const Body = z.object({ status: OrgProductStatusSchema });

// Enable/disable a product for the active org (org_admin / super_admin only).
export const PUT = handleRoute(async (req, ctx) => {
  const { principal, organizationId } = await withRequiredOrg(req);
  assertRole(principal, [Role.ORG_ADMIN, Role.SUPER_ADMIN]);
  const { key } = await (ctx as Ctx).params;
  const product = ProductKeySchema.parse(key);
  const body = Body.parse(await req.json());
  return ok({ product: await setProduct(organizationId, product, body.status) });
});
