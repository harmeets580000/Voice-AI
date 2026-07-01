/**
 * Outbound Agents contract (Product 2 §C). Config-only sales scripts + their action catalog.
 */

import { z } from "zod";

export const OutboundAgentStatusSchema = z.enum([
  "DRAFT",
  "ACTIVE",
  "INACTIVE",
]);
export type OutboundAgentStatusDTO = z.infer<typeof OutboundAgentStatusSchema>;

export const OutboundActionTypeSchema = z.enum([
  "QUALIFY_LEAD",
  "BOOK_MEETING",
  "CAPTURE_CONTACT",
  "SEND_FOLLOWUP",
  "MARK_DNC",
  "ANSWER_KB",
]);
export type OutboundActionTypeDTO = z.infer<typeof OutboundActionTypeSchema>;

export const AgentActionDTO = z.object({
  id: z.string(),
  type: OutboundActionTypeSchema,
  enabled: z.boolean(),
  configJson: z.unknown().nullable(),
  order: z.number(),
});
export type AgentActionDTO = z.infer<typeof AgentActionDTO>;

export const OutboundAgentDTO = z.object({
  id: z.string(),
  name: z.string(),
  language: z.string(),
  voiceId: z.string().nullable(),
  persona: z.string().nullable(),
  openingLine: z.string().nullable(),
  systemPrompt: z.string().nullable(),
  goalsJson: z.unknown().nullable(),
  providerPhoneNumber: z.string().nullable(),
  providerPhoneNumberId: z.string().nullable(),
  status: OutboundAgentStatusSchema,
  createdAt: z.string(),
  actions: z.array(AgentActionDTO),
});
export type OutboundAgentDTO = z.infer<typeof OutboundAgentDTO>;

export const AgentsResponse = z.object({
  agents: z.array(OutboundAgentDTO),
});
export type AgentsResponse = z.infer<typeof AgentsResponse>;

export const CreateAgentRequest = z.object({
  name: z.string().min(1),
  language: z.string().optional(),
  voiceId: z.string().optional(),
  persona: z.string().optional(),
  openingLine: z.string().optional(),
  systemPrompt: z.string().optional(),
  goals: z.record(z.string(), z.unknown()).optional(),
  providerPhoneNumber: z.string().optional(),
  providerPhoneNumberId: z.string().optional(),
});
export type CreateAgentRequest = z.infer<typeof CreateAgentRequest>;

export const UpdateAgentRequest = CreateAgentRequest.partial().extend({
  status: OutboundAgentStatusSchema.optional(),
});
export type UpdateAgentRequest = z.infer<typeof UpdateAgentRequest>;

export const SetAgentActionRequest = z.object({
  enabled: z.boolean().optional(),
  config: z.record(z.string(), z.unknown()).optional(),
  order: z.number().optional(),
});
export type SetAgentActionRequest = z.infer<typeof SetAgentActionRequest>;
