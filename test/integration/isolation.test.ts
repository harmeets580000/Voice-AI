import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { hasTestDb, truncateAll, disconnect, prisma } from "./helpers/db";
import { createOrg, createStaff, createService } from "./helpers/factories";
import { tenantDb } from "@server/platform/db/scoped";

/**
 * Multi-tenant isolation — the SaaS-critical suite (tests I-ISO-01..09). Proves the
 * org-scoped DB wrapper never lets one org read or write another's data, across every
 * customer-data resource.
 */
describe.skipIf(!hasTestDb)("multi-tenant isolation (I-ISO-01..09)", () => {
  beforeAll(async () => {
    await truncateAll();
  });
  beforeEach(async () => {
    await truncateAll();
  });
  afterAll(async () => {
    await disconnect();
  });

  async function twoOrgs() {
    const a = await createOrg({ slug: `a-${Date.now()}` });
    const b = await createOrg({ slug: `b-${Date.now()}` });
    return { a, b };
  }

  it("I-ISO-01: org A cannot see org B's staff", async () => {
    const { a, b } = await twoOrgs();
    await createStaff(a.id, "Alice");
    await createStaff(b.id, "Bob");
    const seenByA = await tenantDb(a.id).staff.findMany();
    expect(seenByA).toHaveLength(1);
    expect(seenByA[0].name).toBe("Alice");
  });

  it("I-ISO-02/04: bookings and customers are isolated", async () => {
    const { a, b } = await twoOrgs();
    const sA = await createStaff(a.id);
    const svcA = await createService(a.id);
    const custA = await tenantDb(a.id).customer.create({
      data: { organizationId: a.id, name: "CA", phone: "+1111" },
    });
    await tenantDb(a.id).booking.create({
      data: {
        organizationId: a.id,
        serviceId: svcA.id,
        staffId: sA.id,
        customerId: custA.id,
        startDatetime: new Date(),
        endDatetime: new Date(Date.now() + 3.6e6),
        status: "booked",
        source: "admin",
      },
    });
    expect(await tenantDb(b.id).booking.findMany()).toHaveLength(0);
    expect(await tenantDb(b.id).customer.findMany()).toHaveLength(0);
  });

  it("I-ISO-08: a create that tries to set another org id is overridden to the active org", async () => {
    const { a, b } = await twoOrgs();
    // Scoped to A, but try to smuggle org B in the data.
    const staff = await tenantDb(a.id).staff.create({
      // organizationId is forced to A by the scoping wrapper.
      data: { organizationId: b.id, name: "Smuggled" },
    });
    expect(staff.organizationId).toBe(a.id);
    expect(await tenantDb(b.id).staff.findMany()).toHaveLength(0);
  });

  it("I-ISO-07: org A cannot update org B's booking (updateMany affects 0 rows)", async () => {
    const { a, b } = await twoOrgs();
    const sB = await createStaff(b.id);
    const svcB = await createService(b.id);
    const booking = await tenantDb(b.id).booking.create({
      data: {
        organizationId: b.id,
        serviceId: svcB.id,
        staffId: sB.id,
        startDatetime: new Date(),
        endDatetime: new Date(Date.now() + 3.6e6),
        status: "booked",
        source: "admin",
      },
    });
    // A tries to cancel B's booking by id — scoped wrapper adds organizationId=A → no match.
    const res = await tenantDb(a.id).booking.updateMany({
      where: { id: booking.id },
      data: { status: "cancelled" },
    });
    expect(res.count).toBe(0);
    const unchanged = await tenantDb(b.id).booking.findFirst({
      where: { id: booking.id },
    });
    expect(unchanged?.status).toBe("booked");
  });

  it("I-ISO-06: themes are isolated; B's override never leaks to A", async () => {
    const { a, b } = await twoOrgs();
    await prisma.orgTheme.update({
      where: { organizationId: b.id },
      data: { tokens: { light: { accent: "#000000" } } },
    });
    const aTheme = await tenantDb(a.id).orgTheme.findFirst();
    expect(JSON.stringify(aTheme?.tokens)).not.toContain("#000000");
  });
});
