import { handleRoute, ok, created } from "@server/platform/http/responses";
import { assertRole } from "@server/platform/auth/rbac";
import { Role } from "@domain/enums";
import { withOutboundOrg } from "@server/features/outbound/guard";
import {
  listMeetings,
  convertLeadToMeeting,
} from "@server/features/outbound/meeting.engine";
import { ConvertLeadRequest } from "@contracts/outbound-meetings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function serialize(m: {
  id: string;
  leadId: string;
  contactId: string;
  ownerUserId: string;
  startDatetime: Date;
  endDatetime: Date;
  status: string;
  notes: string | null;
  createdAt: Date;
}) {
  return {
    id: m.id,
    leadId: m.leadId,
    contactId: m.contactId,
    ownerUserId: m.ownerUserId,
    startDatetime: m.startDatetime.toISOString(),
    endDatetime: m.endDatetime.toISOString(),
    status: m.status,
    notes: m.notes,
    createdAt: m.createdAt.toISOString(),
  };
}

export const GET = handleRoute(async (req) => {
  const { organizationId } = await withOutboundOrg(req);
  const url = new URL(req.url);
  const meetings = await listMeetings(organizationId, {
    ownerUserId: url.searchParams.get("owner") ?? undefined,
    leadId: url.searchParams.get("leadId") ?? undefined,
  });
  return ok({ meetings: meetings.map(serialize) });
});

// Convert a lead → meeting (reps + admins). Double-booking the rep is guarded server-side.
export const POST = handleRoute(async (req) => {
  const { principal, organizationId } = await withOutboundOrg(req);
  assertRole(principal, [Role.ORG_ADMIN, Role.ORG_STAFF, Role.SUPER_ADMIN]);
  const body = ConvertLeadRequest.parse(await req.json());
  const meeting = await convertLeadToMeeting(
    organizationId,
    body.leadId,
    {
      ownerUserId: body.ownerUserId,
      start: new Date(body.start),
      durationMin: body.durationMin,
      notes: body.notes,
    },
    principal.userId,
  );
  return created({ meeting: serialize(meeting) });
});
