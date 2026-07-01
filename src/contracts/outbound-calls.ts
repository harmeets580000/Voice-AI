/**
 * Outbound calls + from-number contract (Product 2 §E). The from-number is the org's Vapi number,
 * configured on the Outbound Agent — there is no standalone phone-number list.
 */

import { z } from "zod";

export const OutboundCallStatusSchema = z.enum([
  "QUEUED",
  "RINGING",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
]);

/** A phone number available in the org's Vapi account (from-number picker on the agent). */
export const VapiNumberDTO = z.object({
  id: z.string(),
  number: z.string(),
});
export type VapiNumberDTO = z.infer<typeof VapiNumberDTO>;

export const VapiNumbersResponse = z.object({
  numbers: z.array(VapiNumberDTO),
});
export type VapiNumbersResponse = z.infer<typeof VapiNumbersResponse>;

export const OutboundCallDTO = z.object({
  id: z.string(),
  contactId: z.string().nullable(),
  leadId: z.string().nullable(),
  campaignId: z.string().nullable(),
  outboundAgentId: z.string().nullable(),
  status: OutboundCallStatusSchema,
  fromNumber: z.string().nullable(),
  toNumber: z.string().nullable(),
  createdAt: z.string(),
});
export type OutboundCallDTO = z.infer<typeof OutboundCallDTO>;

// A one-off call requires an agent (it supplies both the script and the from-number).
export const PlaceCallRequest = z
  .object({
    contactId: z.string().optional(),
    leadId: z.string().optional(),
    agentId: z.string().min(1),
  })
  .refine((v) => v.contactId || v.leadId, {
    message: "A contact or lead is required",
  });
export type PlaceCallRequest = z.infer<typeof PlaceCallRequest>;
