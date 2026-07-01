/**
 * Lead pipeline contract (Product 2 §F).
 */

import { z } from "zod";

export const LeadStageSchema = z.enum([
  "NEW",
  "CONTACTED",
  "QUALIFIED",
  "PROPOSAL",
  "WON",
  "LOST",
]);
export type LeadStageDTO = z.infer<typeof LeadStageSchema>;

export const LeadSourceSchema = z.enum([
  "OUTBOUND_CALL",
  "CAMPAIGN",
  "INBOUND_CALL",
  "MANUAL",
  "IMPORT",
]);
export type LeadSourceDTO = z.infer<typeof LeadSourceSchema>;

export const LeadContactSummary = z.object({
  id: z.string(),
  name: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
});

export const LeadActivityDTO = z.object({
  id: z.string(),
  type: z.string(),
  data: z.unknown().nullable(),
  userId: z.string().nullable(),
  createdAt: z.string(),
});
export type LeadActivityDTO = z.infer<typeof LeadActivityDTO>;

export const LeadDTO = z.object({
  id: z.string(),
  contactId: z.string(),
  stage: LeadStageSchema,
  source: LeadSourceSchema,
  ownerUserId: z.string().nullable(),
  value: z.number().nullable(),
  campaignId: z.string().nullable(),
  callId: z.string().nullable(),
  lostReason: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  contact: LeadContactSummary.nullable(),
  activities: z.array(LeadActivityDTO).optional(),
});
export type LeadDTO = z.infer<typeof LeadDTO>;

export const LeadsResponse = z.object({ leads: z.array(LeadDTO) });
export type LeadsResponse = z.infer<typeof LeadsResponse>;

export const CreateLeadRequest = z.object({
  contactId: z.string().min(1),
  source: LeadSourceSchema.optional(),
  stage: LeadStageSchema.optional(),
  ownerUserId: z.string().optional(),
  value: z.number().optional(),
});
export type CreateLeadRequest = z.infer<typeof CreateLeadRequest>;

export const UpdateLeadStageRequest = z.object({
  stage: LeadStageSchema,
  lostReason: z.string().optional(),
});
export type UpdateLeadStageRequest = z.infer<typeof UpdateLeadStageRequest>;

export const AssignLeadRequest = z.object({
  ownerUserId: z.string().nullable(),
});
export type AssignLeadRequest = z.infer<typeof AssignLeadRequest>;

export const AddNoteRequest = z.object({ note: z.string().min(1) });
export type AddNoteRequest = z.infer<typeof AddNoteRequest>;

export const UpdateLeadRequest = z.object({
  value: z.number().nullable().optional(),
  ownerUserId: z.string().nullable().optional(),
});
export type UpdateLeadRequest = z.infer<typeof UpdateLeadRequest>;
