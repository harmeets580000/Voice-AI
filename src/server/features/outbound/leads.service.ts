/**
 * Lead pipeline (Product 2 §F) — 6-stage sales pipeline over OutboundContacts. Every stage
 * change / assignment / note appends a LeadActivity. A lead is always backed by a contact (O2).
 */

import type { Prisma } from "@prisma/client";
import { tenantDb } from "@server/platform/db/scoped";
import { AppError } from "@server/platform/http/errors";
import { eventBus } from "@server/platform/events/bus";

export const LEAD_STAGES = [
  "NEW",
  "CONTACTED",
  "QUALIFIED",
  "PROPOSAL",
  "WON",
  "LOST",
] as const;
export type LeadStage = (typeof LEAD_STAGES)[number];

/** Open = not yet closed (used for dedupe: one open lead per contact). */
export const OPEN_STAGES: LeadStage[] = [
  "NEW",
  "CONTACTED",
  "QUALIFIED",
  "PROPOSAL",
];

export type LeadSource =
  | "OUTBOUND_CALL"
  | "CAMPAIGN"
  | "INBOUND_CALL"
  | "MANUAL"
  | "IMPORT";

export interface LeadFilter {
  stage?: LeadStage;
  ownerUserId?: string;
  source?: LeadSource;
  minValue?: number;
}

const leadInclude = {
  contact: { select: { id: true, name: true, phone: true, email: true } },
} satisfies Prisma.LeadInclude;

function serializeActivity(a: {
  id: string;
  type: string;
  dataJson: unknown;
  userId: string | null;
  createdAt: Date;
}) {
  return {
    id: a.id,
    type: a.type,
    data: a.dataJson ?? null,
    userId: a.userId,
    createdAt: a.createdAt.toISOString(),
  };
}

function serializeLead(lead: {
  id: string;
  contactId: string;
  stage: string;
  source: string;
  ownerUserId: string | null;
  value: Prisma.Decimal | null;
  campaignId: string | null;
  callId: string | null;
  lostReason: string | null;
  createdAt: Date;
  updatedAt: Date;
  contact?: {
    id: string;
    name: string | null;
    phone: string | null;
    email: string | null;
  } | null;
  activities?: Parameters<typeof serializeActivity>[0][];
}) {
  return {
    id: lead.id,
    contactId: lead.contactId,
    stage: lead.stage,
    source: lead.source,
    ownerUserId: lead.ownerUserId,
    value: lead.value == null ? null : Number(lead.value),
    campaignId: lead.campaignId,
    callId: lead.callId,
    lostReason: lead.lostReason,
    createdAt: lead.createdAt.toISOString(),
    updatedAt: lead.updatedAt.toISOString(),
    contact: lead.contact ?? null,
    activities: lead.activities?.map(serializeActivity),
  };
}
export type LeadDTO = ReturnType<typeof serializeLead>;

function buildLeadWhere(filter: LeadFilter): Prisma.LeadWhereInput {
  const where: Prisma.LeadWhereInput = {};
  if (filter.stage) where.stage = filter.stage;
  if (filter.ownerUserId) where.ownerUserId = filter.ownerUserId;
  if (filter.source) where.source = filter.source;
  if (filter.minValue !== undefined) where.value = { gte: filter.minValue };
  return where;
}

export async function listLeads(
  orgId: string,
  filter: LeadFilter = {},
): Promise<LeadDTO[]> {
  const leads = await tenantDb(orgId).lead.findMany({
    where: buildLeadWhere(filter),
    include: leadInclude,
    orderBy: { updatedAt: "desc" },
  });
  return leads.map(serializeLead);
}

export async function getLead(
  orgId: string,
  id: string,
): Promise<LeadDTO | null> {
  const lead = await tenantDb(orgId).lead.findFirst({
    where: { id },
    include: {
      ...leadInclude,
      activities: { orderBy: { createdAt: "desc" } },
    },
  });
  return lead ? serializeLead(lead) : null;
}

/** Append a timeline entry. */
export function addActivity(
  orgId: string,
  leadId: string,
  type: string,
  data?: unknown,
  userId?: string | null,
) {
  return tenantDb(orgId).leadActivity.create({
    data: {
      organizationId: orgId,
      leadId,
      type,
      dataJson: (data as Prisma.InputJsonValue) ?? undefined,
      userId: userId ?? null,
    },
  });
}

export interface CreateLeadInput {
  contactId: string;
  source: LeadSource;
  stage?: LeadStage;
  ownerUserId?: string | null;
  value?: number | null;
  campaignId?: string | null;
  callId?: string | null;
  leadImportId?: string | null;
}

