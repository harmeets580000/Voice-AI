import { handleRoute, ok } from "@server/platform/http/responses";
import { clearAuthCookies } from "@server/platform/auth/cookies";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = handleRoute(async () => {
  await clearAuthCookies();
  return ok({ ok: true });
});
