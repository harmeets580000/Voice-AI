import { handleRoute, ok, created } from "@server/platform/http/responses";
import { CreateToolRequest, type ToolsResponse } from "@contracts/vapi";
import { requireRole } from "@server/platform/auth/context";
import { Role } from "@domain/enums";
import { listTools, createCustomTool } from "@server/features/tools/tools.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** List the org's tools (built-in + custom). Super-admin only. */
export const GET = handleRoute(async (_req, ctx) => {
  await requireRole([Role.SUPER_ADMIN]);
  const { id } = await (ctx as Ctx).params;
  const res: ToolsResponse = { tools: await listTools(id) };
  return ok(res);
});

/** Create a custom tool for the org. Super-admin only. */
export const POST = handleRoute(async (req, ctx) => {
  await requireRole([Role.SUPER_ADMIN]);
  const { id } = await (ctx as Ctx).params;
  const body = CreateToolRequest.parse(await req.json());
  const tool = await createCustomTool(id, body);
  return created({ tool });
});
