import { handleRoute, ok } from "@server/platform/http/responses";
import { handleToolWebhook } from "@server/channels/voiceWebhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// NOT JWT-authed — server-trusted via the organization_id static parameter (doc 03 rule 3).
export const POST = handleRoute(async (req) => {
  const response = await handleToolWebhook(req);
  return ok(response);
});
