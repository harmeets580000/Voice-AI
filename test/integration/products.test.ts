import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { hasTestDb, truncateAll, disconnect } from "./helpers/db";
import { createOrg } from "./helpers/factories";
import {
  listOrgProducts,
  isProductEnabled,
  setProduct,
} from "@server/platform/registry/registry.service";
import { ProductKey, OrgProductStatus } from "@domain/enums";

/**
 * Product registry (Product 2 §A, tests P2-Q0). Proves the per-org enablement that gates the
 * Outbound Sales module: sensible defaults, enable/disable without data loss, and org isolation.
 * (P2-Q0-02 — org_staff cannot toggle — is enforced by `assertRole` in the PUT route.)
 */
describe.skipIf(!hasTestDb)("product registry (P2-Q0)", () => {
  beforeAll(async () => {
    await truncateAll();
  });
  beforeEach(async () => {
    await truncateAll();
  });
  afterAll(async () => {
    await disconnect();
  });

  it("defaults: base product on, OUTBOUND_SALES off", async () => {
    const org = await createOrg();
    const products = await listOrgProducts(org.id);
    const outbound = products.find(
      (p) => p.product === ProductKey.OUTBOUND_SALES,
    );
    expect(outbound?.status).toBe(OrgProductStatus.INACTIVE);
    expect(await isProductEnabled(org.id, ProductKey.OUTBOUND_SALES)).toBe(false);
    expect(await isProductEnabled(org.id, ProductKey.AI_RECEPTIONIST)).toBe(true);
  });

  it("P2-Q0-01: enable then disable — status flips, enablement history is kept", async () => {
    const org = await createOrg();

    await setProduct(org.id, ProductKey.OUTBOUND_SALES, OrgProductStatus.ACTIVE);
    expect(await isProductEnabled(org.id, ProductKey.OUTBOUND_SALES)).toBe(true);
    const enabled = (await listOrgProducts(org.id)).find(
      (p) => p.product === ProductKey.OUTBOUND_SALES,
    );
    expect(enabled?.status).toBe(OrgProductStatus.ACTIVE);
    expect(enabled?.enabledAt).not.toBeNull();

    await setProduct(
      org.id,
      ProductKey.OUTBOUND_SALES,
      OrgProductStatus.INACTIVE,
    );
    expect(await isProductEnabled(org.id, ProductKey.OUTBOUND_SALES)).toBe(false);
    const disabled = (await listOrgProducts(org.id)).find(
      (p) => p.product === ProductKey.OUTBOUND_SALES,
    );
    expect(disabled?.status).toBe(OrgProductStatus.INACTIVE);
    // enabledAt is retained as history — the toggle only changes status, it doesn't wipe data.
    expect(disabled?.enabledAt).not.toBeNull();
  });

  it("P2-Q0-03: product enablement is org-scoped (no cross-org leak)", async () => {
    const a = await createOrg({ slug: `a-${Date.now()}` });
    const b = await createOrg({ slug: `b-${Date.now()}` });
    await setProduct(a.id, ProductKey.OUTBOUND_SALES, OrgProductStatus.ACTIVE);
    expect(await isProductEnabled(a.id, ProductKey.OUTBOUND_SALES)).toBe(true);
    expect(await isProductEnabled(b.id, ProductKey.OUTBOUND_SALES)).toBe(false);
    const bProducts = await listOrgProducts(b.id);
    expect(
      bProducts.find((p) => p.product === ProductKey.OUTBOUND_SALES)?.status,
    ).toBe(OrgProductStatus.INACTIVE);
  });
});
