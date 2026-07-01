import { handleRoute, ok, created } from "@server/platform/http/responses";
import { assertRole } from "@server/platform/auth/rbac";
import { Role } from "@domain/enums";
import { withOutboundOrg } from "@server/features/outbound/guard";
import {
  listLeads,
  createLead,
  type LeadStage,
  type LeadSource,
} from "@server/features/outbound/leads.service";
import { CreateLeadRequest } from "@contracts/outbound-leads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WORK_ROLES = [Role.ORG_ADMIN, Role.ORG_STAFF, Role.SUPER_ADMIN];

export const GET = handleRoute(async (req) => {
  const { organizationId } = await withOutboundOrg(req);
  const url = new URL(req.url);
  const minValueParam = url.searchParams.get("minValue");
  return ok({
    leads: await listLeads(organizationId, {
      stage: (url.searchParams.get("stage") as LeadStage) ?? undefined,
      ownerUserId: url.searchParams.get("owner") ?? undefined,
      source: (url.searchParams.get("source") as LeadSource) ?? undefined,
      minValue: minValueParam ? Number(minValueParam) : undefined,
    }),
  });
});

export const POST = handleRoute(async (req) => {
  const { principal, organizationId } = await withOutboundOrg(req);
  assertRole(principal, WORK_ROLES);
  const body = CreateLeadRequest.parse(await req.json());
  return created({
    lead: await createLead(
      organizationId,
      {
        contactId: body.contactId,
        source: body.source ?? "MANUAL",
        stage: body.stage,
        ownerUserId: body.ownerUserId,
        value: body.value,
      },
      principal.userId,
    ),
  });
});
