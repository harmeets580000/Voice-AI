import { handleRoute, ok } from "@server/platform/http/responses";
import { VapiTestRequest, type VapiTestResponse } from "@contracts/vapi-tester";
import { requireRole } from "@server/platform/auth/context";
import { Role } from "@domain/enums";
import { runVapiTest } from "@server/features/vapi-tester/vapi-tester.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Super-admin debug tool: run a single READ-ONLY Vapi API call with a chosen key source
 * (pasted / platform / org) and return the raw result. Never exposes a stored key in plaintext.
 */
export const POST = handleRoute(async (req) => {
  await requireRole([Role.SUPER_ADMIN]);
  const body = VapiTestRequest.parse(await req.json());
  const res: VapiTestResponse = await runVapiTest(body);
  return ok(res);
});
