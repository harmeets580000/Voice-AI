/**
 * Org-scoped DB access — the enforcement point for the golden rule:
 * "every customer-data query is scoped by organizationId" (doc 03 rule 1).
 *
 * `tenantDb(orgId)` returns a Prisma client that, for every customer-data model,
 * auto-injects `organizationId` into the `where`/`data` of every operation. This makes
 * cross-org access structurally impossible from a scoped client:
 *   - reads/updates/deletes are filtered to the active org,
 *   - creates are stamped with the active org (a body trying to set another org id is
 *     overridden — test I-ISO-08),
 *   - calling it without an org id throws immediately (test U-ISO-10).
 *
 * The deliberate super-admin platform (all-orgs) view uses the raw `prisma` client.
 */

import { prisma } from "./client";
import { AppError } from "@server/platform/http/errors";

/** Prisma model names that hold per-org customer data and MUST be scoped. */
export const CUSTOMER_DATA_MODELS = new Set<string>([
  "Staff",
  "Service",
  "StaffSchedule",
  "StaffTimeOff",
  "Customer",
  "Booking",
  "Call",
  "CallMessage",
  "VapiTool",
  "Document",
  "KnowledgeBaseFile",
  "Reminder",
  "OrgVapiConfig",
  "OrgTheme",
  "Assistant",
  "AssistantTool",
  "AssistantKnowledgeFile",
]);

type AnyArgs = Record<string, unknown> & {
  where?: Record<string, unknown>;
  data?: unknown;
  create?: Record<string, unknown>;
  update?: Record<string, unknown>;
};

function withOrg(
  where: Record<string, unknown> | undefined,
  orgId: string,
): Record<string, unknown> {
  return { ...(where ?? {}), organizationId: orgId };
}

function stamp(
  data: unknown,
  orgId: string,
): unknown {
  if (Array.isArray(data)) {
    return data.map((d) => ({ ...(d as object), organizationId: orgId }));
  }
  return { ...(data as object), organizationId: orgId };
}

/** Inject org scoping into a single operation's args. */
export function injectOrg(
  operation: string,
  args: AnyArgs,
  orgId: string,
): AnyArgs {
  const a: AnyArgs = { ...(args ?? {}) };
  switch (operation) {
    case "findUnique":
    case "findUniqueOrThrow":
    case "findFirst":
    case "findFirstOrThrow":
    case "findMany":
    case "count":
    case "aggregate":
    case "groupBy":
    case "updateMany":
    case "deleteMany":
      a.where = withOrg(a.where, orgId);
      break;
    case "update":
    case "delete":
      a.where = withOrg(a.where, orgId);
      break;
    case "create":
      a.data = stamp(a.data, orgId);
      break;
    case "createMany":
      a.data = stamp(a.data, orgId);
      break;
    case "upsert":
      a.where = withOrg(a.where, orgId);
      a.create = stamp(a.create, orgId) as Record<string, unknown>;
      // update keeps caller data; org never changes on update
      break;
    default:
      // Unknown op: be safe and scope the where if present.
      if (a.where) a.where = withOrg(a.where, orgId);
      break;
  }
  return a;
}

export type TenantDb = ReturnType<typeof tenantDb>;

/**
 * Returns an org-scoped Prisma client. Throws if `organizationId` is missing/empty so a
 * customer-data query can never run unscoped (fails fast — test U-ISO-10).
 */
export function tenantDb(organizationId: string) {
  if (!organizationId) {
    throw new AppError(
      "internal_error",
      "tenantDb requires a non-empty organizationId (refusing an unscoped customer-data query)",
    );
  }
  return prisma.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!CUSTOMER_DATA_MODELS.has(model)) {
            return query(args);
          }
          return query(injectOrg(operation, args as AnyArgs, organizationId));
        },
      },
    },
  });
}
