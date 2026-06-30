import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { hasTestDb, truncateAll, disconnect, prisma } from "./helpers/db";
import { createReadyOrg, createService } from "./helpers/factories";
import {
  getAvailability,
  autoAssignAndBook,
  confirmBooking,
  completeBooking,
  markNoShow,
} from "@server/features/bookings/booking.engine";
import { setStaffServices } from "@server/features/staff/staff.service";
import { setEmailProvider } from "@server/config/providers";
import { FakeEmailProvider } from "@server/adapters/email/fake/fake.email";
import { DateTime } from "luxon";

function nextMonday10(tz = "America/Los_Angeles") {
  let d = DateTime.now().setZone(tz).startOf("day");
  while (d.weekday !== 1) d = d.plus({ days: 1 });
  d = d.plus({ weeks: 1 }).set({ hour: 10 });
  return { date: d.toISODate()!, start: d.toJSDate() };
}

describe.skipIf(!hasTestDb)("booking lifecycle + confirmation email", () => {
  beforeEach(async () => {
    await truncateAll();
    setEmailProvider(new FakeEmailProvider());
  });
  afterAll(async () => {
    await disconnect();
  });

  it("new bookings are created as pending, and a pending booking reserves the slot", async () => {
    const { org, service } = await createReadyOrg(60); // one staff
    const { date, start } = nextMonday10(org.timezone);

    const booking = await autoAssignAndBook(org.id, { serviceId: service.id, startDatetime: start });
    expect(booking.status).toBe("pending");

    // The single staff member is now reserved → the same slot is no longer offered…
    const after = await getAvailability(org.id, service.id, date);
    expect(after.some((s) => s.start.getTime() === start.getTime())).toBe(false);
    // …and a second attempt for that slot is rejected.
    await expect(
      autoAssignAndBook(org.id, { serviceId: service.id, startDatetime: start }),
    ).rejects.toThrow();
  });

  it("confirming a booking sets it confirmed and emails the customer", async () => {
    const fake = new FakeEmailProvider();
    setEmailProvider(fake);
    const { org, service } = await createReadyOrg(60);
    const { start } = nextMonday10(org.timezone);
    const customer = await prisma.customer.create({
      data: { organizationId: org.id, name: "Pat", email: "pat@example.com" },
    });

    const booking = await autoAssignAndBook(org.id, {
      serviceId: service.id,
      startDatetime: start,
      customerId: customer.id,
    });
    const confirmed = await confirmBooking(org.id, booking.id);
    expect(confirmed.status).toBe("confirmed");
    expect(fake.sent).toHaveLength(1);
    expect(fake.sent[0].to).toBe("pat@example.com");

    // complete + no_show transitions work too.
    const completed = await completeBooking(org.id, booking.id);
    expect(completed.status).toBe("completed");
    const noShow = await markNoShow(org.id, booking.id);
    expect(noShow.status).toBe("no_show");
  });

  it("confirming without a customer email does not throw (just skips the send)", async () => {
    const fake = new FakeEmailProvider();
    setEmailProvider(fake);
    const { org, service } = await createReadyOrg(60);
    const { start } = nextMonday10(org.timezone);
    const booking = await autoAssignAndBook(org.id, { serviceId: service.id, startDatetime: start });
    const confirmed = await confirmBooking(org.id, booking.id);
    expect(confirmed.status).toBe("confirmed");
    expect(fake.sent).toHaveLength(0);
  });

  it("availability is restricted to staff who can deliver the service (no binding = all)", async () => {
    const { org, staff, service } = await createReadyOrg(60); // staff has weekday schedule
    const { date, start } = nextMonday10(org.timezone);
    const other = await createService(org.id, 60); // a different service

    // Bind the only staff member to `other` ONLY → they can't deliver `service`.
    await setStaffServices(org.id, staff.id, [other.id]);
    const none = await getAvailability(org.id, service.id, date);
    expect(none.some((s) => s.start.getTime() === start.getTime())).toBe(false);

    // Bind them to `service` too → the slot comes back.
    await setStaffServices(org.id, staff.id, [other.id, service.id]);
    const withCap = await getAvailability(org.id, service.id, date);
    expect(withCap.some((s) => s.start.getTime() === start.getTime())).toBe(true);

    // Clearing all bindings = unrestricted (can do all) → still available.
    await setStaffServices(org.id, staff.id, []);
    const unrestricted = await getAvailability(org.id, service.id, date);
    expect(unrestricted.some((s) => s.start.getTime() === start.getTime())).toBe(true);
  });
});
