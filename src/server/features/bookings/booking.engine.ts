/**
 * The booking engine — the single source of booking truth, channel-agnostic (doc 03 §1.5.1).
 * Wraps the pure availability math (availability.ts) with org-scoped DB access and a
 * transaction-level double-booking guard.
 *
 * Every query is scoped via tenantDb(orgId). The double-book guard runs the insert inside a
 * Serializable transaction AND re-checks the slot immediately before insert, so two
 * concurrent books for the same staff/slot can never both succeed (tests U-BOOK-10/11,
 * I-BOOK-15).
 */

import { DateTime } from "luxon";
import { Prisma } from "@prisma/client";
import { prisma } from "@server/platform/db/client";
import { tenantDb } from "@server/platform/db/scoped";
import { AppError } from "@server/platform/http/errors";
import { eventBus } from "@server/platform/events/bus";
import { BookingStatus, type BookingSource } from "@domain/enums";
import {
  getAvailableSlots,
  pickStaffForStart,
  type Block,
  type ScheduleEntry,
  type Slot,
} from "./availability";
import { sendBookingConfirmationEmail } from "./booking.notifications";
import { filterStaffByServiceCapability } from "@server/features/staff/staff.service";

// Statuses that occupy a slot (block double-booking). A pending booking RESERVES the slot so two
// callers can't grab the same time while one awaits confirmation. `booked` is the legacy synonym.
const ACTIVE_STATUSES = [
  BookingStatus.PENDING,
  BookingStatus.CONFIRMED,
  BookingStatus.BOOKED,
  BookingStatus.COMPLETED,
];

async function getOrgTimezone(orgId: string): Promise<string> {
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { timezone: true },
  });
  if (!org) throw AppError.notFound("Organization not found");
  return org.timezone;
}

function dayBounds(date: string, tz: string): { start: Date; end: Date } {
  const dayStart = DateTime.fromISO(date, { zone: tz }).startOf("day");
  if (!dayStart.isValid) throw AppError.badRequest("Invalid date");
  return { start: dayStart.toJSDate(), end: dayStart.endOf("day").toJSDate() };
}

/**
 * Compute open slots for a service on a date, scoped to the org. `allowedStaffIds` (the calling
 * assistant's selected staff) further restricts which staff are considered; null/undefined = all.
 */
export async function getAvailability(
  orgId: string,
  serviceId: string,
  date: string,
  allowedStaffIds?: string[] | null,
): Promise<Slot[]> {
  const db = tenantDb(orgId);
  const service = await db.service.findFirst({ where: { id: serviceId } });
  if (!service) throw AppError.notFound("Service not found");

  const tz = await getOrgTimezone(orgId);
  const { start, end } = dayBounds(date, tz);

  const allowed = allowedStaffIds ? new Set(allowedStaffIds) : null;
  const staff = await db.staff.findMany({ where: { isActive: true } });
  const candidateIds = staff
    .map((s) => s.id)
    .filter((id) => !allowed || allowed.has(id));
  // Restrict to staff who can deliver THIS service (staff with no service bindings = can do all).
  const staffIds = await filterStaffByServiceCapability(
    orgId,
    serviceId,
    candidateIds,
  );

  const schedules = (await db.staffSchedule.findMany({
    where: { staffId: { in: staffIds } },
  })) as unknown as ScheduleEntry[];

  const timeOff = (await db.staffTimeOff.findMany({
    where: { staffId: { in: staffIds }, startDatetime: { lt: end }, endDatetime: { gt: start } },
  })) as Array<{ staffId: string; startDatetime: Date; endDatetime: Date }>;

  const bookings = (await db.booking.findMany({
    where: {
      status: { in: ACTIVE_STATUSES },
      startDatetime: { lt: end },
      endDatetime: { gt: start },
    },
  })) as Array<{ staffId: string | null; startDatetime: Date; endDatetime: Date }>;

  const toBlocks = (
    rows: Array<{ staffId: string | null; start: Date; end: Date }>,
  ): Block[] =>
    rows
      .filter((r) => r.staffId)
      .map((r) => ({ staffId: r.staffId!, start: r.start, end: r.end }));

  return getAvailableSlots({
    date,
    timezone: tz,
    durationMinutes: service.durationMinutes,
    staffIds,
    schedules,
    timeOff: toBlocks(
      timeOff.map((t) => ({ staffId: t.staffId, start: t.startDatetime, end: t.endDatetime })),
    ),
    bookings: toBlocks(
      bookings.map((b) => ({ staffId: b.staffId, start: b.startDatetime, end: b.endDatetime })),
    ),
  });
}

export interface BookInput {
  serviceId: string;
  startDatetime: Date;
  customerId?: string | null;
  staffId?: string | null; // if omitted, auto-assign a free staff member
  /** Restrict auto-assignment to these staff (the calling assistant's selection); null = all. */
  allowedStaffIds?: string[] | null;
  source?: BookingSource;
  notes?: string;
}

export interface BookResult {
  id: string;
  staffId: string;
  serviceId: string;
  startDatetime: Date;
  endDatetime: Date;
  status: string;
}

/**
 * Auto-assign a free staff member (or use the requested one if free) and book — with the
 * double-booking guard. Throws AppError.conflict if the slot is no longer available.
 */
