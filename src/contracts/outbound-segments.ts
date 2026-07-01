/**
 * Contact segments contract (Product 2) — saved audience filters + live audience count.
 */

import { z } from "zod";

export const ContactFilterSchema = z.object({
  search: z.string().optional(),
  tags: z.array(z.string()).optional(),
  source: z.string().optional(),
  optOut: z.boolean().optional(),
});
export type ContactFilterSchema = z.infer<typeof ContactFilterSchema>;

export const SegmentDTO = z.object({
  id: z.string(),
  name: z.string(),
  filter: ContactFilterSchema,
  createdAt: z.string(),
});
export type SegmentDTO = z.infer<typeof SegmentDTO>;

export const SegmentsResponse = z.object({
  segments: z.array(SegmentDTO),
});
export type SegmentsResponse = z.infer<typeof SegmentsResponse>;

export const CreateSegmentRequest = z.object({
  name: z.string().min(1),
  filter: ContactFilterSchema,
});
export type CreateSegmentRequest = z.infer<typeof CreateSegmentRequest>;

export const AudienceCountRequest = z.object({
  filter: ContactFilterSchema,
});
export type AudienceCountRequest = z.infer<typeof AudienceCountRequest>;

export const AudienceCountResponse = z.object({
  count: z.number(),
});
export type AudienceCountResponse = z.infer<typeof AudienceCountResponse>;
