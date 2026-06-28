import { handleRoute, ok } from "@server/platform/http/responses";
import type { ToolCatalogResponse } from "@contracts/assistants";
import { requireRole } from "@server/platform/auth/context";
import { Role } from "@domain/enums";
import { toolCatalog } from "@server/features/receptionist-tools/tools.registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The full selectable tool catalog (grouped, read/write). Super-admin only. */
export const GET = handleRoute(async () => {
  await requireRole([Role.SUPER_ADMIN]);
  const res: ToolCatalogResponse = {
    tools: toolCatalog() as ToolCatalogResponse["tools"],
  };
  return ok(res);
});
