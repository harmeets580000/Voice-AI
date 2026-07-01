/**
 * Outbound meetings (Product 2 §F/§Q6) — the module's OWN minimal scheduler (separate from the
 * inbound booking engine). Convert a lead into a meeting with an owner rep, guarded against
 * double-booking that rep via a SERIALIZABLE transaction + overlap re-check.
 */

import { Prisma } from "@prisma/client";
import { tenantDb } from "@server/platform/db/scoped";
import { AppError } from "@server/platform/http/errors";
import { addActivity } from "./leads.service";

export type OutboundMeetingStatus =
  | "SCHEDULED"
  | "COMPLETED"
  | "CANCELLED"
  | "NO_SHOW";

export function listMeetings(
  orgId: string,
  filter: { ownerUserId?: string; leadId?: string } = {},
) {
  return tenantDb(orgId).outboundMeeting.findMany({
    where: {
      ownerUserId: filter.ownerUserId ?? undefined,
      leadId: filter.leadId ?? undefined,
    },
    orderBy: { startDatetime: "asc" },
  });
}

export async function convertLeadToMeeting(
  orgId: string,
  leadId: string,
  input: { ownerUserId: string; start: Date; durationMin?: number; notes?: string },
  userId?: string | null,
) {
  const db = tenantDb(orgId);
  const lead = await db.lead.findFirst({ where: { id: leadId } });
  if (!lead) throw AppError.notFound("Lead not found");

  const start = input.start;
  const end = new Date(start.getTime() + (input.durationMin ?? 30) * 60_000);

  try {
    const meeting = await db.$transaction(
      async (tx) => {
        // Re-check for an overlapping SCHEDULED meeting for this rep, inside the txn.
        const clash = await tx.outboundMeeting.findFirst({
          where: {
            ownerUserId: input.ownerUserId,
            status: "SCHEDULED",
            startDatetime: { lt: end },
            endDatetime: { gt: start },
          },
        });
        if (clash) {
          throw AppError.conflict("That rep is already booked at that time");
        }
        return tx.outboundMeeting.create({
          data: {
            organizationId: orgId,
            leadId,
            contactId: lead.contactId,
            ownerUserId: input.ownerUserId,
            startDatetime: start,
            endDatetime: end,
            status: "SCHEDULED",
            notes: input.notes ?? null,
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    await addActivity(
      orgId,
      leadId,
      "CONVERTED",
      { meetingId: meeting.id, start: start.toISOString() },
      userId,
    );
    return meeting;
  } catch (e) {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2034"
    ) {
      throw AppError.conflict("That rep was just booked — pick another time");
    }
    throw e;
  }
}

export async function setMeetingStatus(
  orgId: string,
  id: string,
  status: OutboundMeetingStatus,
) {
  const res = await tenantDb(orgId).outboundMeeting.updateMany({
    where: { id },
    data: { status },
  });
  if (res.count === 0) throw AppError.notFound("Meeting not found");
  return tenantDb(orgId).outboundMeeting.findFirst({ where: { id } });
}
