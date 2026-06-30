import { Prisma } from "@prisma/client";
import { tenantDb } from "@server/platform/db/scoped";
import { AppError } from "@server/platform/http/errors";

// ---- Weekly recurring schedules ----

export function listSchedules(orgId: string, staffId?: string) {
  return tenantDb(orgId).staffSchedule.findMany({
    where: staffId ? { staffId } : undefined,
    orderBy: [{ staffId: "asc" }, { dayOfWeek: "asc" }],
  });
}

export interface WeeklyScheduleEntry {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
}

/**
 * Set a staff member's ENTIRE weekly schedule in one go (the grid is the source of truth): the days
 * present in `entries` are upserted; any day NOT present is removed. Lets the UI enter the whole week
 * at once instead of one day at a time. Validates each range (endTime > startTime).
 */
export async function setStaffWeeklySchedule(
  orgId: string,
  staffId: string,
  entries: WeeklyScheduleEntry[],
) {
  const db = tenantDb(orgId);
  const staff = await db.staff.findFirst({ where: { id: staffId }, select: { id: true } });
  if (!staff) throw AppError.notFound("Staff not found");

  const seen = new Set<number>();
  for (const e of entries) {
    if (e.dayOfWeek < 0 || e.dayOfWeek > 6) {
      throw AppError.badRequest("dayOfWeek must be 0–6");
    }
    if (seen.has(e.dayOfWeek)) {
      throw AppError.badRequest("Duplicate day in weekly schedule");
    }
    seen.add(e.dayOfWeek);
    if (e.endTime <= e.startTime) {
      throw AppError.badRequest("End time must be after start time");
    }
  }

  // Replace the whole week atomically: clear then insert the provided days.
  await db.$transaction([
    db.staffSchedule.deleteMany({ where: { staffId } }),
    db.staffSchedule.createMany({
      data: entries.map((e) => ({
        organizationId: orgId,
        staffId,
        dayOfWeek: e.dayOfWeek,
        startTime: e.startTime,
        endTime: e.endTime,
      })),
    }),
  ]);
  return listSchedules(orgId, staffId);
}

export async function createSchedule(
  orgId: string,
  input: { staffId: string; dayOfWeek: number; startTime: string; endTime: string },
) {
  // Only one schedule per staff member per day of week (no duplicates / split shifts).
  const existing = await tenantDb(orgId).staffSchedule.findFirst({
    where: { staffId: input.staffId, dayOfWeek: input.dayOfWeek },
  });
  if (existing) {
    throw AppError.conflict(
      "This staff member already has a schedule for that day — edit or delete it first.",
    );
  }
  try {
    return await tenantDb(orgId).staffSchedule.create({
      data: { organizationId: orgId, ...input },
    });
  } catch (e) {
    // Guard against a race that slips past the pre-check (unique constraint).
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw AppError.conflict(
        "This staff member already has a schedule for that day.",
      );
    }
    throw e;
  }
}

export async function deleteSchedule(orgId: string, id: string) {
  const res = await tenantDb(orgId).staffSchedule.deleteMany({ where: { id } });
  if (res.count === 0) throw AppError.notFound("Schedule not found");
  return { deleted: true };
}

// ---- One-off time off ----

export function listTimeOff(orgId: string, staffId?: string) {
  return tenantDb(orgId).staffTimeOff.findMany({
    where: staffId ? { staffId } : undefined,
    orderBy: { startDatetime: "asc" },
  });
}

export function createTimeOff(
  orgId: string,
  input: { staffId: string; startDatetime: Date; endDatetime: Date; reason?: string },
) {
  if (input.endDatetime <= input.startDatetime) {
    throw AppError.badRequest("End must be after start");
  }
  return tenantDb(orgId).staffTimeOff.create({
    data: {
      organizationId: orgId,
      staffId: input.staffId,
      startDatetime: input.startDatetime,
      endDatetime: input.endDatetime,
      reason: input.reason ?? null,
    },
  });
}

export async function deleteTimeOff(orgId: string, id: string) {
  const res = await tenantDb(orgId).staffTimeOff.deleteMany({ where: { id } });
  if (res.count === 0) throw AppError.notFound("Time off not found");
  return { deleted: true };
}
