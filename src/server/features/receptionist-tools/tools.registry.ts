/**
 * Tool registry — the single, vendor-neutral source of truth for the receptionist tools the
 * voice assistant (or the simulator) can call. Each entry carries the LLM-facing `description`
 * + `parameters` (JSON schema), the runtime Zod `args`, and a `handler` wired to the shared
 * booking / customer / service / staff services. `runTool` dispatches by name.
 *
 * The first three tools are the auto-provisioned built-ins (`builtinToolDefs()`); the full set
 * is the selectable org-level catalog (`toolCatalog()`), each assistant picking a subset.
 *
 * No vendor SDK is imported here — the adapter translates `{ name, description, parameters }`
 * into the provider's tool schema.
 */

import { AppError } from "@server/platform/http/errors";
import { ToolName, ToolGroup, BookingStatus, type ToolAccess } from "@domain/enums";
import {
  getAvailability,
  autoAssignAndBook,
  cancelBooking,
  rescheduleBooking,
} from "@server/features/bookings/booking.engine";
import { listBookings, getBooking } from "@server/features/bookings/bookings.service";
import {
  findCustomerByPhone,
  findOrCreateCustomer,
  createCustomer,
  updateCustomer,
  getCustomer,
  listCustomers,
} from "@server/features/customers/customers.service";
import {
  listServices,
  getService,
  findServiceByName,
} from "@server/features/services/services.service";
import { listStaff } from "@server/features/staff/staff.service";
import {
  CheckAvailabilityArgs,
  BookAppointmentArgs,
  FindBookingArgs,
  ListBookingsArgs,
  CancelBookingArgs,
  RescheduleBookingArgs,
  LookupCustomerArgs,
  GetCustomerArgs,
  AddCustomerArgs,
  UpdateCustomerArgs,
  ListCustomersArgs,
  GetServiceArgs,
  GetStaffAvailabilityArgs,
} from "./tools.schema";

type Json = Record<string, unknown>;
const obj = (properties: Json, required: string[] = []): Json => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});
const str = (description: string): Json => ({ type: "string", description });
const SERVICE_NEEDED =
  "I couldn't find that service. Call list_services to see what's offered.";

async function resolveServiceId(
  orgId: string,
  a: { serviceId?: string; serviceName?: string },
): Promise<string | null> {
  if (a.serviceId) {
    const s = await getService(orgId, a.serviceId);
    return s ? s.id : null;
  }
  if (a.serviceName) {
    const s = await findServiceByName(orgId, a.serviceName);
    return s ? s.id : null;
  }
  return null;
}

const price = (p: { toString(): string } | null) => (p != null ? Number(p) : null);

/**
 * Per-assistant runtime scope. A `null` dimension means "no restriction" (offer all). Resolved by
 * the caller (the tool webhook / simulator) from the calling assistant's selections and threaded in,
 * so the registry never imports the assistants feature (avoids an import cycle).
 */
export interface AssistantScope {
  serviceIds: string[] | null;
  staffIds: string[] | null;
}

/** Does this scope allow the given service id? (no restriction when serviceIds is null) */
function serviceAllowed(scope: AssistantScope | null | undefined, serviceId: string): boolean {
  return !scope?.serviceIds || scope.serviceIds.includes(serviceId);
}

export interface ToolEntry {
  name: ToolName;
  group: ToolGroup;
  access: ToolAccess;
  /** True for the default auto-provisioned built-ins. */
  builtin: boolean;
  description: string;
  parameters: Json;
  handler: (
    orgId: string,
    args: unknown,
    scope?: AssistantScope | null,
  ) => Promise<unknown>;
}

