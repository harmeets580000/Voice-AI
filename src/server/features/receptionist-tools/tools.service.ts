/**
 * Receptionist tools — channel-agnostic business logic the voice provider calls. Pure of
 * any vendor/Vapi specifics: each takes (orgId, args) and uses the booking/customer
 * services. The voice adapter is responsible for parsing/formatting vendor payloads.
 */

import { AppError } from "@server/platform/http/errors";
import { ToolName } from "@domain/enums";
import {
  getAvailability,
  autoAssignAndBook,
} from "@server/features/bookings/booking.engine";
import {
  findCustomerByPhone,
  findOrCreateCustomer,
} from "@server/features/customers/customers.service";
import {
  CheckAvailabilityArgs,
  BookAppointmentArgs,
  LookupCustomerArgs,
  type CheckAvailabilityResult,
  type BookAppointmentResult,
  type LookupCustomerResult,
} from "./tools.schema";

export async function checkAvailability(
  orgId: string,
  raw: unknown,
): Promise<CheckAvailabilityResult> {
  const args = CheckAvailabilityArgs.parse(raw);
  const slots = await getAvailability(orgId, args.serviceId, args.date);
  return {
    available: slots.length > 0,
    slots: slots.map((s) => ({
      start: s.start.toISOString(),
      end: s.end.toISOString(),
    })),
    message:
      slots.length > 0
        ? `There are ${slots.length} open times on ${args.date}.`
        : `Sorry, there are no openings on ${args.date}.`,
  };
}

export async function bookAppointment(
  orgId: string,
  raw: unknown,
): Promise<BookAppointmentResult> {
  const args = BookAppointmentArgs.parse(raw);
  const customer = await findOrCreateCustomer(orgId, {
    name: args.customerName,
    phone: args.customerPhone,
  });
  try {
    const booking = await autoAssignAndBook(orgId, {
      serviceId: args.serviceId,
      startDatetime: new Date(args.startDatetime),
      customerId: customer.id,
      notes: args.notes,
      source: "phone",
    });
    return {
      booked: true,
      bookingId: booking.id,
      start: booking.startDatetime.toISOString(),
      message: "Your appointment is booked.",
    };
  } catch (e) {
    if (e instanceof AppError && e.code === "conflict") {
      return { booked: false, message: "That time is not available." };
    }
    throw e;
  }
}

export async function lookupCustomer(
  orgId: string,
  raw: unknown,
): Promise<LookupCustomerResult> {
  const args = LookupCustomerArgs.parse(raw);
  const customer = await findCustomerByPhone(orgId, args.phone);
  if (!customer) {
    return { found: false, message: "No customer found with that number." };
  }
  return {
    found: true,
    customer: { id: customer.id, name: customer.name, phone: customer.phone },
    message: `Found ${customer.name ?? "a customer"}.`,
  };
}

/** Dispatch a normalized tool call to the right tool. Scoped to the given org. */
export async function runTool(
  orgId: string,
  toolName: string,
  args: unknown,
): Promise<unknown> {
  switch (toolName) {
    case ToolName.CHECK_AVAILABILITY:
      return checkAvailability(orgId, args);
    case ToolName.BOOK_APPOINTMENT:
      return bookAppointment(orgId, args);
    case ToolName.LOOKUP_CUSTOMER:
      return lookupCustomer(orgId, args);
    default:
      throw AppError.badRequest(`Unknown tool: ${toolName}`);
  }
}
