import { prisma } from "@server/platform/db/client";

/** True only when a test DB is configured — used to skip integration suites otherwise. */
export const hasTestDb = !!process.env.DATABASE_URL_TEST;

/**
 * The schema integration tests live in — NEVER `public`, so truncation cannot touch
 * real/seeded data even when the test DB is the same database as dev.
 */
const TEST_SCHEMA = "app_test";

/** Truncate every app table in the test schema (fast reset between tests). */
export async function truncateAll() {
  const rows = await prisma.$queryRawUnsafe<{ tablename: string }[]>(
    `SELECT tablename FROM pg_tables WHERE schemaname = '${TEST_SCHEMA}' AND tablename NOT LIKE '_prisma%'`,
  );
  if (rows.length === 0) return;
  const list = rows
    .map((r) => `"${TEST_SCHEMA}"."${r.tablename}"`)
    .join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE ${list} RESTART IDENTITY CASCADE`);
}

export async function disconnect() {
  await prisma.$disconnect();
}

export { prisma };
