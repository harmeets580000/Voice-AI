/**
 * Reps (Product 2) — the org's users, used as meeting owners + lead owners. Users are a
 * platform model (not customer-data), so this reads the raw client scoped by organizationId.
 */

import { prisma } from "@server/platform/db/client";

export function listReps(orgId: string) {
  return prisma.user.findMany({
    where: { organizationId: orgId, isActive: true },
    select: { id: true, name: true, email: true },
    orderBy: { createdAt: "asc" },
  });
}