export async function autoAssignAndBook(
  orgId: string,
  input: BookInput,
): Promise<BookResult> {
  const db = tenantDb(orgId);
  const service = await db.service.findFirst({ where: { id: input.serviceId } });
  if (!service) throw AppError.notFound("Service not found");

  const start = input.startDatetime;
  const end = new Date(start.getTime() + service.durationMinutes * 60_000);
  const dateStr = DateTime.fromJSDate(start)
    .setZone(await getOrgTimezone(orgId))
    .toISODate()!;

  try {
    const result = await db.$transaction(
      async (tx) => {
        // Recompute availability inside the txn from the current DB state.
        const slots = await getAvailability(
          orgId,
          input.serviceId,
          dateStr,
          input.allowedStaffIds,
        );
        const chosenStaff = input.staffId
          ? slots.find(
              (s) =>
                s.start.getTime() === start.getTime() &&
                s.availableStaffIds.includes(input.staffId!),
            )
            ? input.staffId
            : null
          : pickStaffForStart(slots, start);

        if (!chosenStaff) {
          throw AppError.conflict("That time is no longer available");
        }

        // Final re-check directly against bookings for this staff (guard).
        const clash = await tx.booking.findFirst({
          where: {
            staffId: chosenStaff,
            status: { in: ACTIVE_STATUSES },
            startDatetime: { lt: end },
            endDatetime: { gt: start },
          },
        });
        if (clash) throw AppError.conflict("That time was just taken");

        const booking = await tx.booking.create({
          data: {
            organizationId: orgId,
            serviceId: input.serviceId,
            staffId: chosenStaff,
            customerId: input.customerId ?? null,
            startDatetime: start,
            endDatetime: end,
            status: BookingStatus.PENDING,
            source: input.source ?? "phone",
            notes: input.notes ?? null,
          },
        });
        return booking;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    await eventBus.publish("BookingCreated", {
      organizationId: orgId,
      bookingId: result.id,
      staffId: result.staffId,
      serviceId: result.serviceId,
      startDatetime: result.startDatetime.toISOString(),
    });

    return {
      id: result.id,
      staffId: result.staffId!,
      serviceId: result.serviceId!,
      startDatetime: result.startDatetime,
      endDatetime: result.endDatetime,
      status: result.status,
    };
  } catch (e) {
    // Serializable conflicts surface as P2034 (write conflict / deadlock).
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2034") {
      throw AppError.conflict("That time was just taken");
    }
    throw e;
  }
}

/** Cancel a booking (frees the slot). */
export async function cancelBooking(orgId: string, bookingId: string) {
  const db = tenantDb(orgId);
  const existing = await db.booking.findFirst({ where: { id: bookingId } });
  if (!existing) throw AppError.notFound("Booking not found");
  return db.booking.update({
    where: { id: bookingId },
    data: { status: BookingStatus.CANCELLED },
  });
}

/**
 * Confirm a pending booking → `confirmed`, then send the customer a confirmation email
 * (best-effort — an email failure never rolls back the confirmation; see booking.notifications).
 */
export async function confirmBooking(orgId: string, bookingId: string) {
  const db = tenantDb(orgId);
  const existing = await db.booking.findFirst({ where: { id: bookingId } });
  if (!existing) throw AppError.notFound("Booking not found");
  const updated = await db.booking.update({
    where: { id: bookingId },
    data: { status: BookingStatus.CONFIRMED },
  });
  await sendBookingConfirmationEmail(orgId, bookingId);
  return updated;
}

/** Mark a booking completed (the final lifecycle stage). */
export async function completeBooking(orgId: string, bookingId: string) {
  const db = tenantDb(orgId);
  const existing = await db.booking.findFirst({ where: { id: bookingId } });
  if (!existing) throw AppError.notFound("Booking not found");
  return db.booking.update({
    where: { id: bookingId },
    data: { status: BookingStatus.COMPLETED },
  });
}

/** Mark a booking as a no-show (frees the slot for future availability). */
export async function markNoShow(orgId: string, bookingId: string) {
  const db = tenantDb(orgId);
  const existing = await db.booking.findFirst({ where: { id: bookingId } });
  if (!existing) throw AppError.notFound("Booking not found");
  return db.booking.update({
    where: { id: bookingId },
    data: { status: BookingStatus.NO_SHOW },
  });
}

/** Reschedule: check the new slot for conflicts before saving (test I-BOOK-17). */
export async function rescheduleBooking(
  orgId: string,
  bookingId: string,
  newStart: Date,
): Promise<BookResult> {
  const db = tenantDb(orgId);
  const existing = await db.booking.findFirst({ where: { id: bookingId } });
  if (!existing) throw AppError.notFound("Booking not found");
  // Cancel + re-book at the new time via the same guarded path.
  await db.booking.update({
    where: { id: bookingId },
    data: { status: BookingStatus.CANCELLED },
  });
  return autoAssignAndBook(orgId, {
    serviceId: existing.serviceId!,
    startDatetime: newStart,
    customerId: existing.customerId,
    staffId: existing.staffId,
    source: existing.source as BookingSource,
  });
}
