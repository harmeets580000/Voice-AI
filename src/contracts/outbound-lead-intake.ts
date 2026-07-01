/**
 * Lead intake contract (Product 2 §H) — CSV upload + manual "New lead" form.
 */

import { z } from "zod";
import { LeadStageSchema, LeadDTO } from "./outbound-leads";
import { ImportSummaryDTO } from "./outbound-contacts";

export const ImportLeadRow = z.object({
  name: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  notes: z.string().optional(),
  stage: LeadStageSchema.optional(),
  value: z.number().optional(),
});
export type ImportLeadRow = z.infer<typeof ImportLeadRow>;

export const ImportLeadsRequest = z.object({
  filename: z.string().min(1),
  mapping: z.record(z.string(), z.string()).optional(),
  rows: z.array(ImportLeadRow).max(50000),
});
export type ImportLeadsRequest = z.infer<typeof ImportLeadsRequest>;

export { ImportSummaryDTO };

export const ManualLeadRequest = z.object({
  name: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  stage: LeadStageSchema.optional(),
  value: z.number().optional(),
  ownerUserId: z.string().optional(),
  note: z.string().optional(),
});
export type ManualLeadRequest = z.infer<typeof ManualLeadRequest>;

export const ManualLeadResponse = z.object({
  lead: LeadDTO,
  existed: z.boolean(),
});
export type ManualLeadResponse = z.infer<typeof ManualLeadResponse>;
