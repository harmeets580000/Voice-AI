import { handleRoute, ok } from "@server/platform/http/responses";
import {
  UpdateAssistantRequest,
  type AssistantResponse,
} from "@contracts/assistants";
import { requireRole } from "@server/platform/auth/context";
import { Role } from "@domain/enums";
import {
  getAssistant,
  updateAssistantConfig,
  deleteAssistant,
} from "@server/features/assistants/assistants.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; assistantId: string }> };

export const GET = handleRoute(async (_req, ctx) => {
  await requireRole([Role.SUPER_ADMIN]);
  const { id, assistantId } = await (ctx as Ctx).params;
  const res: AssistantResponse = { assistant: await getAssistant(id, assistantId) };
  return ok(res);
});

export const PUT = handleRoute(async (req, ctx) => {
  await requireRole([Role.SUPER_ADMIN]);
  const { id, assistantId } = await (ctx as Ctx).params;
  const body = UpdateAssistantRequest.parse(await req.json());
  const res: AssistantResponse = {
    assistant: await updateAssistantConfig(id, assistantId, body),
  };
  return ok(res);
});

export const DELETE = handleRoute(async (_req, ctx) => {
  await requireRole([Role.SUPER_ADMIN]);
  const { id, assistantId } = await (ctx as Ctx).params;
  return ok(await deleteAssistant(id, assistantId));
});
