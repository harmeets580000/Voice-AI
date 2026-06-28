import { tenantDb } from "@server/platform/db/scoped";

export function listBookings(
  orgId: string,
  filter?: { status?: string; from?: Date; to?: Date },
) {
  return tenantDb(orgId).booking.findMany({
    where: {
      ...(filter?.status ? { status: filter.status as never } : {}),
      ...(filter?.from || filter?.to
        ? {
            startDatetime: {
              ...(filter.from ? { gte: filter.from } : {}),
              ...(filter.to ? { lte: filter.to } : {}),
            },
          }
        : {}),
    },
    orderBy: { startDatetime: "asc" },
    include: {
      customer: { select: { name: true, phone: true } },
      staff: { select: { name: true } },
      service: { select: { name: true } },
    },
  });
}

export function getBooking(orgId: string, id: string) {
  return tenantDb(orgId).booking.findFirst({
    where: { id },
    include: { customer: true, staff: true, service: true },
  });
}
