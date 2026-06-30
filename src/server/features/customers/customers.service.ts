/**
 * Customers feature — end-callers, org-scoped. Used by the receptionist tools
 * (lookup_customer) and booking (find-or-create by phone).
 */

import { tenantDb } from "@server/platform/db/scoped";

export async function findCustomerByPhone(orgId: string, phone: string) {
  return tenantDb(orgId).customer.findFirst({ where: { phone } });
}

export function getCustomer(orgId: string, id: string) {
  return tenantDb(orgId).customer.findFirst({ where: { id } });
}

export async function updateCustomer(
  orgId: string,
  id: string,
  input: { name?: string; phone?: string; email?: string; notes?: string },
) {
  const db = tenantDb(orgId);
  const data: Record<string, unknown> = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.phone !== undefined) data.phone = input.phone;
  if (input.email !== undefined) data.email = input.email;
  if (input.notes !== undefined) data.notes = input.notes;
  const res = await db.customer.updateMany({ where: { id }, data });
  if (res.count === 0) return null;
  return db.customer.findFirst({ where: { id } });
}

export async function findOrCreateCustomer(
  orgId: string,
  input: { name?: string; phone?: string; email?: string },
) {
  if (input.phone) {
    const existing = await findCustomerByPhone(orgId, input.phone);
    if (existing) {
      // Backfill details we didn't have before (name / email) so future bookings + confirmations work.
      const data: { name?: string; email?: string } = {};
      if (!existing.name && input.name) data.name = input.name;
      if (!existing.email && input.email) data.email = input.email;
      if (Object.keys(data).length > 0) {
        return tenantDb(orgId).customer.update({
          where: { id: existing.id },
          data,
        });
      }
      return existing;
    }
  }
  return tenantDb(orgId).customer.create({
    data: {
      organizationId: orgId,
      name: input.name ?? null,
      phone: input.phone ?? null,
      email: input.email ?? null,
    },
  });
}

export async function createCustomer(
  orgId: string,
  input: { name?: string; phone?: string; email?: string },
) {
  return tenantDb(orgId).customer.create({
    data: {
      organizationId: orgId,
      name: input.name ?? null,
      phone: input.phone ?? null,
      email: input.email ?? null,
    },
  });
}

export async function listCustomers(orgId: string, search?: string) {
  return tenantDb(orgId).customer.findMany({
    where: search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { phone: { contains: search } },
            { email: { contains: search, mode: "insensitive" } },
          ],
        }
      : undefined,
    orderBy: { createdAt: "desc" },
  });
}
