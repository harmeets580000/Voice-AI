import { handleRoute, ok, created } from "@server/platform/http/responses";
import { assertRole } from "@server/platform/auth/rbac";
import { Role } from "@domain/enums";
import { withOutboundOrg } from "@server/features/outbound/guard";
import {
  listSegments,
  createSegment,
} from "@server/features/outbound/segments.service";
import { CreateSegmentRequest } from "@contracts/outbound-segments";
import type { ContactFilter } from "@server/features/outbound/contacts.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handleRoute(async (req) => {
  const { organizationId } = await withOutboundOrg(req);
  const segments = await listSegments(organizationId);
  return ok({
    segments: segments.map((s) => ({
      id: s.id,
      name: s.name,
      filter: (s.filterJson ?? {}) as ContactFilter,
      createdAt: s.createdAt,
    })),
  });
});

export const POST = handleRoute(async (req) => {
  const { principal, organizationId } = await withOutboundOrg(req);
  assertRole(principal, [Role.ORG_ADMIN, Role.ORG_STAFF, Role.SUPER_ADMIN]);
  const body = CreateSegmentRequest.parse(await req.json());
  return created({
    segment: await createSegment(organizationId, {
      name: body.name,
      filter: body.filter,
    }),
  });
});
