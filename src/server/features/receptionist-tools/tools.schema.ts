import { z } from "zod";

/**
 * Neutral tool I/O contract — channel-agnostic (voice now, WhatsApp later). No vendor
 * specifics here. The voice adapter normalizes provider payloads into these shapes.
 *
 * Services are addressed by `serviceName` OR `serviceId` (the assistant only hears a name on
 * a call; we resolve it server-side). The refinements keep the original "serviceId required"
 * behaviour when no name is given.
 */

const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD");

const serviceRef = {
  serviceId: z.string().min(1).optional(),
  serviceName: z.string().min(1).optional(),
};
const hasService = (a: { serviceId?: string; serviceName?: string }) =>
  !!(a.serviceId || a.serviceName);

// ---------- Booking ----------

export const CheckAvailabilityArgs = z
  .object({ ...serviceRef, date: dateOnly })
  .refine(hasService, { message: "serviceId or serviceName is required" });
export type CheckAvailabilityArgs = z.infer<typeof CheckAvailabilityArgs>;

export const BookAppointmentArgs = z
  .object({
    ...serviceRef,
    startDatetime: z.string().min(1), // ISO 8601
    customerName: z.string().optional(),
    customerPhone: z.string().optional(),
    customerEmail: z.string().optional(), // captured so we can email a confirmation
    notes: z.string().optional(),
  })
  .refine(hasService, { message: "serviceId or serviceName is required" });
export type BookAppointmentArgs = z.infer<typeof BookAppointmentArgs>;

export const FindBookingArgs = z.object({
  phone: z.string().min(1),
  name: z.string().optional(),
});
export type FindBookingArgs = z.infer<typeof FindBookingArgs>;

export const ListBookingsArgs = z.object({
  date: dateOnly.optional(),
  status: z.string().optional(),
});
export type ListBookingsArgs = z.infer<typeof ListBookingsArgs>;

export const CancelBookingArgs = z.object({ bookingId: z.string().min(1) });
export type CancelBookingArgs = z.infer<typeof CancelBookingArgs>;

export const RescheduleBookingArgs = z.object({
  bookingId: z.string().min(1),
  newStartDatetime: z.string().min(1), // ISO 8601
});
export type RescheduleBookingArgs = z.infer<typeof RescheduleBookingArgs>;

// ---------- Customer ----------

export const LookupCustomerArgs = z.object({ phone: z.string().min(1) });
export type LookupCustomerArgs = z.infer<typeof LookupCustomerArgs>;

export const GetCustomerArgs = z
  .object({
    customerId: z.string().min(1).optional(),
    phone: z.string().min(1).optional(),
  })
  .refine((a) => a.customerId || a.phone, {
    message: "customerId or phone is required",
  });
export type GetCustomerArgs = z.infer<typeof GetCustomerArgs>;

export const AddCustomerArgs = z
  .object({
    name: z.string().optional(),
    phone: z.string().optional(),
    email: z.string().optional(),
    notes: z.string().optional(),
  })
  .refine((a) => a.name || a.phone, {
    message: "name or phone is required",
  });
export type AddCustomerArgs = z.infer<typeof AddCustomerArgs>;

export const UpdateCustomerArgs = z.object({
  customerId: z.string().min(1),
  name: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  notes: z.string().optional(),
});
export type UpdateCustomerArgs = z.infer<typeof UpdateCustomerArgs>;

export const ListCustomersArgs = z.object({ search: z.string().optional() });
export type ListCustomersArgs = z.infer<typeof ListCustomersArgs>;

// ---------- Service / Staff ----------

export const ListServicesArgs = z.object({});
export type ListServicesArgs = z.infer<typeof ListServicesArgs>;

export const GetServiceArgs = z
  .object({
    serviceId: z.string().min(1).optional(),
    name: z.string().min(1).optional(),
  })
  .refine((a) => a.serviceId || a.name, {
    message: "serviceId or name is required",
  });
export type GetServiceArgs = z.infer<typeof GetServiceArgs>;

export const ListStaffArgs = z.object({});
export type ListStaffArgs = z.infer<typeof ListStaffArgs>;

export const GetStaffAvailabilityArgs = z
  .object({ ...serviceRef, date: dateOnly })
  .refine(hasService, { message: "serviceId or serviceName is required" });
export type GetStaffAvailabilityArgs = z.infer<typeof GetStaffAvailabilityArgs>;

// ---------- Result shapes ----------

export interface CheckAvailabilityResult {
  available: boolean;
  slots: { start: string; end: string }[];
  message: string;
}

export interface BookAppointmentResult {
  booked: boolean;
  bookingId?: string;
  start?: string;
  message: string;
}

export interface LookupCustomerResult {
  found: boolean;
  customer?: { id: string; name: string | null; phone: string | null };
  message: string;
}
