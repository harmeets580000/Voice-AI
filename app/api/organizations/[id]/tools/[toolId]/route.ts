import { handleRoute, ok } from "@server/platform/http/responses";
import { UpdateToolRequest } from "@contracts/vapi";
import { requireRole } from "@server/platform/auth/context";
import { Role } from "@domain/enums";
import { updateTool, deleteTool } from "@server/features/tools/tools.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; toolId: string }> };

/** Update a tool (enable/disable, description, parameters, custom serverUrl). Super-admin only. */
export const PATCH = handleRoute(async (req, ctx) => {
  await requireRole([Role.SUPER_ADMIN]);
  const { id, toolId } = await (ctx as Ctx).params;
  const body = UpdateToolRequest.parse(await req.json());
  const tool = await updateTool(id, toolId, body);
  return ok({ tool });
});

/** Delete a custom tool (built-ins can only be disabled). Super-admin only. */
export const DELETE = handleRoute(async (_req, ctx) => {
  await requireRole([Role.SUPER_ADMIN]);
  const { id, toolId } = await (ctx as Ctx).params;
  return ok(await deleteTool(id, toolId));
});
