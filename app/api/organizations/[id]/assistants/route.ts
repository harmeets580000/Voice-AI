import { handleRoute, ok, created } from "@server/platform/http/responses";
import {
  CreateAssistantRequest,
  type AssistantsResponse,
} from "@contracts/assistants";
import { requireRole } from "@server/platform/auth/context";
import { Role } from "@domain/enums";
import {
  listAssistants,
  createAndProvisionAssistant,
  importAssistant,
} from "@server/features/assistants/assistants.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** List the org's assistants. Super-admin only. */
export const GET = handleRoute(async (_req, ctx) => {
  await requireRole([Role.SUPER_ADMIN]);
  const { id } = await (ctx as Ctx).params;
  const res: AssistantsResponse = { assistants: await listAssistants(id) };
  return ok(res);
});

/**
 * Create a new assistant (also provisioned in Vapi so the same record exists on both sides), or
 * import an existing provider assistant. Super-admin only.
 */
export const POST = handleRoute(async (req, ctx) => {
  const principal = await requireRole([Role.SUPER_ADMIN]);
  const { id } = await (ctx as Ctx).params;
  const body = CreateAssistantRequest.parse(await req.json());
  const assistant = body.importProviderAssistantId
    ? await importAssistant(id, body.importProviderAssistantId, body.name)
    : await createAndProvisionAssistant(
        id,
        {
          name: body.name,
          greeting: body.greeting,
          prompt: body.prompt,
          voice: body.voice,
          llmModel: body.llmModel,
        },
        principal.userId,
      );
  return created({ assistant });
});
