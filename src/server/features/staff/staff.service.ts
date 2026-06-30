import { Prisma } from "@prisma/client";
import { tenantDb } from "@server/platform/db/scoped";
import { AppError } from "@server/platform/http/errors";

const STAFF_INCLUDE = { services: { select: { serviceId: true } } } as const;

type StaffWithServices = Prisma.StaffGetPayload<{
  include: { services: { select: { serviceId: true } } };
}>;

/** Flatten the StaffService join into a `serviceIds: string[]` field on the staff DTO. */
function toStaffDTO(s: StaffWithServices) {
  const { services, ...rest } = s;
  return { ...rest, serviceIds: services.map((x) => x.serviceId) };
}

export async function listStaff(orgId: string) {
  const rows = await tenantDb(orgId).staff.findMany({
    orderBy: { name: "asc" },
    include: STAFF_INCLUDE,
  });
  return rows.map(toStaffDTO);
}

async function getStaffDTO(orgId: string, id: string) {
  const s = await tenantDb(orgId).staff.findFirst({
    where: { id },
    include: STAFF_INCLUDE,
  });
  return s ? toStaffDTO(s) : null;
}

export async function createStaff(
  orgId: string,
  input: {
    name: string;
    email?: string;
    phone?: string;
    title?: string;
    serviceIds?: string[];
  },
) {
  const staff = await tenantDb(orgId).staff.create({
    data: {
      organizationId: orgId,
      name: input.name,
      email: input.email ?? null,
      phone: input.phone ?? null,
      title: input.title ?? null,
    },
  });
  if (input.serviceIds) await setStaffServices(orgId, staff.id, input.serviceIds);
  return getStaffDTO(orgId, staff.id);
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
    serviceIds: string[];
  }>,
) {
  const { serviceIds, ...scalars } = input;
  const res = await tenantDb(orgId).staff.updateMany({
    where: { id },
    data: scalars,
  });
  if (res.count === 0) throw AppError.notFound("Staff not found");
  if (serviceIds !== undefined) await setStaffServices(orgId, id, serviceIds);
  return getStaffDTO(orgId, id);
}

export async function deleteStaff(orgId: string, id: string) {
  const res = await tenantDb(orgId).staff.deleteMany({ where: { id } });
  if (res.count === 0) throw AppError.notFound("Staff not found");
  return { deleted: true };
}

/**
 * Replace which services this staff member can deliver. EMPTY list = no restriction (can deliver
 * ALL services). Validates the staff member and every service id belong to this org.
 */
export async function setStaffServices(
  orgId: string,
  staffId: string,
  serviceIds: string[],
) {
  const db = tenantDb(orgId);
  const staff = await db.staff.findFirst({ where: { id: staffId }, select: { id: true } });
  if (!staff) throw AppError.notFound("Staff not found");

  if (serviceIds.length > 0) {
    const valid = await db.service.findMany({
      where: { id: { in: serviceIds } },
      select: { id: true },
    });
    const validIds = new Set(valid.map((s) => s.id));
    for (const id of serviceIds) {
      if (!validIds.has(id)) throw AppError.badRequest(`Unknown service: ${id}`);
    }
  }

  await db.staffService.deleteMany({ where: { staffId } });
  if (serviceIds.length > 0) {
    await db.staffService.createMany({
      data: serviceIds.map((serviceId) => ({ organizationId: orgId, staffId, serviceId })),
      skipDuplicates: true,
    });
  }
  return getStaffDTO(orgId, staffId);
}

/**
 * The set of staff ids (from `candidateIds`) allowed to deliver `serviceId`. A staff member with NO
 * StaffService rows is unrestricted (can do all); otherwise they must have a row for this service.
 */
export async function filterStaffByServiceCapability(
  orgId: string,
  serviceId: string,
  candidateIds: string[],
): Promise<string[]> {
  if (candidateIds.length === 0) return candidateIds;
  const db = tenantDb(orgId);
  const rows = await db.staffService.findMany({
    where: { staffId: { in: candidateIds } },
    select: { staffId: true, serviceId: true },
  });
  const boundByStaff = new Map<string, Set<string>>();
  for (const r of rows) {
    const set = boundByStaff.get(r.staffId) ?? new Set<string>();
    set.add(r.serviceId);
    boundByStaff.set(r.staffId, set);
  }
  return candidateIds.filter((id) => {
    const bound = boundByStaff.get(id);
    return !bound || bound.has(serviceId); // no bindings = can do all
  });
}