export const TOOL_REGISTRY: Record<string, ToolEntry> = {
  // ---------------- Booking ----------------
  [ToolName.CHECK_AVAILABILITY]: {
    name: ToolName.CHECK_AVAILABILITY,
    group: ToolGroup.BOOKING,
    access: "read",
    builtin: true,
    description:
      "Check open appointment slots for a service on a given date. Pass the service by name (serviceName) as the caller says it; the date must be YYYY-MM-DD in the business timezone.",
    parameters: obj(
      {
        serviceName: str("Service name as the caller says it, e.g. 'haircut'."),
        serviceId: str("Internal service id (optional if serviceName is given)."),
        date: str("Date to check, formatted YYYY-MM-DD."),
      },
      ["date"],
    ),
    handler: async (orgId, raw, scope) => {
      const a = CheckAvailabilityArgs.parse(raw);
      const serviceId = await resolveServiceId(orgId, a);
      if (!serviceId || !serviceAllowed(scope, serviceId)) {
        return { available: false, slots: [], message: SERVICE_NEEDED };
      }
      const slots = await getAvailability(orgId, serviceId, a.date, scope?.staffIds);
      return {
        available: slots.length > 0,
        slots: slots.map((s) => ({
          start: s.start.toISOString(),
          end: s.end.toISOString(),
        })),
        message:
          slots.length > 0
            ? `There are ${slots.length} open times on ${a.date}.`
            : `Sorry, there are no openings on ${a.date}.`,
      };
    },
  },
  [ToolName.BOOK_APPOINTMENT]: {
    name: ToolName.BOOK_APPOINTMENT,
    group: ToolGroup.BOOKING,
    access: "write",
    builtin: true,
    description:
      "Book an appointment for a customer in an open slot. Confirm the details with the caller first, and ask for their email so we can send a confirmation. startDatetime is ISO-8601 in the business timezone. The appointment is created as pending until the business confirms it.",
    parameters: obj(
      {
        serviceName: str("Service name as the caller says it."),
        serviceId: str("Internal service id (optional if serviceName is given)."),
        startDatetime: str("Appointment start, ISO-8601 (e.g. 2026-07-01T15:00:00)."),
        customerName: str("Caller's name."),
        customerPhone: str("Caller's phone number."),
        customerEmail: str("Caller's email address (for the confirmation email)."),
        notes: str("Any notes for the appointment."),
      },
      ["startDatetime"],
    ),
    handler: async (orgId, raw, scope) => {
      const a = BookAppointmentArgs.parse(raw);
      const serviceId = await resolveServiceId(orgId, a);
      if (!serviceId || !serviceAllowed(scope, serviceId)) {
        return { booked: false, message: SERVICE_NEEDED };
      }
      const customer = await findOrCreateCustomer(orgId, {
        name: a.customerName,
        phone: a.customerPhone,
        email: a.customerEmail,
      });
      try {
        const booking = await autoAssignAndBook(orgId, {
          serviceId,
          startDatetime: new Date(a.startDatetime),
          customerId: customer.id,
          notes: a.notes,
          source: "phone",
          allowedStaffIds: scope?.staffIds,
        });
        return {
          booked: true,
          bookingId: booking.id,
          start: booking.startDatetime.toISOString(),
          message:
            "Your appointment request is received and is pending confirmation. You'll get an email once it's confirmed.",
        };
      } catch (e) {
        if (e instanceof AppError && e.code === "conflict") {
          return { booked: false, message: "That time is not available." };
        }
        throw e;
      }
    },
  },
  [ToolName.FIND_BOOKING]: {
    name: ToolName.FIND_BOOKING,
    group: ToolGroup.BOOKING,
    access: "read",
    builtin: false,
    description:
      "Find a caller's upcoming appointments by phone number (use before cancelling or rescheduling).",
    parameters: obj(
      { phone: str("Caller's phone number."), name: str("Caller's name (optional).") },
      ["phone"],
    ),
    handler: async (orgId, raw) => {
      const a = FindBookingArgs.parse(raw);
      const customer = await findCustomerByPhone(orgId, a.phone);
      if (!customer) {
        return { found: false, bookings: [], message: "No customer found with that number." };
      }
      const bookings = await listBookings(orgId, {
        customerId: customer.id,
        from: new Date(),
        status: BookingStatus.BOOKED,
      });
      return {
        found: bookings.length > 0,
        bookings: bookings.map((b) => ({
          bookingId: b.id,
          start: b.startDatetime.toISOString(),
          service: b.service?.name ?? null,
          staff: b.staff?.name ?? null,
          status: b.status,
        })),
        message:
          bookings.length > 0
            ? `Found ${bookings.length} upcoming appointment(s).`
            : "No upcoming appointments found.",
      };
    },
  },
  [ToolName.LIST_BOOKINGS]: {
    name: ToolName.LIST_BOOKINGS,
    group: ToolGroup.BOOKING,
    access: "read",
    builtin: false,
    description: "List bookings, optionally filtered by date (YYYY-MM-DD) and/or status.",
    parameters: obj({
      date: str("Filter to this date, YYYY-MM-DD."),
      status: str("Filter by status: booked | cancelled | completed | no_show."),
    }),
    handler: async (orgId, raw) => {
      const a = ListBookingsArgs.parse(raw);
      const from = a.date ? new Date(`${a.date}T00:00:00.000Z`) : undefined;
      const to = a.date ? new Date(`${a.date}T23:59:59.999Z`) : undefined;
      const bookings = await listBookings(orgId, { status: a.status, from, to });
      return {
        count: bookings.length,
        bookings: bookings.map((b) => ({
          bookingId: b.id,
          start: b.startDatetime.toISOString(),
          service: b.service?.name ?? null,
          staff: b.staff?.name ?? null,
          customer: b.customer?.name ?? null,
          status: b.status,
        })),
      };
    },
  },
  [ToolName.CANCEL_BOOKING]: {
    name: ToolName.CANCEL_BOOKING,
    group: ToolGroup.BOOKING,
    access: "write",
    builtin: false,
    description:
      "Cancel an appointment by its bookingId (get it from find_booking first). Confirm with the caller before cancelling.",
    parameters: obj({ bookingId: str("The booking id to cancel.") }, ["bookingId"]),
    handler: async (orgId, raw) => {
      const a = CancelBookingArgs.parse(raw);
      const booking = await getBooking(orgId, a.bookingId);
      if (!booking) return { cancelled: false, message: "Booking not found." };
      await cancelBooking(orgId, a.bookingId);
      return { cancelled: true, message: "The appointment has been cancelled." };
    },
  },
  [ToolName.RESCHEDULE_BOOKING]: {
    name: ToolName.RESCHEDULE_BOOKING,
    group: ToolGroup.BOOKING,
    access: "write",
    builtin: false,
    description:
      "Reschedule an appointment to a new time. newStartDatetime is ISO-8601. Confirm with the caller and check availability first.",
    parameters: obj(
      {
        bookingId: str("The booking id to reschedule."),
        newStartDatetime: str("New start time, ISO-8601."),
      },
      ["bookingId", "newStartDatetime"],
    ),
    handler: async (orgId, raw) => {
      const a = RescheduleBookingArgs.parse(raw);
      const booking = await getBooking(orgId, a.bookingId);
      if (!booking) return { rescheduled: false, message: "Booking not found." };
      try {
        const r = await rescheduleBooking(orgId, a.bookingId, new Date(a.newStartDatetime));
        return {
          rescheduled: true,
          bookingId: r.id,
          start: r.startDatetime.toISOString(),
          message: "Your appointment has been rescheduled.",
        };
      } catch (e) {
        if (e instanceof AppError && e.code === "conflict") {
          return { rescheduled: false, message: "That new time is not available." };
        }
        throw e;
      }
    },
  },

  // ---------------- Customer ----------------
  [ToolName.LOOKUP_CUSTOMER]: {
    name: ToolName.LOOKUP_CUSTOMER,
    group: ToolGroup.CUSTOMER,
    access: "read",
    builtin: true,
    description: "Look up an existing customer by phone number.",
    parameters: obj({ phone: str("Customer phone number.") }, ["phone"]),
    handler: async (orgId, raw) => {
      const a = LookupCustomerArgs.parse(raw);
      const customer = await findCustomerByPhone(orgId, a.phone);
      if (!customer) return { found: false, message: "No customer found with that number." };
      return {
        found: true,
        customer: { id: customer.id, name: customer.name, phone: customer.phone },
        message: `Found ${customer.name ?? "a customer"}.`,
      };
    },
  },
  [ToolName.GET_CUSTOMER]: {
    name: ToolName.GET_CUSTOMER,
    group: ToolGroup.CUSTOMER,
    access: "read",
    builtin: false,
    description: "Get a customer's details by customerId or phone number.",
    parameters: obj({
      customerId: str("Internal customer id."),
      phone: str("Customer phone number (if no id)."),
    }),
    handler: async (orgId, raw) => {
      const a = GetCustomerArgs.parse(raw);
      const customer = a.customerId
        ? await getCustomer(orgId, a.customerId)
        : await findCustomerByPhone(orgId, a.phone!);
      if (!customer) return { found: false, message: "Customer not found." };
      return {
        found: true,
        customer: {
          id: customer.id,
          name: customer.name,
          phone: customer.phone,
          email: customer.email,
        },
        message: `Found ${customer.name ?? "a customer"}.`,
      };
    },
  },
  [ToolName.ADD_CUSTOMER]: {
    name: ToolName.ADD_CUSTOMER,
    group: ToolGroup.CUSTOMER,
    access: "write",
    builtin: false,
    description: "Create a new customer record.",
    parameters: obj({
      name: str("Customer name."),
      phone: str("Customer phone number."),
      email: str("Customer email."),
      notes: str("Any notes."),
    }),
    handler: async (orgId, raw) => {
      const a = AddCustomerArgs.parse(raw);
      const customer = await createCustomer(orgId, {
        name: a.name,
        phone: a.phone,
        email: a.email,
      });
      return {
        created: true,
        customerId: customer.id,
        message: `Added ${customer.name ?? "the customer"}.`,
      };
    },
  },
  [ToolName.UPDATE_CUSTOMER]: {
    name: ToolName.UPDATE_CUSTOMER,
    group: ToolGroup.CUSTOMER,
    access: "write",
    builtin: false,
    description: "Update an existing customer's details by customerId.",
    parameters: obj(
      {
        customerId: str("Internal customer id."),
        name: str("New name."),
        phone: str("New phone number."),
        email: str("New email."),
        notes: str("New notes."),
      },
      ["customerId"],
    ),
    handler: async (orgId, raw) => {
      const a = UpdateCustomerArgs.parse(raw);
      const updated = await updateCustomer(orgId, a.customerId, {
        name: a.name,
        phone: a.phone,
        email: a.email,
        notes: a.notes,
      });
      if (!updated) return { updated: false, message: "Customer not found." };
      return { updated: true, message: "Customer updated." };
    },
  },
  [ToolName.LIST_CUSTOMERS]: {
    name: ToolName.LIST_CUSTOMERS,
    group: ToolGroup.CUSTOMER,
    access: "read",
    builtin: false,
    description: "List or search customers (optional free-text search over name/phone/email).",
    parameters: obj({ search: str("Optional search text.") }),
    handler: async (orgId, raw) => {
      const a = ListCustomersArgs.parse(raw);
      const customers = await listCustomers(orgId, a.search);
      return {
        count: customers.length,
        customers: customers.slice(0, 20).map((c) => ({
          id: c.id,
          name: c.name,
          phone: c.phone,
          email: c.email,
        })),
      };
    },
  },

  // ---------------- Service ----------------
  [ToolName.LIST_SERVICES]: {
    name: ToolName.LIST_SERVICES,
    group: ToolGroup.SERVICE,
    access: "read",
    builtin: false,
    description:
      "List the services this business offers (name, duration, price). Use this to map what the caller asks for to a bookable service.",
    parameters: obj({}),
    handler: async (orgId, _raw, scope) => {
      const services = (await listServices(orgId)).filter(
        (s) => !scope?.serviceIds || scope.serviceIds.includes(s.id),
      );
      return {
        count: services.length,
        services: services.map((s) => ({
          id: s.id,
          name: s.name,
          durationMinutes: s.durationMinutes,
          price: price(s.price),
          description: s.description,
        })),
      };
    },
  },
  [ToolName.GET_SERVICE]: {
    name: ToolName.GET_SERVICE,
    group: ToolGroup.SERVICE,
    access: "read",
    builtin: false,
    description: "Get a single service's details by serviceId or name.",
    parameters: obj({
      serviceId: str("Internal service id."),
      name: str("Service name (if no id)."),
    }),
    handler: async (orgId, raw) => {
      const a = GetServiceArgs.parse(raw);
      const service = a.serviceId
        ? await getService(orgId, a.serviceId)
        : await findServiceByName(orgId, a.name!);
      if (!service) return { found: false, message: "Service not found." };
      return {
        found: true,
        service: {
          id: service.id,
          name: service.name,
          durationMinutes: service.durationMinutes,
          price: price(service.price),
          description: service.description,
        },
      };
    },
  },

  // ---------------- Staff ----------------
  [ToolName.LIST_STAFF]: {
    name: ToolName.LIST_STAFF,
    group: ToolGroup.STAFF,
    access: "read",
    builtin: false,
    description: "List the active staff members who can deliver services.",
    parameters: obj({}),
    handler: async (orgId, _raw, scope) => {
      const staff = (await listStaff(orgId)).filter(
        (s) => s.isActive && (!scope?.staffIds || scope.staffIds.includes(s.id)),
      );
      return {
        count: staff.length,
        staff: staff.map((s) => ({ id: s.id, name: s.name, title: s.title })),
      };
    },
  },
  [ToolName.GET_STAFF_AVAILABILITY]: {
    name: ToolName.GET_STAFF_AVAILABILITY,
    group: ToolGroup.STAFF,
    access: "read",
    builtin: false,
    description:
      "Get open slots for a service on a date, with which staff are free for each slot.",
    parameters: obj(
      {
        serviceName: str("Service name as the caller says it."),
        serviceId: str("Internal service id (optional if serviceName is given)."),
        date: str("Date to check, YYYY-MM-DD."),
      },
      ["date"],
    ),
    handler: async (orgId, raw, scope) => {
      const a = GetStaffAvailabilityArgs.parse(raw);
      const serviceId = await resolveServiceId(orgId, a);
      if (!serviceId || !serviceAllowed(scope, serviceId)) {
        return { available: false, slots: [], message: SERVICE_NEEDED };
      }
      const slots = await getAvailability(orgId, serviceId, a.date, scope?.staffIds);
      return {
        date: a.date,
        slots: slots.map((s) => ({
          start: s.start.toISOString(),
          end: s.end.toISOString(),
          availableStaffIds: s.availableStaffIds,
        })),
      };
    },
  },
};

