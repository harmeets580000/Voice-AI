import { handleRoute, ok } from "@server/platform/http/responses";
import {
  SetActiveAssistantRequest,
  type AssistantListResponse,
  type VapiSettingsResponse,
} from "@contracts/vapi";
import { requireRole } from "@server/platform/auth/context";
import { Role } from "@domain/enums";
import {
  listOrgAssistants,
  setActiveAssistant,
} from "@server/features/organizations/organizations.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** List the org's Vapi-account assistants + the active one. Super-admin only. */
export const GET = handleRoute(async (_req, ctx) => {
  await requireRole([Role.SUPER_ADMIN]);
  const { id } = await (ctx as Ctx).params;
  const res: AssistantListResponse = await listOrgAssistants(id);
  return ok(res);
});

/** Set the org's active assistant (loads its config + imports its calls). Super-admin only. */
export const PUT = handleRoute(async (req, ctx) => {
  const principal = await requireRole([Role.SUPER_ADMIN]);
  const { id } = await (ctx as Ctx).params;
  const body = SetActiveAssistantRequest.parse(await req.json());
  const res: VapiSettingsResponse = {
    settings: await setActiveAssistant(id, body.assistantId, principal.userId),
  };
  return ok(res);
});
