import { z } from "zod";
import { handleRoute, ok, created } from "@server/platform/http/responses";
import { withRequiredOrg } from "@server/platform/auth/context";
import { assertRole } from "@server/platform/auth/rbac";
import { Role } from "@domain/enums";
import {
  listTimeOff,
  createTimeOff,
} from "@server/features/schedules/schedules.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CreateTimeOff = z.object({
  staffId: z.string().min(1),
  startDatetime: z.string().min(1),
  endDatetime: z.string().min(1),
  reason: z.string().optional(),
});

export const GET = handleRoute(async (req) => {
  const { organizationId } = await withRequiredOrg(req);
  const staffId = new URL(req.url).searchParams.get("staffId") ?? undefined;
  return ok({ timeOff: await listTimeOff(organizationId, staffId) });
});

export const POST = handleRoute(async (req) => {
  const { principal, organizationId } = await withRequiredOrg(req);
  assertRole(principal, [Role.ORG_ADMIN, Role.SUPER_ADMIN]);
  const body = CreateTimeOff.parse(await req.json());
  return created({
    timeOff: await createTimeOff(organizationId, {
      staffId: body.staffId,
      startDatetime: new Date(body.startDatetime),
      endDatetime: new Date(body.endDatetime),
      reason: body.reason,
    }),
  });
});
