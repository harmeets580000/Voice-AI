/**
 * Shared domain enums/types — framework- and vendor-agnostic.
 * These mirror the Prisma enums (single source of truth in schema.prisma) but are
 * usable on both the client and server without importing Prisma.
 */

export const Role = {
  SUPER_ADMIN: "super_admin",
  ORG_ADMIN: "org_admin",
  ORG_STAFF: "org_staff",
} as const;
export type Role = (typeof Role)[keyof typeof Role];

export const BookingStatus = {
  BOOKED: "booked",
  CANCELLED: "cancelled",
  COMPLETED: "completed",
  NO_SHOW: "no_show",
} as const;
export type BookingStatus = (typeof BookingStatus)[keyof typeof BookingStatus];

export const BookingSource = {
  PHONE: "phone",
  WHATSAPP: "whatsapp",
  WEB: "web",
  ADMIN: "admin",
} as const;
export type BookingSource = (typeof BookingSource)[keyof typeof BookingSource];

export const OrgStatus = {
  TRIAL: "trial",
  ACTIVE: "active",
  SUSPENDED: "suspended",
} as const;
export type OrgStatus = (typeof OrgStatus)[keyof typeof OrgStatus];

export const ReminderChannel = {
  SMS: "sms",
  WHATSAPP: "whatsapp",
  EMAIL: "email",
} as const;
export type ReminderChannel =
  (typeof ReminderChannel)[keyof typeof ReminderChannel];

export const ReminderStatus = {
  PENDING: "pending",
  SENT: "sent",
  FAILED: "failed",
} as const;
export type ReminderStatus =
  (typeof ReminderStatus)[keyof typeof ReminderStatus];

export const SyncStatus = {
  PENDING: "pending",
  SYNCED: "synced",
  FAILED: "failed",
  STALE: "stale",
} as const;
export type SyncStatus = (typeof SyncStatus)[keyof typeof SyncStatus];

export const VoiceProviderName = {
  VAPI: "vapi",
  RETELL: "retell",
} as const;
export type VoiceProviderName =
  (typeof VoiceProviderName)[keyof typeof VoiceProviderName];

export const CallDirection = {
  INBOUND: "inbound",
  OUTBOUND: "outbound",
} as const;
export type CallDirection = (typeof CallDirection)[keyof typeof CallDirection];

/** The three custom tools the voice provider calls. */
export const ToolName = {
  CHECK_AVAILABILITY: "check_availability",
  BOOK_APPOINTMENT: "book_appointment",
  LOOKUP_CUSTOMER: "lookup_customer",
} as const;
export type ToolName = (typeof ToolName)[keyof typeof ToolName];
