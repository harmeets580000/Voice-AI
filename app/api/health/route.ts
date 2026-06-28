import { handleRoute, ok } from "@server/platform/http/responses";
import type { HealthResponse } from "@contracts/health";

// Always run on the Node.js runtime (we use Node crypto/Prisma elsewhere).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handleRoute(async () => {
  const body: HealthResponse = {
    ok: true,
    service: "ai-receptionist-api",
    time: new Date().toISOString(),
  };
  return ok(body);
});
