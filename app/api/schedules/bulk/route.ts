import { z } from "zod";
import { handleRoute, ok } from "@server/platform/http/responses";
import { withRequiredOrg } from "@server/platform/auth/context";
import { assertRole } from "@server/platform/auth/rbac";
import { Role } from "@domain/enums";
import { setStaffWeeklySchedule } from "@server/features/schedules/schedules.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const time = z.string().regex(/^\d{2}:\d{2}$/);

const BulkSchedule = z.object({
  staffId: z.string().min(1),
  days: z.array(
    z.object({
      dayOfWeek: z.number().int().min(0).max(6),
      startTime: time,
      endTime: time,
    }),
  ),
});

/** Replace a staff member's whole weekly schedule at once (the grid is the source of truth). */
export const PUT = handleRoute(async (req) => {
  const { principal, organizationId } = await withRequiredOrg(req);
  assertRole(principal, [Role.ORG_ADMIN, Role.SUPER_ADMIN]);
  const body = BulkSchedule.parse(await req.json());
  return ok({
    schedules: await setStaffWeeklySchedule(organizationId, body.staffId, body.days),
  });
});
