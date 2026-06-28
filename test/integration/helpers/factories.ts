import { prisma } from "@server/platform/db/client";
import { hashPassword } from "@server/platform/auth/password";

let n = 0;
const uniq = () => `${Date.now()}-${++n}`;

export async function createOrg(
  over: { name?: string; slug?: string; timezone?: string } = {},
) {
  const slug = over.slug ?? `org-${uniq()}`;
  return prisma.organization.create({
    data: {
      name: over.name ?? `Org ${slug}`,
      slug,
      timezone: over.timezone ?? "America/Los_Angeles",
      status: "active",
      theme: { create: { tokens: {} } },
      vapiConfig: { create: {} },
    },
  });
}

export async function createUser(
  orgId: string | null,
  role: "super_admin" | "org_admin" | "org_staff",
  email?: string,
) {
  return prisma.user.create({
    data: {
      email: email ?? `user-${uniq()}@example.com`,
      passwordHash: await hashPassword("Password123!"),
      role,
      organizationId: orgId,
    },
  });
}

export async function createStaff(orgId: string, name = "Staff") {
  return prisma.staff.create({
    data: { organizationId: orgId, name },
  });
}

export async function createService(orgId: string, durationMinutes = 60) {
  return prisma.service.create({
    data: { organizationId: orgId, name: "Service", durationMinutes },
  });
}

/** Mon–Fri 09:00–17:00 for a staff member. */
export async function createWeekdaySchedule(orgId: string, staffId: string) {
  for (let day = 1; day <= 5; day++) {
    await prisma.staffSchedule.create({
      data: {
        organizationId: orgId,
        staffId,
        dayOfWeek: day,
        startTime: "09:00",
        endTime: "17:00",
      },
    });
  }
}

/** A fully set-up org with one staff member (weekday schedule) and one service. */
export async function createReadyOrg(durationMinutes = 60) {
  const org = await createOrg();
  const staff = await createStaff(org.id);
  await createWeekdaySchedule(org.id, staff.id);
  const service = await createService(org.id, durationMinutes);
  return { org, staff, service };
}
