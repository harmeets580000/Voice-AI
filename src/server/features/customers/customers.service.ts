/**
 * Customers feature — end-callers, org-scoped. Used by the receptionist tools
 * (lookup_customer) and booking (find-or-create by phone).
 */

import { tenantDb } from "@server/platform/db/scoped";

export async function findCustomerByPhone(orgId: string, phone: string) {
  return tenantDb(orgId).customer.findFirst({ where: { phone } });
}

export async function findOrCreateCustomer(
  orgId: string,
  input: { name?: string; phone?: string; email?: string },
) {
  if (input.phone) {
    const existing = await findCustomerByPhone(orgId, input.phone);
    if (existing) {
      // Fill in a name we didn't have before.
      if (!existing.name && input.name) {
        return tenantDb(orgId).customer.update({
          where: { id: existing.id },
          data: { name: input.name },
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
