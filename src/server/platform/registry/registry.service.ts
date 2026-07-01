/**
 * Product registry — which products (modules) an organization has enabled. This is the
 * single gate that reveals the Outbound Sales (Product 2) nav + guards its routes.
 *
 * Storage: one `OrgProduct` row per (org, product) that has been explicitly toggled.
 * Absence of a row = the product default: AI_RECEPTIONIST is the always-on base product,
 * OUTBOUND_SALES is opt-in (off until enabled). Org-scoped via `tenantDb`.
 */

import { tenantDb } from "@server/platform/db/scoped";
import { AppError } from "@server/platform/http/errors";
import { ProductKey, OrgProductStatus } from "@domain/enums";

/** Every product the registry knows about (drives the products list + toggles). */
export const ALL_PRODUCTS: ProductKey[] = [
  ProductKey.AI_RECEPTIONIST,
  ProductKey.OUTBOUND_SALES,
];

/** Default status for a product with no explicit row. */
function defaultStatus(product: ProductKey): OrgProductStatus {
  return product === ProductKey.AI_RECEPTIONIST
    ? OrgProductStatus.ACTIVE
    : OrgProductStatus.INACTIVE;
}

export interface OrgProductView {
  product: ProductKey;
  status: OrgProductStatus;
  enabledAt: string | null;
}

/** The full product list for an org, merging stored rows with per-product defaults. */
export async function listOrgProducts(orgId: string): Promise<OrgProductView[]> {
  const rows = await tenantDb(orgId).orgProduct.findMany();
  const byKey = new Map(rows.map((r) => [r.product as ProductKey, r]));
  return ALL_PRODUCTS.map((product) => {
    const row = byKey.get(product);
    return {
      product,
      status: (row?.status as OrgProductStatus) ?? defaultStatus(product),
      enabledAt: row?.enabledAt ? row.enabledAt.toISOString() : null,
    };
  });
}

/** Is a product active for this org? Base product defaults on; others default off. */
export async function isProductEnabled(
  orgId: string,
  key: ProductKey,
): Promise<boolean> {
  const row = await tenantDb(orgId).orgProduct.findFirst({
    where: { product: key },
  });
  if (row) return row.status === OrgProductStatus.ACTIVE;
  return defaultStatus(key) === OrgProductStatus.ACTIVE;
}

/** Throws 403 unless the product is enabled — the guard Outbound routes use. */
export async function assertProductEnabled(
  orgId: string,
  key: ProductKey,
): Promise<void> {
  if (!(await isProductEnabled(orgId, key))) {
    throw AppError.forbidden(`Product ${key} is not enabled for this organization`);
  }
}

/** Enable/disable a product for an org (upsert without Prisma upsert to keep scoping clean). */
export async function setProduct(
  orgId: string,
  product: ProductKey,
  status: OrgProductStatus,
): Promise<OrgProductView> {
  const db = tenantDb(orgId);
  const existing = await db.orgProduct.findFirst({ where: { product } });
  // Stamp enabledAt the first time it goes active; keep the historical value thereafter.
  const enabledAt =
    status === OrgProductStatus.ACTIVE
      ? (existing?.enabledAt ?? new Date())
      : (existing?.enabledAt ?? null);

  const row = existing
    ? await db.orgProduct.update({
        where: { id: existing.id },
        data: { status, enabledAt },
      })
    : await db.orgProduct.create({
        data: { organizationId: orgId, product, status, enabledAt },
      });

  return {
    product: row.product as ProductKey,
    status: row.status as OrgProductStatus,
    enabledAt: row.enabledAt ? row.enabledAt.toISOString() : null,
  };
}
