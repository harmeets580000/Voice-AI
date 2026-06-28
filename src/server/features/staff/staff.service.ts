import { tenantDb } from "@server/platform/db/scoped";
import { AppError } from "@server/platform/http/errors";

export function listStaff(orgId: string) {
  return tenantDb(orgId).staff.findMany({ orderBy: { name: "asc" } });
}

export function createStaff(
  orgId: string,
  input: { name: string; email?: string; phone?: string; title?: string },
) {
  return tenantDb(orgId).staff.create({
    data: {
      organizationId: orgId,
      name: input.name,
      email: input.email ?? null,
      phone: input.phone ?? null,
      title: input.title ?? null,
    },
  });
}

export async function updateStaff(
  orgId: string,
  id: string,
  input: Partial<{
    name: string;
    email: string;
    phone: string;
    title: string;
    isActive: boolean;
  }>,
) {
  const res = await tenantDb(orgId).staff.updateMany({
    where: { id },
    data: input,
  });
  if (res.count === 0) throw AppError.notFound("Staff not found");
  return tenantDb(orgId).staff.findFirst({ where: { id } });
}

export async function deleteStaff(orgId: string, id: string) {
  const res = await tenantDb(orgId).staff.deleteMany({ where: { id } });
  if (res.count === 0) throw AppError.notFound("Staff not found");
  return { deleted: true };
}
