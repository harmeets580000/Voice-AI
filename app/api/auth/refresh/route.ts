import { handleRoute, ok } from "@server/platform/http/responses";
import type { RefreshResponse } from "@contracts/auth";
import { AppError } from "@server/platform/http/errors";
import {
  readRefreshToken,
  setAuthCookies,
  clearAuthCookies,
} from "@server/platform/auth/cookies";
import { verifyToken } from "@server/platform/auth/jwt";
import {
  getUserById,
  issueTokensFor,
} from "@server/features/auth/auth.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = handleRoute(async () => {
  const token = await readRefreshToken();
  if (!token) throw AppError.unauthorized("No refresh token");

  let userId: string;
  try {
    const payload = await verifyToken(token, "refresh");
    userId = payload.sub;
  } catch {
    await clearAuthCookies();
    throw AppError.unauthorized("Invalid or expired refresh token");
  }

  // Re-read the user so role/org changes take effect on refresh (rotation).
  const user = await getUserById(userId);
  const { accessToken, refreshToken } = await issueTokensFor(user);
  await setAuthCookies(accessToken, refreshToken);

  const res: RefreshResponse = { ok: true };
  return ok(res);
});
