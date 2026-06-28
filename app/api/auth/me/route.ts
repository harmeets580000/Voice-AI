import { handleRoute, ok } from "@server/platform/http/responses";
import type { MeResponse } from "@contracts/auth";
import { requireAuth } from "@server/platform/auth/context";
import { getUserById, toAuthUser } from "@server/features/auth/auth.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handleRoute(async () => {
  const principal = await requireAuth();
  const user = await getUserById(principal.userId);
  const res: MeResponse = { user: toAuthUser(user) };
  return ok(res);
});
