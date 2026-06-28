import { handleRoute, ok } from "@server/platform/http/responses";
import { requireRole } from "@server/platform/auth/context";
import { Role } from "@domain/enums";
import {
  provisionAssistant,
  getAssistant,
} from "@server/features/assistants/assistants.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; assistantId: string }> };

/** Provision (idempotent) this assistant's voice resources. Super-admin only. */
export const POST = handleRoute(async (_req, ctx) => {
  const principal = await requireRole([Role.SUPER_ADMIN]);
  const { id, assistantId } = await (ctx as Ctx).params;
  const result = await provisionAssistant(id, assistantId, principal.userId);
  return ok({ ...result, assistant: await getAssistant(id, assistantId) });
});
