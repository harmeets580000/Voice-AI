import { handleRoute, ok } from "@server/platform/http/responses";
import { withRequiredOrg } from "@server/platform/auth/context";
import { getCall } from "@server/features/calls/calls.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handleRoute(async (req, ctx) => {
  const { organizationId } = await withRequiredOrg(req);
  const { id } = await (ctx as Ctx).params;
  return ok({ call: await getCall(organizationId, id) });
});
