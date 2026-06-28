import { handleRoute, ok } from "@server/platform/http/responses";
import { withRequiredOrg } from "@server/platform/auth/context";
import { AppError } from "@server/platform/http/errors";
import { getAvailability } from "@server/features/bookings/booking.engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/availability?serviceId=&date=YYYY-MM-DD — open slots for the active org. */
export const GET = handleRoute(async (req) => {
  const { organizationId } = await withRequiredOrg(req);
  const url = new URL(req.url);
  const serviceId = url.searchParams.get("serviceId");
  const date = url.searchParams.get("date");
  if (!serviceId || !date) {
    throw AppError.badRequest("serviceId and date are required");
  }
  const slots = await getAvailability(organizationId, serviceId, date);
  return ok({
    slots: slots.map((s) => ({
      start: s.start.toISOString(),
      end: s.end.toISOString(),
      availableStaffIds: s.availableStaffIds,
    })),
  });
});
