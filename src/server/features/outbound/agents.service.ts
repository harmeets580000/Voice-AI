/**
 * Outbound Agents (Product 2 §C) — sales scripts/personas for VOICE campaigns + one-off calls.
 * Multiple per org. CONFIG-ONLY this phase: enabling an action + editing its configJson persists
 * intent, but NOTHING executes (e.g. MARK_DNC does not mutate any contact). No Vapi provisioning.
 */

import type { Prisma } from "@prisma/client";
import { tenantDb } from "@server/platform/db/scoped";
import { prisma } from "@server/platform/db/client";
import { AppError } from "@server/platform/http/errors";

export const OUTBOUND_ACTION_TYPES = [
  "QUALIFY_LEAD",
  "BOOK_MEETING",
  "CAPTURE_CONTACT",
  "SEND_FOLLOWUP",
  "MARK_DNC",
  "ANSWER_KB",
] as const;
export type OutboundActionType = (typeof OUTBOUND_ACTION_TYPES)[number];

export interface AgentInput {
  name?: string;
  language?: string;
  voiceId?: string | null;
  persona?: string | null;
  openingLine?: string | null;
  systemPrompt?: string | null;
  goals?: unknown;
  behavior?: unknown;
  status?: "DRAFT" | "ACTIVE" | "INACTIVE";
  providerPhoneNumber?: string | null;
  providerPhoneNumberId?: string | null;
}

export function listAgents(orgId: string) {
  return tenantDb(orgId).outboundAgent.findMany({
    orderBy: { createdAt: "desc" },
    include: { actions: { orderBy: { order: "asc" } } },
  });
}

export function getAgent(orgId: string, id: string) {
  return tenantDb(orgId).outboundAgent.findFirst({
    where: { id },
    include: { actions: { orderBy: { order: "asc" } } },
  });
}

/** Whether the org can host meetings — gates enabling BOOK_MEETING. */
async function isSchedulingAvailable(orgId: string): Promise<boolean> {
  const reps = await prisma.user.count({
    where: { organizationId: orgId, isActive: true },
  });
  return reps > 0;
}

export async function createAgent(orgId: string, input: AgentInput) {
  const db = tenantDb(orgId);
  const agent = await db.outboundAgent.create({
    data: {
      organizationId: orgId,
      name: input.name ?? "New agent",
      language: input.language ?? "en-US",
      voiceId: input.voiceId ?? null,
      persona: input.persona ?? null,
      openingLine: input.openingLine ?? null,
      systemPrompt: input.systemPrompt ?? null,
      goalsJson: (input.goals as Prisma.InputJsonValue) ?? undefined,
      behaviorJson: (input.behavior as Prisma.InputJsonValue) ?? undefined,
      status: input.status ?? "DRAFT",
      providerPhoneNumber: input.providerPhoneNumber ?? null,
      providerPhoneNumberId: input.providerPhoneNumberId ?? null,
    },
  });
  // Seed the full action catalog (all disabled) so the editor can list them.
  await db.outboundAgentAction.createMany({
    data: OUTBOUND_ACTION_TYPES.map((type, i) => ({
      organizationId: orgId,
      outboundAgentId: agent.id,
      type,
      enabled: false,
      order: i,
    })),
  });
  return getAgent(orgId, agent.id);
}

export async function updateAgent(
  orgId: string,
  id: string,
  input: AgentInput,
) {
  const db = tenantDb(orgId);
  const data: Prisma.OutboundAgentUpdateInput = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.language !== undefined) data.language = input.language;
  if (input.voiceId !== undefined) data.voiceId = input.voiceId;
  if (input.persona !== undefined) data.persona = input.persona;
  if (input.openingLine !== undefined) data.openingLine = input.openingLine;
  if (input.systemPrompt !== undefined) data.systemPrompt = input.systemPrompt;
  if (input.goals !== undefined)
    data.goalsJson = input.goals as Prisma.InputJsonValue;
  if (input.behavior !== undefined)
    data.behaviorJson = input.behavior as Prisma.InputJsonValue;
  if (input.status !== undefined) data.status = input.status;
  if (input.providerPhoneNumber !== undefined)
    data.providerPhoneNumber = input.providerPhoneNumber || null;
  if (input.providerPhoneNumberId !== undefined)
    data.providerPhoneNumberId = input.providerPhoneNumberId || null;
  const res = await db.outboundAgent.updateMany({ where: { id }, data });
  if (res.count === 0) return null;
  return getAgent(orgId, id);
}

export async function deleteAgent(orgId: string, id: string) {
  const res = await tenantDb(orgId).outboundAgent.deleteMany({ where: { id } });
  return { deleted: res.count };
}

/**
 * Enable/configure one action on an agent (config-only). Enabling BOOK_MEETING is gated on
 * scheduling being available. Nothing here executes — it only records configuration.
 */
export async function setAgentAction(
  orgId: string,
  agentId: string,
  type: OutboundActionType,
  input: { enabled?: boolean; config?: unknown; order?: number },
) {
  const db = tenantDb(orgId);
  const agent = await db.outboundAgent.findFirst({ where: { id: agentId } });
  if (!agent) throw AppError.notFound("Agent not found");

  if (type === "BOOK_MEETING" && input.enabled) {
    if (!(await isSchedulingAvailable(orgId))) {
      throw AppError.badRequest(
        "BOOK_MEETING requires scheduling — add an active team member first",
      );
    }
  }

  const existing = await db.outboundAgentAction.findFirst({
    where: { outboundAgentId: agentId, type },
  });
  const data = {
    enabled: input.enabled,
    configJson: input.config as Prisma.InputJsonValue | undefined,
    order: input.order,
  };
  if (existing) {
    return db.outboundAgentAction.update({
      where: { id: existing.id },
      data,
    });
  }
  return db.outboundAgentAction.create({
    data: {
      organizationId: orgId,
      outboundAgentId: agentId,
      type,
      enabled: input.enabled ?? false,
      configJson: input.config as Prisma.InputJsonValue | undefined,
      order: input.order ?? 0,
    },
  });
}
