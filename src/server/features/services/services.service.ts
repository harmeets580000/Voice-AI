import { Prisma } from "@prisma/client";
import { tenantDb } from "@server/platform/db/scoped";
import { AppError } from "@server/platform/http/errors";

export function listServices(orgId: string) {
  return tenantDb(orgId).service.findMany({ orderBy: { name: "asc" } });
}

export function getService(orgId: string, id: string) {
  return tenantDb(orgId).service.findFirst({ where: { id } });
}

/**
 * Resolve a service by (case-insensitive) name for voice tools — exact match first, then a
 * unique partial ("contains") match. Returns null if not found or ambiguous (caller can ask
 * the assistant to call list_services).
 */
export async function findServiceByName(orgId: string, name: string) {
  const db = tenantDb(orgId);
  const trimmed = name.trim();
  const exact = await db.service.findFirst({
    where: { name: { equals: trimmed, mode: "insensitive" }, isActive: true },
  });
  if (exact) return exact;
  const partial = await db.service.findMany({
    where: { name: { contains: trimmed, mode: "insensitive" }, isActive: true },
    take: 2,
  });
  return partial.length === 1 ? partial[0] : null;
}

export function createService(
  orgId: string,
  input: {
    name: string;
    description?: string;
    durationMinutes: number;
    price?: number;
  },
) {
  return tenantDb(orgId).service.create({
    data: {
      organizationId: orgId,
      name: input.name,
      description: input.description ?? null,
      durationMinutes: input.durationMinutes,
      price: input.price != null ? new Prisma.Decimal(input.price) : null,
    },
  });
}

export async function updateService(
  orgId: string,
  id: string,
  input: Partial<{
    name: string;
    description: string;
    durationMinutes: number;
    price: number;
    isActive: boolean;
  }>,
) {
  const data: Record<string, unknown> = { ...input };
  if (input.price != null) data.price = new Prisma.Decimal(input.price);
  const res = await tenantDb(orgId).service.updateMany({ where: { id }, data });
  if (res.count === 0) throw AppError.notFound("Service not found");
  return tenantDb(orgId).service.findFirst({ where: { id } });
}

export async function deleteService(orgId: string, id: string) {
  const res = await tenantDb(orgId).service.deleteMany({ where: { id } });
  if (res.count === 0) throw AppError.notFound("Service not found");
  return { deleted: true };
}
