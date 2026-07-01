import { handleRoute, ok } from "@server/platform/http/responses";
import { withRequiredOrg } from "@server/platform/auth/context";
import { listOrgProducts } from "@server/platform/registry/registry.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// List the enabled/disabled products for the active org. Any authenticated org member may
// read this (it drives nav gating); toggling is admin-only (see [key]/route.ts).
export const GET = handleRoute(async (req) => {
  const { organizationId } = await withRequiredOrg(req);
  return ok({ products: await listOrgProducts(organizationId) });
});
