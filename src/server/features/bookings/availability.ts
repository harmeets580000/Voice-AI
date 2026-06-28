/**
 * Pure availability math — the heart of the booking engine, with NO I/O so it's fully
 * unit-testable (tests U-BOOK-01..07, U-BOOK-13). Given an org's schedules, time-off, and
 * existing bookings, it computes open slots for a service on a date, honoring the service
 * duration and the ORG TIMEZONE (DST-correct via luxon).
 *
 * The DB-backed engine (booking.engine.ts) loads these inputs scoped to the org and calls
 * in here; this module never touches Prisma.
 */

import { DateTime } from "luxon";
import { AppError } from "@server/platform/http/errors";

export interface ScheduleEntry {
  staffId: string;
  dayOfWeek: number; // 0=Sun .. 6=Sat
  startTime: string; // "HH:mm" org-local
  endTime: string; // "HH:mm" org-local
}

export interface Block {
  staffId: string;
  start: Date;
  end: Date;
}

export interface AvailabilityInput {
  date: string; // YYYY-MM-DD, interpreted in the org timezone
  timezone: string; // IANA tz
  durationMinutes: number;
  stepMinutes?: number; // slot granularity; defaults to durationMinutes
  staffIds: string[]; // active staff to consider
  schedules: ScheduleEntry[];
  timeOff: Block[];
  bookings: Block[]; // active (non-cancelled) bookings
}

export interface Slot {
  start: Date;
  end: Date;
  availableStaffIds: string[];
}

function parseHm(t: string): { h: number; m: number } {
  const [h, m] = t.split(":").map(Number);
  return { h: h ?? 0, m: m ?? 0 };
}

function overlaps(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number,
): boolean {
  return aStart < bEnd && aEnd > bStart;
}

function isStaffFree(
  staffId: string,
  slotStart: number,
  slotEnd: number,
  timeOff: Block[],
  bookings: Block[],
): boolean {
  for (const b of timeOff) {
    if (b.staffId !== staffId) continue;
    if (overlaps(slotStart, slotEnd, b.start.getTime(), b.end.getTime()))
      return false;
  }
  for (const b of bookings) {
    if (b.staffId !== staffId) continue;
    if (overlaps(slotStart, slotEnd, b.start.getTime(), b.end.getTime()))
      return false;
  }
  return true;
}

/**
 * Compute open slots for the given date/service across all considered staff.
 * Returns slots (org-local wall times as absolute Dates) that have >= 1 free staff,
 * sorted ascending. Returns [] (not an error) when no staff are scheduled (U-BOOK-07).
 */
export function getAvailableSlots(input: AvailabilityInput): Slot[] {
  const { durationMinutes, timezone, date } = input;
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
    throw AppError.validation("Service duration must be a positive number"); // U-BOOK-13
  }
  const step =
    input.stepMinutes && input.stepMinutes > 0
      ? input.stepMinutes
      : durationMinutes;

  const dayStart = DateTime.fromISO(date, { zone: timezone }).startOf("day");
  if (!dayStart.isValid) {
    throw AppError.badRequest("Invalid date or timezone");
  }
  const dow = dayStart.weekday % 7; // luxon: Mon=1..Sun=7 → our 0=Sun..6=Sat

  const slotStaff = new Map<number, Set<string>>();

  for (const staffId of input.staffIds) {
    const windows = input.schedules.filter(
      (s) => s.staffId === staffId && s.dayOfWeek === dow,
    );
    for (const w of windows) {
      const { h: sh, m: sm } = parseHm(w.startTime);
      const { h: eh, m: em } = parseHm(w.endTime);
      const windowEnd = dayStart.set({ hour: eh, minute: em });
      let cursor = dayStart.set({ hour: sh, minute: sm });

      // Generate candidate starts while the full service fits before the window end.
      while (cursor.plus({ minutes: durationMinutes }) <= windowEnd) {
        const slotStartMs = cursor.toMillis();
        const slotEndMs = cursor.plus({ minutes: durationMinutes }).toMillis();
        if (isStaffFree(staffId, slotStartMs, slotEndMs, input.timeOff, input.bookings)) {
          if (!slotStaff.has(slotStartMs)) slotStaff.set(slotStartMs, new Set());
          slotStaff.get(slotStartMs)!.add(staffId);
        }
        cursor = cursor.plus({ minutes: step });
      }
    }
  }

  return [...slotStaff.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([ms, staff]) => ({
      start: new Date(ms),
      end: new Date(ms + durationMinutes * 60_000),
      availableStaffIds: [...staff].sort(),
    }));
}

/**
 * Auto-assign: pick a free staff member for a specific start time (U-BOOK-08/09).
 * Returns the chosen staffId, or null if none is free at that slot.
 */
export function pickStaffForStart(
  slots: Slot[],
  start: Date,
): string | null {
  const slot = slots.find((s) => s.start.getTime() === start.getTime());
  if (!slot || slot.availableStaffIds.length === 0) return null;
  return slot.availableStaffIds[0];
}

/** True if a specific staff member is free for the requested start (used pre-insert). */
export function isStartAvailableForStaff(
  slots: Slot[],
  start: Date,
  staffId: string,
): boolean {
  const slot = slots.find((s) => s.start.getTime() === start.getTime());
  return !!slot && slot.availableStaffIds.includes(staffId);
}
