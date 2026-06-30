import { z } from "zod";
import { handleRoute, ok, created } from "@server/platform/http/responses";
import { withRequiredOrg } from "@server/platform/auth/context";
import { assertRole } from "@server/platform/auth/rbac";
import { Role } from "@domain/enums";
import { listBookings } from "@server/features/bookings/bookings.service";
import { autoAssignAndBook } from "@server/features/bookings/booking.engine";
import { findOrCreateCustomer } from "@server/features/customers/customers.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CreateBooking = z.object({
  serviceId: z.string().min(1),
  startDatetime: z.string().min(1),
  staffId: z.string().optional(),
  customerId: z.string().optional(),
  // Anyone who books becomes a customer: pass details and we find-or-create one.
  customerName: z.string().optional(),
  customerPhone: z.string().optional(),
  customerEmail: z.string().optional(),
  notes: z.string().optional(),
});

export const GET = handleRoute(async (req) => {
  const { organizationId } = await withRequiredOrg(req);
  const url = new URL(req.url);
  const status = url.searchParams.get("status") ?? undefined;
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  return ok({
    bookings: await listBookings(organizationId, {
      status,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
    }),
  });
});

export const POST = handleRoute(async (req) => {
  const { principal, organizationId } = await withRequiredOrg(req);
  assertRole(principal, [Role.ORG_ADMIN, Role.ORG_STAFF, Role.SUPER_ADMIN]);
  const body = CreateBooking.parse(await req.json());

  // Resolve the customer: an explicit id wins; otherwise find-or-create from the details provided so
  // every booking is linked to a customer record for future reference.
  let customerId = body.customerId ?? null;
  if (!customerId && (body.customerName || body.customerPhone || body.customerEmail)) {
    const customer = await findOrCreateCustomer(organizationId, {
      name: body.customerName,
      phone: body.customerPhone,
      email: body.customerEmail,
    });
    customerId = customer.id;
  }

  const booking = await autoAssignAndBook(organizationId, {
    serviceId: body.serviceId,
    startDatetime: new Date(body.startDatetime),
    staffId: body.staffId ?? null,
    customerId,
    notes: body.notes,
    source: "admin",
  });
  return created({ booking });
});
