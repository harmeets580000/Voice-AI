import { handleRoute, ok } from "@server/platform/http/responses";
import { LoginRequest, type LoginResponse } from "@contracts/auth";
import {
  authenticate,
  issueTokensFor,
  toAuthUser,
} from "@server/features/auth/auth.service";
import { setAuthCookies } from "@server/platform/auth/cookies";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = handleRoute(async (req) => {
  const body = LoginRequest.parse(await req.json());
  const user = await authenticate(body.email, body.password);
  const { accessToken, refreshToken } = await issueTokensFor(user);
  await setAuthCookies(accessToken, refreshToken);
  const res: LoginResponse = { user: toAuthUser(user) };
  return ok(res);
});
