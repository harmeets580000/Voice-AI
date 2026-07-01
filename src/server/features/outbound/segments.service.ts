/**
 * Contact segments (Product 2) — saved, reusable audience filters over OutboundContacts.
 * Audience resolution ALWAYS excludes opted-out contacts (compliance: opt-out is honored on
 * every audience/launch path). Used by the Segments UI and by campaign launch (Q5).
 */

import type { Prisma } from "@prisma/client";
import { tenantDb } from "@server/platform/db/scoped";
import { AppError } from "@server/platform/http/errors";
import { buildContactWhere, type ContactFilter } from "./contacts.service";

export function listSegments(orgId: string) {
  return tenantDb(orgId).contactSegment.findMany({
    orderBy: { createdAt: "desc" },
  });
}

export function getSegment(orgId: string, id: string) {
  return tenantDb(orgId).contactSegment.findFirst({ where: { id } });
}

export function createSegment(
  orgId: string,
  input: { name: string; filter: ContactFilter },
) {
  return tenantDb(orgId).contactSegment.create({
    data: {
      organizationId: orgId,
      name: input.name,
      filterJson: input.filter as Prisma.InputJsonValue,
    },
  });
}

export async function deleteSegment(orgId: string, id: string) {
  const res = await tenantDb(orgId).contactSegment.deleteMany({ where: { id } });
  return { deleted: res.count };
}

/** The `where` for an audience — the filter, with opted-out contacts always excluded. */
export function audienceWhere(
  filter: ContactFilter,
): Prisma.OutboundContactWhereInput {
  return buildContactWhere({ ...filter, optOut: false });
}

/** Resolve a filter to the live audience (opt-out excluded). */
export function resolveAudience(orgId: string, filter: ContactFilter) {
  return tenantDb(orgId).outboundContact.findMany({
    where: audienceWhere(filter),
    orderBy: { createdAt: "desc" },
  });
}

/** Count the live audience for a filter (opt-out excluded) — used for the wizard's live count. */
export function countAudience(orgId: string, filter: ContactFilter) {
  return tenantDb(orgId).outboundContact.count({ where: audienceWhere(filter) });
}

/** Resolve a saved segment to its live audience. */
export async function resolveSegmentAudience(orgId: string, segmentId: string) {
  const segment = await getSegment(orgId, segmentId);
  if (!segment) throw AppError.notFound("Segment not found");
  return resolveAudience(orgId, (segment.filterJson ?? {}) as ContactFilter);
}
