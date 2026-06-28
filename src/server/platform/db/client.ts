import { PrismaClient } from "@prisma/client";

/**
 * Prisma client singleton. In dev, Next's hot-reload would otherwise create many
 * clients and exhaust connections, so we cache it on globalThis.
 *
 * IMPORTANT: feature code should NOT use this raw client for customer-data tables —
 * use `tenantDb(orgId)` from `scoped.ts`, which enforces org scoping. The raw client is
 * for auth, organization/user management, platform settings, and the deliberate
 * super-admin platform (all-orgs) view.
 */

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
