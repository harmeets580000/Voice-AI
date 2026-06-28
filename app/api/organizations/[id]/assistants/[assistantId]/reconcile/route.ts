import { handleRoute, ok } from "@server/platform/http/responses";
import type { AssistantResponse } from "@contracts/assistants";
import { requireRole } from "@server/platform/auth/context";
import { Role } from "@domain/enums";
import { reconcileAssistant } from "@server/features/assistants/assistants.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; assistantId: string }> };

/** Re-attach this assistant's selected tools to the provider assistant. Super-admin only. */
export const POST = handleRoute(async (_req, ctx) => {
  await requireRole([Role.SUPER_ADMIN]);
  const { id, assistantId } = await (ctx as Ctx).params;
  const res: AssistantResponse = {
    assistant: await reconcileAssistant(id, assistantId),
  };
  return ok(res);
});
