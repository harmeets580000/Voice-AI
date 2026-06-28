import { describe, it, expect } from "vitest";
import {
  getAvailableSlots,
  pickStaffForStart,
  isStartAvailableForStaff,
  type AvailabilityInput,
  type ScheduleEntry,
} from "@server/features/bookings/availability";
import { DateTime } from "luxon";

const TZ = "America/Los_Angeles";

/** Mon–Fri 09:00–17:00 schedule for a staff member. */
function weekday9to17(staffId: string): ScheduleEntry[] {
  return [1, 2, 3, 4, 5].map((d) => ({
    staffId,
    dayOfWeek: d,
    startTime: "09:00",
    endTime: "17:00",
  }));
}

/** An absolute Date for a wall-clock time in the org tz on a given date. */
function at(date: string, time: string, tz = TZ): Date {
  return DateTime.fromISO(`${date}T${time}`, { zone: tz }).toJSDate();
}

const baseInput = (over: Partial<AvailabilityInput> = {}): AvailabilityInput => ({
  date: "2026-06-15", // a Monday
  timezone: TZ,
  durationMinutes: 60,
  staffIds: ["s1"],
  schedules: weekday9to17("s1"),
  timeOff: [],
  bookings: [],
  ...over,
});

describe("availability math (U-BOOK-01..07, U-BOOK-13)", () => {
  it("U-BOOK-01: open slots from schedule minus nothing → all working slots", () => {
    const slots = getAvailableSlots(baseInput());
    // 09:00..16:00 starts for a 60-min service in an 8h window = 8 slots.
    expect(slots).toHaveLength(8);
    expect(DateTime.fromJSDate(slots[0].start).setZone(TZ).toFormat("HH:mm")).toBe(
      "09:00",
    );
    expect(
      DateTime.fromJSDate(slots[slots.length - 1].start)
        .setZone(TZ)
        .toFormat("HH:mm"),
    ).toBe("16:00");
  });

  it("U-BOOK-02: a slot overlapping an existing booking is excluded", () => {
    const slots = getAvailableSlots(
      baseInput({
        bookings: [
          { staffId: "s1", start: at("2026-06-15", "10:00"), end: at("2026-06-15", "11:00") },
        ],
      }),
    );
    const tenAm = slots.find(
      (s) => DateTime.fromJSDate(s.start).setZone(TZ).toFormat("HH:mm") === "10:00",
    );
    expect(tenAm).toBeUndefined();
    expect(slots).toHaveLength(7);
  });

  it("U-BOOK-03: a slot inside a time-off block is excluded", () => {
    const slots = getAvailableSlots(
      baseInput({
        timeOff: [
          { staffId: "s1", start: at("2026-06-15", "12:00"), end: at("2026-06-15", "13:00") },
        ],
      }),
    );
    const noon = slots.find(
      (s) => DateTime.fromJSDate(s.start).setZone(TZ).toFormat("HH:mm") === "12:00",
    );
    expect(noon).toBeUndefined();
  });

  it("U-BOOK-04: service longer than the remaining window excludes end-of-day slots", () => {
    const slots = getAvailableSlots(baseInput({ durationMinutes: 120 }));
    // 09:00..15:00 starts for a 2h service = 7 slots; 16:00 would end at 18:00 (excluded).
    expect(
      DateTime.fromJSDate(slots[slots.length - 1].start)
        .setZone(TZ)
        .toFormat("HH:mm"),
    ).toBe("15:00");
  });

  it("U-BOOK-05: org timezone is applied (slots are org-local)", () => {
    const slots = getAvailableSlots(baseInput({ timezone: "America/New_York" }));
    // First slot is 09:00 New York time.
    expect(
      DateTime.fromJSDate(slots[0].start).setZone("America/New_York").toFormat("HH:mm"),
    ).toBe("09:00");
  });

  it("U-BOOK-06: DST boundary day produces a normal 9–17 set (no phantom/missing hour)", () => {
    // 2026-03-08 is US spring-forward (2am→3am). A 9–17 window is unaffected.
    const slots = getAvailableSlots(
      baseInput({ date: "2026-03-08", schedules: [{ staffId: "s1", dayOfWeek: 0, startTime: "09:00", endTime: "17:00" }] }),
    );
    expect(slots).toHaveLength(8);
    expect(DateTime.fromJSDate(slots[0].start).setZone(TZ).toFormat("HH:mm")).toBe(
      "09:00",
    );
  });

  it("U-BOOK-07: no staff scheduled that day → empty list, not an error", () => {
    const slots = getAvailableSlots(
      baseInput({ date: "2026-06-14" }), // a Sunday, no schedule
    );
    expect(slots).toEqual([]);
  });

  it("U-BOOK-13: zero or negative duration is rejected", () => {
    expect(() => getAvailableSlots(baseInput({ durationMinutes: 0 }))).toThrow();
    expect(() => getAvailableSlots(baseInput({ durationMinutes: -30 }))).toThrow();
  });
});

describe("auto-assign (U-BOOK-08, U-BOOK-09)", () => {
  const twoStaff = (): AvailabilityInput =>
    baseInput({
      staffIds: ["s1", "s2"],
      schedules: [...weekday9to17("s1"), ...weekday9to17("s2")],
    });

  it("U-BOOK-08: with two staff free and one busy, picks a free one", () => {
    const slots = getAvailableSlots(
      // s1 is booked 10:00–11:00; s2 is free.
      ({ ...twoStaff(), bookings: [{ staffId: "s1", start: at("2026-06-15", "10:00"), end: at("2026-06-15", "11:00") }] }),
    );
    const picked = pickStaffForStart(slots, at("2026-06-15", "10:00"));
    expect(picked).toBe("s2");
  });

  it("U-BOOK-09: when all staff are busy at that time, returns null", () => {
    const slots = getAvailableSlots({
      ...twoStaff(),
      bookings: [
        { staffId: "s1", start: at("2026-06-15", "10:00"), end: at("2026-06-15", "11:00") },
        { staffId: "s2", start: at("2026-06-15", "10:00"), end: at("2026-06-15", "11:00") },
      ],
    });
    expect(pickStaffForStart(slots, at("2026-06-15", "10:00"))).toBeNull();
  });

  it("isStartAvailableForStaff reflects per-staff freeness", () => {
    const slots = getAvailableSlots({
      ...twoStaff(),
      bookings: [{ staffId: "s1", start: at("2026-06-15", "10:00"), end: at("2026-06-15", "11:00") }],
    });
    expect(isStartAvailableForStaff(slots, at("2026-06-15", "10:00"), "s1")).toBe(false);
    expect(isStartAvailableForStaff(slots, at("2026-06-15", "10:00"), "s2")).toBe(true);
  });
});
