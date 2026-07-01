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
  /** New bookings start here — awaiting manual confirmation. Reserves the slot. */
  PENDING: "pending",
  /** Confirmed by staff (sends the confirmation email). Reserves the slot. */
  CONFIRMED: "confirmed",
  /** Legacy synonym of CONFIRMED for rows created before the lifecycle change. */
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

/**
 * Products (modules) an org can enable. AI_RECEPTIONIST is the always-on base product;
 * OUTBOUND_SALES (Product 2) is opt-in via the product registry (OrgProduct).
 */
export const ProductKey = {
  AI_RECEPTIONIST: "AI_RECEPTIONIST",
  OUTBOUND_SALES: "OUTBOUND_SALES",
} as const;
export type ProductKey = (typeof ProductKey)[keyof typeof ProductKey];

export const OrgProductStatus = {
  ACTIVE: "active",
  INACTIVE: "inactive",
} as const;
export type OrgProductStatus =
  (typeof OrgProductStatus)[keyof typeof OrgProductStatus];

/**
 * Receptionist tools the voice provider can call. The first three are the default
 * auto-provisioned built-ins; the rest form the selectable org-level tool catalog
 * (each assistant picks a subset). All are dispatched by the tool registry.
 */
export const ToolName = {
  // Booking
  CHECK_AVAILABILITY: "check_availability",
  BOOK_APPOINTMENT: "book_appointment",
  FIND_BOOKING: "find_booking",
  LIST_BOOKINGS: "list_bookings",
  CANCEL_BOOKING: "cancel_booking",
  RESCHEDULE_BOOKING: "reschedule_booking",
  // Customer
  LOOKUP_CUSTOMER: "lookup_customer",
  GET_CUSTOMER: "get_customer",
  ADD_CUSTOMER: "add_customer",
  UPDATE_CUSTOMER: "update_customer",
  LIST_CUSTOMERS: "list_customers",
  // Service
  LIST_SERVICES: "list_services",
  GET_SERVICE: "get_service",
  // Staff
  LIST_STAFF: "list_staff",
  GET_STAFF_AVAILABILITY: "get_staff_availability",
} as const;
export type ToolName = (typeof ToolName)[keyof typeof ToolName];

/** Tool grouping for the catalog UI. */
export const ToolGroup = {
  BOOKING: "booking",
  CUSTOMER: "customer",
  SERVICE: "service",
  STAFF: "staff",
} as const;
export type ToolGroup = (typeof ToolGroup)[keyof typeof ToolGroup];

/** Read tools are safe to auto-run; write tools mutate data (assistant should confirm). */
export type ToolAccess = "read" | "write";