/**
 * Dispatch a normalized tool call to the right tool. Scoped to the given org; `scope` (the calling
 * assistant's selected services/staff, or null for no restriction) narrows booking/service/staff
 * tools to that assistant.
 */
export async function runTool(
  orgId: string,
  scope: AssistantScope | null,
  toolName: string,
  args: unknown,
): Promise<unknown> {
  const entry = TOOL_REGISTRY[toolName];
  if (!entry) throw AppError.badRequest(`Unknown tool: ${toolName}`);
  return entry.handler(orgId, args, scope);
}

/** Definition shape pushed to the voice provider (name + description + JSON-schema params). */
export interface ToolDef {
  name: string;
  group: ToolGroup;
  access: ToolAccess;
  builtin: boolean;
  description: string;
  parameters: Json;
}

const toDef = (e: ToolEntry): ToolDef => ({
  name: e.name,
  group: e.group,
  access: e.access,
  builtin: e.builtin,
  description: e.description,
  parameters: e.parameters,
});

/** The default auto-provisioned built-in tools (with full schemas). */
export function builtinToolDefs(): ToolDef[] {
  return Object.values(TOOL_REGISTRY).filter((e) => e.builtin).map(toDef);
}

/** The full selectable catalog (for the Tools page / per-assistant selection). */
export function toolCatalog(): ToolDef[] {
  return Object.values(TOOL_REGISTRY).map(toDef);
}
