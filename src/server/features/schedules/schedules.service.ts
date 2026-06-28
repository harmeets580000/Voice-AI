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
