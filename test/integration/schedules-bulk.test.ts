import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { hasTestDb, truncateAll, disconnect } from "./helpers/db";
import { createOrg, createStaff } from "./helpers/factories";
import {
  setStaffWeeklySchedule,
  listSchedules,
} from "@server/features/schedules/schedules.service";

describe.skipIf(!hasTestDb)("weekly schedule bulk entry", () => {
  beforeEach(async () => {
    await truncateAll();
  });
  afterAll(async () => {
    await disconnect();
  });

  it("sets the whole week at once and treats the grid as the source of truth", async () => {
    const org = await createOrg();
    const staff = await createStaff(org.id);

    // Set Mon–Fri 09:00–17:00 in one call.
    await setStaffWeeklySchedule(
      org.id,
      staff.id,
      [1, 2, 3, 4, 5].map((dayOfWeek) => ({ dayOfWeek, startTime: "09:00", endTime: "17:00" })),
    );
    let week = await listSchedules(org.id, staff.id);
    expect(week.map((w) => w.dayOfWeek).sort()).toEqual([1, 2, 3, 4, 5]);

    // Re-submit with fewer days → the omitted days are removed (source of truth).
    await setStaffWeeklySchedule(org.id, staff.id, [
      { dayOfWeek: 1, startTime: "10:00", endTime: "14:00" },
      { dayOfWeek: 6, startTime: "10:00", endTime: "14:00" },
    ]);
    week = await listSchedules(org.id, staff.id);
    expect(week.map((w) => w.dayOfWeek).sort()).toEqual([1, 6]);
    expect(week.find((w) => w.dayOfWeek === 1)?.startTime).toBe("10:00");
  });

  it("rejects an invalid time range", async () => {
    const org = await createOrg();
    const staff = await createStaff(org.id);
    await expect(
      setStaffWeeklySchedule(org.id, staff.id, [
        { dayOfWeek: 1, startTime: "17:00", endTime: "09:00" },
      ]),
    ).rejects.toThrow();
  });
});
