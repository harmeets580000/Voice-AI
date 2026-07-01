/**
 * Outbound contacts contract (Product 2) — the FE<->BE seam for the sales Contacts list,
 * CSV import, and bulk actions.
 */

import { z } from "zod";

export const OutboundContactDTO = z.object({
  id: z.string(),
  name: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  notes: z.string().nullable(),
  optOut: z.boolean(),
  optOutReason: z.string().nullable(),
  tags: z.array(z.string()),
  source: z.string().nullable(),
  createdAt: z.string(),
});
export type OutboundContactDTO = z.infer<typeof OutboundContactDTO>;

export const ContactsResponse = z.object({
  contacts: z.array(OutboundContactDTO),
});
export type ContactsResponse = z.infer<typeof ContactsResponse>;

export const CreateContactRequest = z.object({
  name: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  notes: z.string().optional(),
  tags: z.array(z.string()).optional(),
  source: z.string().optional(),
});
export type CreateContactRequest = z.infer<typeof CreateContactRequest>;

export const UpdateContactRequest = CreateContactRequest.extend({
  optOut: z.boolean().optional(),
  optOutReason: z.string().optional(),
});
export type UpdateContactRequest = z.infer<typeof UpdateContactRequest>;

// ---- CSV import ----
export const ImportContactRow = z.object({
  name: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  notes: z.string().optional(),
  tags: z.array(z.string()).optional(),
  source: z.string().optional(),
  customFields: z.record(z.string(), z.unknown()).optional(),
});
export type ImportContactRow = z.infer<typeof ImportContactRow>;

export const ImportContactsRequest = z.object({
  filename: z.string().min(1),
  mapping: z.record(z.string(), z.string()).optional(),
  rows: z.array(ImportContactRow).max(50000),
});
export type ImportContactsRequest = z.infer<typeof ImportContactsRequest>;

export const ImportSummaryDTO = z.object({
  total: z.number(),
  imported: z.number(),
  skipped: z.number(),
  errors: z.array(z.object({ row: z.number(), reason: z.string() })),
});
export type ImportSummaryDTO = z.infer<typeof ImportSummaryDTO>;

// ---- Bulk actions ----
export const BulkContactRequest = z.object({
  ids: z.array(z.string()).min(1),
  action: z.enum(["opt_out", "opt_in", "add_tag", "delete", "promote"]),
  tag: z.string().optional(),
  reason: z.string().optional(),
});
export type BulkContactRequest = z.infer<typeof BulkContactRequest>;
