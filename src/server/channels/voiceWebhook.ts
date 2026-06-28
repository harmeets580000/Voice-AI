/**
 * Voice channel entrypoint helpers. The active voice adapter parses the vendor payload;
 * dispatch + persistence are vendor-neutral. Tenant identity is server-trusted from the
 * `organization_id` query param we baked into the webhook URL at provisioning (the AI
 * never sees it) — never from anything the model could influence (doc 03 rule 3).
 */

import { getVoiceProvider } from "@server/config/providers";
import { runTool } from "@server/features/receptionist-tools/tools.service";
import { saveCallRecord } from "@server/features/calls/calls.service";
import { AppError } from "@server/platform/http/errors";
import { logger } from "@server/platform/logging/logger";

function queryFromUrl(url: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of new URL(url).searchParams.entries()) out[k] = v;
  return out;
}

/** Handle an inbound tool-call webhook → run the tool, return the vendor response shape. */
export async function handleToolWebhook(req: Request): Promise<unknown> {
  const provider = getVoiceProvider();
  const body = await req.json().catch(() => ({}));
  const query = queryFromUrl(req.url);

  const call = provider.parseInboundToolCall({ body, query });
  if (!call.organizationId) {
    throw AppError.badRequest("Missing organization_id (server-trusted) on tool call");
  }
  const result = await runTool(call.organizationId, String(call.toolName), call.args);
  return provider.formatToolResponse(call.toolCallId, result);
}

/** Handle an end-of-call webhook → persist the call record (idempotent). */
export async function handleCallEndedWebhook(req: Request): Promise<void> {
  const provider = getVoiceProvider();
  const body = await req.json().catch(() => ({}));
  const query = queryFromUrl(req.url);

  const record = provider.parseCallEnded({ body, query });
  if (!record.organizationId) {
    // Cross-check would also use the mirrored assistant/phone ids; for now require the param.
    throw AppError.badRequest("Missing organization_id (server-trusted) on call-ended");
  }
  await saveCallRecord(record);
  logger.info("Saved call record", {
    organizationId: record.organizationId,
    vapiCallId: record.providerCallId,
  });
}
