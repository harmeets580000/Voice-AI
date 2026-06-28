import { handleRoute, ok } from "@server/platform/http/responses";
import {
  SetAssistantToolsRequest,
  type AssistantResponse,
} from "@contracts/assistants";
import { requireRole } from "@server/platform/auth/context";
import { Role } from "@domain/enums";
import { setAssistantTools } from "@server/features/assistants/assistants.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; assistantId: string }> };

/** Replace this assistant's selected tools (org-library ids). Super-admin only. */
export const PUT = handleRoute(async (req, ctx) => {
  await requireRole([Role.SUPER_ADMIN]);
  const { id, assistantId } = await (ctx as Ctx).params;
  const body = SetAssistantToolsRequest.parse(await req.json());
  const res: AssistantResponse = {
    assistant: await setAssistantTools(id, assistantId, body.toolIds),
  };
  return ok(res);
});
