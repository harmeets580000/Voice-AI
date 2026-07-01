/**
 * Outbound meetings + reps contract (Product 2 §F/§Q6).
 */

import { z } from "zod";

export const OutboundMeetingStatusSchema = z.enum([
  "SCHEDULED",
  "COMPLETED",
  "CANCELLED",
  "NO_SHOW",
]);

export const MeetingDTO = z.object({
  id: z.string(),
  leadId: z.string(),
  contactId: z.string(),
  ownerUserId: z.string(),
  startDatetime: z.string(),
  endDatetime: z.string(),
  status: OutboundMeetingStatusSchema,
  notes: z.string().nullable(),
  createdAt: z.string(),
});
export type MeetingDTO = z.infer<typeof MeetingDTO>;

export const MeetingsResponse = z.object({ meetings: z.array(MeetingDTO) });
export type MeetingsResponse = z.infer<typeof MeetingsResponse>;

export const ConvertLeadRequest = z.object({
  leadId: z.string().min(1),
  ownerUserId: z.string().min(1),
  start: z.string().min(1),
  durationMin: z.number().int().positive().optional(),
  notes: z.string().optional(),
});
export type ConvertLeadRequest = z.infer<typeof ConvertLeadRequest>;

export const UpdateMeetingStatusRequest = z.object({
  status: OutboundMeetingStatusSchema,
});
export type UpdateMeetingStatusRequest = z.infer<
  typeof UpdateMeetingStatusRequest
>;

export const RepDTO = z.object({
  id: z.string(),
  name: z.string().nullable(),
  email: z.string(),
});
export const RepsResponse = z.object({ reps: z.array(RepDTO) });
export type RepsResponse = z.infer<typeof RepsResponse>;
