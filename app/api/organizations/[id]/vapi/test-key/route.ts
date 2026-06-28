import { handleRoute, ok } from "@server/platform/http/responses";
import { TestKeyRequest, type TestKeyResponse } from "@contracts/vapi";
import { requireRole } from "@server/platform/auth/context";
import { Role } from "@domain/enums";
import { testVapiKey } from "@server/features/organizations/organizations.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Validate a candidate Vapi private key server-side before saving. Super-admin only. */
export const POST = handleRoute(async (req) => {
  await requireRole([Role.SUPER_ADMIN]);
  const body = TestKeyRequest.parse(await req.json());
  const result = await testVapiKey(body.apiKey);
  const res: TestKeyResponse = result;
  return ok(res);
});
