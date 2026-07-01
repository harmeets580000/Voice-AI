import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { hasTestDb, truncateAll, disconnect } from "./helpers/db";
import { createOrg } from "./helpers/factories";
import { tenantDb } from "@server/platform/db/scoped";
import {
  createContact,
  importContacts,
  listContacts,
} from "@server/features/outbound/contacts.service";
import {
  createSegment,
  resolveSegmentAudience,
  resolveAudience,
} from "@server/features/outbound/segments.service";

/**
 * Outbound contacts + CSV import + segments (Product 2 §B, tests P2-Q1). Proves dedupe/validation
 * on import, saved-segment resolution, opt-out exclusion from audiences, and org isolation.
 */
describe.skipIf(!hasTestDb)("outbound contacts & segments (P2-Q1)", () => {
  beforeAll(async () => {
    await truncateAll();
  });
  beforeEach(async () => {
    await truncateAll();
  });
  afterAll(async () => {
    await disconnect();
  });

  it("P2-Q1-01: CSV import dedupes (existing + in-file) and skips invalid rows", async () => {
    const org = await createOrg();
    await createContact(org.id, { name: "Existing", phone: "+15550001" });

    const summary = await importContacts(org.id, {
      filename: "contacts.csv",
      rows: [
        { name: "New A", phone: "+15550002" },
        { name: "Dup of existing", phone: "+15550001" },
        { name: "", phone: "", email: "" },
        { name: "New B", email: "b@example.com" },
        { name: "In-file dup", phone: "+15550002" },
      ],
    });

    expect(summary.total).toBe(5);
    expect(summary.imported).toBe(2);
    expect(summary.skipped).toBe(3);
    expect(summary.errors).toHaveLength(3);

    const imports = await tenantDb(org.id).contactImport.findMany();
    expect(imports).toHaveLength(1);
    expect(imports[0].importedRows).toBe(2);
    expect(imports[0].skippedRows).toBe(3);
    // 1 pre-existing + 2 imported = 3 contacts total.
    expect(await listContacts(org.id)).toHaveLength(3);
  });

  it("P2-Q1-02: a saved segment resolves to its matching audience", async () => {
    const org = await createOrg();
    await createContact(org.id, { name: "Warm", phone: "+1", tags: ["warm"] });
    await createContact(org.id, { name: "Cold", phone: "+2", tags: ["cold"] });

    const seg = await createSegment(org.id, {
      name: "Warm leads",
      filter: { tags: ["warm"] },
    });
    const audience = await resolveSegmentAudience(org.id, seg.id);
    expect(audience).toHaveLength(1);
    expect(audience[0].name).toBe("Warm");
  });

  it("P2-Q1-03: opted-out contacts never enter an audience", async () => {
    const org = await createOrg();
    await createContact(org.id, { name: "A", phone: "+1", tags: ["warm"] });
    const opted = await createContact(org.id, {
      name: "B",
      phone: "+2",
      tags: ["warm"],
      optOut: true,
    });

    const audience = await resolveAudience(org.id, { tags: ["warm"] });
    expect(audience).toHaveLength(1);
    expect(audience.map((c) => c.id)).not.toContain(opted.id);
  });

  it("P2-Q1-04: contacts are org-scoped", async () => {
    const a = await createOrg({ slug: `a-${Date.now()}` });
    const b = await createOrg({ slug: `b-${Date.now()}` });
    await createContact(a.id, { name: "A only", phone: "+1" });
    expect(await listContacts(a.id)).toHaveLength(1);
    expect(await listContacts(b.id)).toHaveLength(0);
  });
});
