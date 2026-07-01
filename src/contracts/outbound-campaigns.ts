/**
 * Campaigns contract (Product 2 §D) — VOICE-only this phase.
 */

import { z } from "zod";
import { ContactFilterSchema } from "./outbound-segments";

export const CampaignChannelSchema = z.enum([
  "VOICE",
  "SMS",
  "WHATSAPP",
  "EMAIL",
]);
export const CampaignStatusSchema = z.enum([
  "DRAFT",
  "SCHEDULED",
  "RUNNING",
  "PAUSED",
  "COMPLETED",
  "CANCELLED",
]);
export type CampaignStatusDTO = z.infer<typeof CampaignStatusSchema>;

export const CampaignStatsSchema = z.object({
  total: z.number(),
  queued: z.number(),
  skipped: z.number(),
});

export const CampaignDTO = z.object({
  id: z.string(),
  name: z.string(),
  channel: CampaignChannelSchema,
  outboundAgentId: z.string().nullable(),
  segmentId: z.string().nullable(),
  pacingPerHour: z.number(),
  status: CampaignStatusSchema,
  stats: CampaignStatsSchema.nullable(),
  scheduledAt: z.string().nullable(),
  createdAt: z.string(),
  memberCount: z.number().optional(),
});
export type CampaignDTO = z.infer<typeof CampaignDTO>;

export const CampaignsResponse = z.object({
  campaigns: z.array(CampaignDTO),
});
export type CampaignsResponse = z.infer<typeof CampaignsResponse>;

export const CampaignMemberDTO = z.object({
  id: z.string(),
  contactId: z.string(),
  status: z.string(),
  outboundCallId: z.string().nullable(),
});
export type CampaignMemberDTO = z.infer<typeof CampaignMemberDTO>;

export const CampaignDetailDTO = CampaignDTO.extend({
  members: z.array(CampaignMemberDTO),
});
export type CampaignDetailDTO = z.infer<typeof CampaignDetailDTO>;

export const CreateCampaignRequest = z.object({
  name: z.string().min(1),
  channel: CampaignChannelSchema.optional(),
  outboundAgentId: z.string().optional(),
  segmentId: z.string().optional(),
  audience: ContactFilterSchema.optional(),
  pacingPerHour: z.number().int().positive().optional(),
  scheduledAt: z.string().optional(),
});
export type CreateCampaignRequest = z.infer<typeof CreateCampaignRequest>;

export const UpdateCampaignRequest = CreateCampaignRequest.partial();
export type UpdateCampaignRequest = z.infer<typeof UpdateCampaignRequest>;

export const LaunchResultResponse = z.object({
  total: z.number(),
  queued: z.number(),
  skipped: z.number(),
});
export type LaunchResultResponse = z.infer<typeof LaunchResultResponse>;

export const CampaignStatusRequest = z.object({
  status: z.enum(["PAUSED", "RUNNING", "CANCELLED"]),
});
export type CampaignStatusRequest = z.infer<typeof CampaignStatusRequest>;
