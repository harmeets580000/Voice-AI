import { handleRoute, ok } from "@server/platform/http/responses";
import { withRequiredOrg } from "@server/platform/auth/context";
import { listCalls } from "@server/features/calls/calls.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handleRoute(async (req) => {
  const { organizationId } = await withRequiredOrg(req);
  const assistantId =
    new URL(req.url).searchParams.get("assistantId") ?? undefined;
  return ok({ calls: await listCalls(organizationId, { assistantId }) });
});
