import { handleRoute, ok } from "@server/platform/http/responses";
import { SimulateRequest, type SimulateResponse } from "@contracts/assistants";
import { requireRole } from "@server/platform/auth/context";
import { Role } from "@domain/enums";
import { simulateAssistantTurn } from "@server/features/assistants/simulator.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; assistantId: string }> };

/** Run one text-chat simulator turn against this assistant (its prompt + selected tools). */
export const POST = handleRoute(async (req, ctx) => {
  await requireRole([Role.SUPER_ADMIN]);
  const { id, assistantId } = await (ctx as Ctx).params;
  const body = SimulateRequest.parse(await req.json());
  const result = await simulateAssistantTurn(id, assistantId, body.messages);
  const res: SimulateResponse = result;
  return ok(res);
});
