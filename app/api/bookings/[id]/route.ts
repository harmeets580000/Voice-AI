import { z } from "zod";
import { handleRoute, ok } from "@server/platform/http/responses";
import { withRequiredOrg } from "@server/platform/auth/context";
import { assertRole } from "@server/platform/auth/rbac";
import { Role } from "@domain/enums";
import { AppError } from "@server/platform/http/errors";
import { getBooking } from "@server/features/bookings/bookings.service";
import {
  cancelBooking,
  rescheduleBooking,
  confirmBooking,
  completeBooking,
  markNoShow,
} from "@server/features/bookings/booking.engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const PatchBooking = z.object({
  action: z.enum([
    "cancel",
    "reschedule",
    "confirm",
    "complete",
    "no_show",
  ]),
  startDatetime: z.string().optional(),
});

const SIMPLE_ACTIONS = {
  cancel: cancelBooking,
  confirm: confirmBooking,
  complete: completeBooking,
  no_show: markNoShow,
} as const;

export const GET = handleRoute(async (req, ctx) => {
  const { organizationId } = await withRequiredOrg(req);
  const { id } = await (ctx as Ctx).params;
  const booking = await getBooking(organizationId, id);
  if (!booking) throw AppError.notFound("Booking not found");
  return ok({ booking });
});

export const PATCH = handleRoute(async (req, ctx) => {
  const { principal, organizationId } = await withRequiredOrg(req);
  assertRole(principal, [Role.ORG_ADMIN, Role.ORG_STAFF, Role.SUPER_ADMIN]);
  const { id } = await (ctx as Ctx).params;
  const body = PatchBooking.parse(await req.json());

  if (body.action !== "reschedule") {
    return ok({ booking: await SIMPLE_ACTIONS[body.action](organizationId, id) });
  }
  if (!body.startDatetime) {
    throw AppError.badRequest("startDatetime required to reschedule");
  }
  return ok({
    booking: await rescheduleBooking(
      organizationId,
      id,
      new Date(body.startDatetime),
    ),
  });
});
