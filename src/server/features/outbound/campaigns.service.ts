/**
 * Campaigns (Product 2 §D) — VOICE-only this phase. CRUD + status controls. Launch (the stub
 * governor) lives in campaign.launch.ts. Non-VOICE channels are rejected here and at launch.
 */

import type { Prisma } from "@prisma/client";
import { tenantDb } from "@server/platform/db/scoped";
import { AppError } from "@server/platform/http/errors";
import type { ContactFilter } from "./contacts.service";

export interface CampaignInput {
  name?: string;
  channel?: "VOICE" | "SMS" | "WHATSAPP" | "EMAIL";
  outboundAgentId?: string | null;
  segmentId?: string | null;
  audience?: ContactFilter | null;
  pacingPerHour?: number;
  quietHours?: unknown;
  scheduledAt?: string | null;
}

function assertVoice(channel?: string) {
  if (channel && channel !== "VOICE") {
    throw AppError.badRequest(
      "Only VOICE campaigns are supported this phase (SMS/WhatsApp/Email are coming later)",
    );
  }
}

export function listCampaigns(orgId: string) {
  return tenantDb(orgId).campaign.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { members: true } } },
  });
}

export function getCampaign(orgId: string, id: string) {
  return tenantDb(orgId).campaign.findFirst({
    where: { id },
    include: {
      members: { orderBy: { id: "asc" } },
    },
  });
}

export async function createCampaign(orgId: string, input: CampaignInput) {
  assertVoice(input.channel);
  return tenantDb(orgId).campaign.create({
    data: {
      organizationId: orgId,
      name: input.name ?? "New campaign",
      channel: "VOICE",
      outboundAgentId: input.outboundAgentId ?? null,
      segmentId: input.segmentId ?? null,
      audienceJson: (input.audience as Prisma.InputJsonValue) ?? undefined,
      pacingPerHour: input.pacingPerHour ?? 60,
      quietHoursJson: (input.quietHours as Prisma.InputJsonValue) ?? undefined,
      scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
    },
  });
}

export async function updateCampaign(
  orgId: string,
  id: string,
  input: CampaignInput,
) {
  assertVoice(input.channel);
  const db = tenantDb(orgId);
  const data: Prisma.CampaignUpdateInput = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.outboundAgentId !== undefined)
    data.outboundAgentId = input.outboundAgentId;
  if (input.segmentId !== undefined) data.segmentId = input.segmentId;
  if (input.audience !== undefined)
    data.audienceJson = input.audience as Prisma.InputJsonValue;
  if (input.pacingPerHour !== undefined) data.pacingPerHour = input.pacingPerHour;
  if (input.quietHours !== undefined)
    data.quietHoursJson = input.quietHours as Prisma.InputJsonValue;
  if (input.scheduledAt !== undefined)
    data.scheduledAt = input.scheduledAt ? new Date(input.scheduledAt) : null;
  const res = await db.campaign.updateMany({ where: { id }, data });
  if (res.count === 0) return null;
  return getCampaign(orgId, id);
}

export async function deleteCampaign(orgId: string, id: string) {
  const res = await tenantDb(orgId).campaign.deleteMany({ where: { id } });
  return { deleted: res.count };
}

/** Status transitions for the campaign detail controls. */
export async function setCampaignStatus(
  orgId: string,
  id: string,
  status: "PAUSED" | "RUNNING" | "CANCELLED",
) {
  const res = await tenantDb(orgId).campaign.updateMany({
    where: { id },
    data: { status },
  });
  if (res.count === 0) throw AppError.notFound("Campaign not found");
  return getCampaign(orgId, id);
}