export async function createLead(
  orgId: string,
  input: CreateLeadInput,
  userId?: string | null,
): Promise<LeadDTO> {
  const lead = await tenantDb(orgId).lead.create({
    data: {
      organizationId: orgId,
      contactId: input.contactId,
      source: input.source,
      stage: input.stage ?? "NEW",
      ownerUserId: input.ownerUserId ?? null,
      value: input.value ?? null,
      campaignId: input.campaignId ?? null,
      callId: input.callId ?? null,
      leadImportId: input.leadImportId ?? null,
    },
  });
  await addActivity(orgId, lead.id, "CREATED", { source: input.source }, userId);
  await eventBus.publish("LeadCreated", {
    organizationId: orgId,
    leadId: lead.id,
    source: input.source,
  });
  return (await getLead(orgId, lead.id))!;
}

export function findOpenLeadByContact(orgId: string, contactId: string) {
  return tenantDb(orgId).lead.findFirst({
    where: { contactId, stage: { in: OPEN_STAGES } },
  });
}

export async function updateLeadStage(
  orgId: string,
  id: string,
  stage: LeadStage,
  opts: { userId?: string | null; lostReason?: string } = {},
): Promise<LeadDTO> {
  const db = tenantDb(orgId);
  const lead = await db.lead.findFirst({ where: { id } });
  if (!lead) throw AppError.notFound("Lead not found");
  if (stage === "LOST" && !opts.lostReason) {
    throw AppError.badRequest("A reason is required when marking a lead lost");
  }
  if (lead.stage === stage) return (await getLead(orgId, id))!;

  await db.lead.update({
    where: { id },
    data: {
      stage,
      lostReason: stage === "LOST" ? (opts.lostReason ?? null) : lead.lostReason,
    },
  });
  await addActivity(
    orgId,
    id,
    "STAGE_CHANGED",
    { from: lead.stage, to: stage, ...(opts.lostReason ? { reason: opts.lostReason } : {}) },
    opts.userId,
  );
  await eventBus.publish("LeadStageChanged", {
    organizationId: orgId,
    leadId: id,
    from: lead.stage,
    to: stage,
  });
  return (await getLead(orgId, id))!;
}

export async function assignLead(
  orgId: string,
  id: string,
  ownerUserId: string | null,
  userId?: string | null,
): Promise<LeadDTO> {
  const db = tenantDb(orgId);
  const res = await db.lead.updateMany({ where: { id }, data: { ownerUserId } });
  if (res.count === 0) throw AppError.notFound("Lead not found");
  await addActivity(orgId, id, "ASSIGNED", { ownerUserId }, userId);
  return (await getLead(orgId, id))!;
}

export async function addNote(
  orgId: string,
  id: string,
  note: string,
  userId?: string | null,
): Promise<LeadDTO> {
  const lead = await tenantDb(orgId).lead.findFirst({ where: { id } });
  if (!lead) throw AppError.notFound("Lead not found");
  await addActivity(orgId, id, "NOTE", { note }, userId);
  return (await getLead(orgId, id))!;
}

export async function updateLead(
  orgId: string,
  id: string,
  data: { value?: number | null; ownerUserId?: string | null },
): Promise<LeadDTO | null> {
  const patch: Prisma.LeadUpdateInput = {};
  if (data.value !== undefined) patch.value = data.value;
  if (data.ownerUserId !== undefined) patch.ownerUserId = data.ownerUserId;
  const res = await tenantDb(orgId).lead.updateMany({ where: { id }, data: patch });
  if (res.count === 0) return null;
  return getLead(orgId, id);
}

export async function deleteLead(orgId: string, id: string) {
  const res = await tenantDb(orgId).lead.deleteMany({ where: { id } });
  return { deleted: res.count };
}

export interface PromoteSummary {
  total: number;
  promoted: number;
  skippedOptOut: number;
  skippedExisting: number;
}

/**
 * Promote selected contacts (or a segment's contacts) into NEW leads (source=IMPORT). Excludes
 * opted-out contacts and contacts that already have an open lead; both are reported.
 */
export async function bulkPromoteToLeads(
  orgId: string,
  contactIds: string[],
  userId?: string | null,
): Promise<PromoteSummary> {
  const db = tenantDb(orgId);
  let promoted = 0;
  let skippedOptOut = 0;
  let skippedExisting = 0;
  for (const contactId of contactIds) {
    const contact = await db.outboundContact.findFirst({
      where: { id: contactId },
    });
    if (!contact) continue;
    if (contact.optOut) {
      skippedOptOut++;
      continue;
    }
    if (await findOpenLeadByContact(orgId, contactId)) {
      skippedExisting++;
      continue;
    }
    await createLead(orgId, { contactId, source: "IMPORT" }, userId);
    promoted++;
  }
  return {
    total: contactIds.length,
    promoted,
    skippedOptOut,
    skippedExisting,
  };
}
