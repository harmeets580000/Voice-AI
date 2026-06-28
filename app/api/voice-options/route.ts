import { handleRoute, ok } from "@server/platform/http/responses";
import type { VoiceOptionsResponse } from "@contracts/vapi";
import { requireRole } from "@server/platform/auth/context";
import { Role } from "@domain/enums";
import { getVoiceProvider } from "@server/config/providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Available voices + LLM models (live where possible, curated fallback). Super-admin. */
export const GET = handleRoute(async () => {
  await requireRole([Role.SUPER_ADMIN]);
  const provider = getVoiceProvider();
  const [voices, models] = await Promise.all([
    provider.listVoices(),
    provider.listModels(),
  ]);
  const res: VoiceOptionsResponse = { voices, models };
  return ok(res);
});
