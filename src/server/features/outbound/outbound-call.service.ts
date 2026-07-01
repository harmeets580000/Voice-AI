/**
 * Outbound calls (Product 2 §E) — the module's own call log. This phase generates QUEUED stub
 * rows only; nothing dials (D1). Opt-out contacts are HARD-BLOCKED. Also used by campaign launch.
 */

import type { OutboundCallStatus } from "@prisma/client";
import { tenantDb } from "@server/platform/db/scoped";
import { AppError } from "@server/platform/http/errors";
import { addActivity } from "./leads.service";

export function listOutboundCalls(
  orgId: string,
  filter: { status?: string; leadId?: string; contactId?: string } = {},
) {
  return tenantDb(orgId).outboundCall.findMany({
    where: {
      status: (filter.status as OutboundCallStatus) ?? undefined,
      leadId: filter.leadId ?? undefined,
      contactId: filter.contactId ?? undefined,
    },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Place a single QUEUED outbound call from a Contact or Lead. The from-number comes from the chosen
 * Outbound Agent (its Vapi number); opted-out contacts are rejected. Logs a CALL activity from a lead.
 */
export async function placeOneOffCall(
  orgId: string,
  input: {
    contactId?: string;
    leadId?: string;
    agentId: string;
  },
  userId?: string | null,
) {
  const db = tenantDb(orgId);

  // Resolve the target contact (directly, or via the lead).
  let contactId = input.contactId ?? null;
  const leadId = input.leadId ?? null;
  if (leadId && !contactId) {
    const lead = await db.lead.findFirst({ where: { id: leadId } });
    if (!lead) throw AppError.notFound("Lead not found");
    contactId = lead.contactId;
  }
  if (!contactId) throw AppError.badRequest("A contact or lead is required");

  const contact = await db.outboundContact.findFirst({
    where: { id: contactId },
  });
  if (!contact) throw AppError.notFound("Contact not found");
  if (contact.optOut) {
    throw AppError.badRequest("This contact has opted out and cannot be called");
  }

  // The from-number lives on the agent (its Vapi number).
  const agent = await db.outboundAgent.findFirst({ where: { id: input.agentId } });
  if (!agent) throw AppError.notFound("Agent not found");
  if (!agent.providerPhoneNumber) {
    throw AppError.badRequest("Configure a from-number on this agent first");
  }

  const call = await db.outboundCall.create({
    data: {
      organizationId: orgId,
      contactId,
      leadId,
      outboundAgentId: agent.id,
      status: "QUEUED",
      fromNumber: agent.providerPhoneNumber,
      toNumber: contact.phone,
      initiatedByUserId: userId ?? null,
    },
  });

  if (leadId) {
    await addActivity(
      orgId,
      leadId,
      "CALL",
      { callId: call.id, toNumber: contact.phone },
      userId,
    );
  }

  return call;
}
