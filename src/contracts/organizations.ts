import { z } from "zod";

export const OrgStatusEnum = z.enum(["trial", "active", "suspended"]);

export const OrgSummary = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  status: OrgStatusEnum,
});
export type OrgSummary = z.infer<typeof OrgSummary>;

export const OrgListResponse = z.object({
  organizations: z.array(OrgSummary),
});
export type OrgListResponse = z.infer<typeof OrgListResponse>;

export const OrgDetail = OrgSummary.extend({
  timezone: z.string(),
  /** Vapi sync status surfaced for the super-admin org health view. */
  syncStatus: z.enum(["pending", "synced", "failed", "stale"]).nullable(),
  vapiPhoneNumber: z.string().nullable(),
  createdAt: z.string(),
});
export type OrgDetail = z.infer<typeof OrgDetail>;

const slug = z
  .string()
  .min(2)
  .regex(/^[a-z0-9-]+$/, "lowercase letters, numbers, and hyphens only");

export const CreateOrgRequest = z.object({
  name: z.string().min(1),
  slug,
  timezone: z.string().min(1).default("UTC"),
  adminEmail: z.string().email(),
  adminName: z.string().optional(),
  adminPassword: z.string().min(8).optional(),
});
export type CreateOrgRequest = z.infer<typeof CreateOrgRequest>;

export const CreateOrgResponse = z.object({
  organization: OrgDetail,
  /** A temporary admin password if one was generated (shown once). */
  tempPassword: z.string().nullable(),
});
export type CreateOrgResponse = z.infer<typeof CreateOrgResponse>;

export const UpdateOrgRequest = z.object({
  name: z.string().min(1).optional(),
  timezone: z.string().min(1).optional(),
  status: OrgStatusEnum.optional(),
});
export type UpdateOrgRequest = z.infer<typeof UpdateOrgRequest>;
