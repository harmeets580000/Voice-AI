import { z } from "zod";
import { handleRoute, ok, created } from "@server/platform/http/responses";
import { withRequiredOrg } from "@server/platform/auth/context";
import { assertRole } from "@server/platform/auth/rbac";
import { Role } from "@domain/enums";
import {
  listSchedules,
  createSchedule,
} from "@server/features/schedules/schedules.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CreateSchedule = z.object({
  staffId: z.string().min(1),
  dayOfWeek: z.number().int().min(0).max(6),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
});

export const GET = handleRoute(async (req) => {
  const { organizationId } = await withRequiredOrg(req);
  const staffId = new URL(req.url).searchParams.get("staffId") ?? undefined;
  return ok({ schedules: await listSchedules(organizationId, staffId) });
});

export const POST = handleRoute(async (req) => {
  const { principal, organizationId } = await withRequiredOrg(req);
  assertRole(principal, [Role.ORG_ADMIN, Role.SUPER_ADMIN]);
  const body = CreateSchedule.parse(await req.json());
  return created({ schedule: await createSchedule(organizationId, body) });
});
