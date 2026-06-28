import { handleRoute, ok } from "@server/platform/http/responses";
import type { AssistantResponse } from "@contracts/assistants";
import { requireRole } from "@server/platform/auth/context";
import { Role } from "@domain/enums";
import { setDefaultAssistant } from "@server/features/assistants/assistants.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; assistantId: string }> };

/** Make this assistant the org's default. Super-admin only. */
export const POST = handleRoute(async (_req, ctx) => {
  await requireRole([Role.SUPER_ADMIN]);
  const { id, assistantId } = await (ctx as Ctx).params;
  const res: AssistantResponse = {
    assistant: await setDefaultAssistant(id, assistantId),
  };
  return ok(res);
});
