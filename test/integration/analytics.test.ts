import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { Prisma } from "@prisma/client";
import { hasTestDb, truncateAll, disconnect, prisma } from "./helpers/db";
import { createOrg } from "./helpers/factories";
import {
  getOrgDashboard,
  getPlatformDashboard,
} from "@server/features/analytics/analytics.service";

describe.skipIf(!hasTestDb)("dashboard analytics", () => {
  beforeEach(async () => {
    await truncateAll();
  });
  afterAll(async () => {
    await disconnect();
  });

  async function seedOrg(opts: { calls: number; bookings: number; price: number }) {
    const org = await createOrg();
    const service = await prisma.service.create({
      data: {
        organizationId: org.id,
        name: "Cut",
        durationMinutes: 30,
        price: new Prisma.Decimal(opts.price),
      },
    });
    const start = new Date(Date.now() + 86_400_000); // tomorrow → also tests "upcoming"
    for (let i = 0; i < opts.bookings; i++) {
      await prisma.booking.create({
        data: {
          organizationId: org.id,
          serviceId: service.id,
          status: "booked",
          source: "phone",
          startDatetime: start,
          endDatetime: new Date(start.getTime() + 30 * 60_000),
        },
      });
    }
    for (let i = 0; i < opts.calls; i++) {
      await prisma.call.create({
        data: {
          organizationId: org.id,
          vapiCallId: `${org.id}-call-${i}`,
          direction: "inbound",
        },
      });
    }
    return org;
  }

  it("org dashboard counts only that org's data (isolation)", async () => {
    const a = await seedOrg({ calls: 3, bookings: 2, price: 50 });
    await seedOrg({ calls: 9, bookings: 9, price: 999 }); // org B = noise

    const d = await getOrgDashboard(a.id, "30d");
    expect(d.scope).toBe("org");
    expect(d.kpis.calls.value).toBe(3);
    expect(d.kpis.bookings.value).toBe(2);
    expect(d.kpis.revenue.value).toBe(100); // 2 × $50
    expect(d.byStatus.find((s) => s.key === "booked")?.count).toBe(2);
    expect(d.upcoming.length).toBe(2);
  });

  it("platform dashboard aggregates across orgs and lists each", async () => {
    const a = await seedOrg({ calls: 3, bookings: 2, price: 50 });
    const b = await seedOrg({ calls: 1, bookings: 1, price: 20 });

    const d = await getPlatformDashboard("30d");
    expect(d.scope).toBe("platform");
    expect(d.kpis.orgs).toBe(2);
    expect(d.kpis.calls.value).toBe(4);
    expect(d.kpis.bookings.value).toBe(3);
    expect(d.kpis.revenue.value).toBe(120);
    const rowA = d.orgs.find((o) => o.id === a.id);
    expect(rowA?.calls).toBe(3);
    expect(rowA?.revenue).toBe(100);
    expect(d.orgs.map((o) => o.id)).toContain(b.id);
  });
});
