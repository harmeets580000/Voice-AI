/**
 * Shared entry guard for Outbound Sales (Product 2) route handlers: resolves the active org
 * (like withRequiredOrg) AND asserts the OUTBOUND_SALES product is enabled for it — so every
 * outbound API returns 403 when the module is disabled. RBAC (assertRole) is applied per-route.
 */

import { withRequiredOrg } from "@server/platform/auth/context";
import { assertProductEnabled } from "@server/platform/registry/registry.service";
import { ProductKey } from "@domain/enums";
import type { Principal } from "@server/platform/auth/rbac";

export async function withOutboundOrg(
  req: Request,
): Promise<{ principal: Principal; organizationId: string }> {
  const ctx = await withRequiredOrg(req);
  await assertProductEnabled(ctx.organizationId, ProductKey.OUTBOUND_SALES);
  return ctx;
}
