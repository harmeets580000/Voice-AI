import { z } from "zod";

/**
 * Neutral tool I/O contract — channel-agnostic (voice now, WhatsApp later). No vendor
 * specifics here. The voice adapter normalizes Vapi payloads into these shapes.
 */

export const CheckAvailabilityArgs = z.object({
  serviceId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD"),
});
export type CheckAvailabilityArgs = z.infer<typeof CheckAvailabilityArgs>;

export const BookAppointmentArgs = z.object({
  serviceId: z.string().min(1),
  startDatetime: z.string().min(1), // ISO 8601
  customerName: z.string().optional(),
  customerPhone: z.string().optional(),
  notes: z.string().optional(),
});
export type BookAppointmentArgs = z.infer<typeof BookAppointmentArgs>;

export const LookupCustomerArgs = z.object({
  phone: z.string().min(1),
});
export type LookupCustomerArgs = z.infer<typeof LookupCustomerArgs>;

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
