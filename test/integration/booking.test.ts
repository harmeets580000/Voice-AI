import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { hasTestDb, truncateAll, disconnect } from "./helpers/db";
import { createReadyOrg, createStaff, createWeekdaySchedule } from "./helpers/factories";
import {
  getAvailability,
  autoAssignAndBook,
  cancelBooking,
} from "@server/features/bookings/booking.engine";
import { DateTime } from "luxon";

/** Next Monday 10:00 in the org tz, as an absolute Date + the ISO date string. */
function nextMonday10(tz = "America/Los_Angeles") {
  let d = DateTime.now().setZone(tz).startOf("day");
  while (d.weekday !== 1) d = d.plus({ days: 1 });
  d = d.plus({ weeks: 1 }).set({ hour: 10 });
  return { date: d.toISODate()!, start: d.toJSDate() };
}

describe.skipIf(!hasTestDb)("booking flow + double-booking guard (I-BOOK-14..17)", () => {
  beforeEach(async () => {
    await truncateAll();
  });
  afterAll(async () => {
    await disconnect();
  });

  it("I-BOOK-14: check availability → book → re-check shows the slot gone", async () => {
    const { org, service } = await createReadyOrg(60);
    const { date, start } = nextMonday10(org.timezone);

    const before = await getAvailability(org.id, service.id, date);
    expect(before.some((s) => s.start.getTime() === start.getTime())).toBe(true);

    await autoAssignAndBook(org.id, { serviceId: service.id, startDatetime: start });

    const after = await getAvailability(org.id, service.id, date);
    expect(after.some((s) => s.start.getTime() === start.getTime())).toBe(false);
  });

  it("I-BOOK-15: two concurrent books for the same slot → exactly one succeeds", async () => {
    const { org, service } = await createReadyOrg(60);
    const { start } = nextMonday10(org.timezone);

    const results = await Promise.allSettled([
      autoAssignAndBook(org.id, { serviceId: service.id, startDatetime: start }),
      autoAssignAndBook(org.id, { serviceId: service.id, startDatetime: start }),
    ]);
    const ok = results.filter((r) => r.status === "fulfilled");
    const failed = results.filter((r) => r.status === "rejected");
    expect(ok).toHaveLength(1);
    expect(failed).toHaveLength(1);
  });

  it("two staff → both can book the same slot (one each)", async () => {
    const { org, service, staff } = await createReadyOrg(60);
    const staff2 = await createStaff(org.id, "Second");
    await createWeekdaySchedule(org.id, staff2.id);
    const { start } = nextMonday10(org.timezone);

    const b1 = await autoAssignAndBook(org.id, { serviceId: service.id, startDatetime: start });
    const b2 = await autoAssignAndBook(org.id, { serviceId: service.id, startDatetime: start });
    expect(new Set([b1.staffId, b2.staffId])).toEqual(new Set([staff.id, staff2.id]));
  });

  it("I-BOOK-16: cancelling frees the slot again", async () => {
    const { org, service } = await createReadyOrg(60);
    const { date, start } = nextMonday10(org.timezone);
    const booking = await autoAssignAndBook(org.id, {
      serviceId: service.id,
      startDatetime: start,
    });
    await cancelBooking(org.id, booking.id);
    const after = await getAvailability(org.id, service.id, date);
    expect(after.some((s) => s.start.getTime() === start.getTime())).toBe(true);
  });
});
