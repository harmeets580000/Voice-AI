import { handleRoute, ok } from "@server/platform/http/responses";
import {
  UpdatePlatformVoiceRequest,
  type PlatformVoiceResponse,
} from "@contracts/vapi";
import { requireRole } from "@server/platform/auth/context";
import { Role } from "@domain/enums";
import {
  getPlatformVoice,
  updatePlatformVoice,
} from "@server/features/platform-settings/platformVoice.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handleRoute(async () => {
  await requireRole([Role.SUPER_ADMIN]);
  const res: PlatformVoiceResponse = { settings: await getPlatformVoice() };
  return ok(res);
});

export const PUT = handleRoute(async (req) => {
  await requireRole([Role.SUPER_ADMIN]);
  const body = UpdatePlatformVoiceRequest.parse(await req.json());
  const res: PlatformVoiceResponse = { settings: await updatePlatformVoice(body) };
  return ok(res);
});
