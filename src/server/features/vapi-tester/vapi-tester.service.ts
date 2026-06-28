/**
 * Vapi API Tester service (super-admin debug tool). Resolves WHICH Vapi key to use for a request,
 * then runs a read-only operation through the Vapi adapter's tester module. The resolved key never
 * leaves the server and is never logged.
 *
 * Key resolution mirrors organizations.service.ts `resolveProviderKey`: a per-org encrypted key
 * overrides the platform env key.
 */

import { prisma } from "@server/platform/db/client";
import { env } from "@server/config/env";
import { AppError } from "@server/platform/http/errors";
import { decryptSecret } from "@server/platform/crypto/secretBox";
import { runVapiTest as runVapiTestAdapter } from "@server/adapters/voice/vapi/vapi.tester";
import type { VapiTestRequest, VapiTestResponse } from "@contracts/vapi-tester";

async function resolveKey(req: VapiTestRequest): Promise<string> {
  switch (req.keySource) {
    case "pasted": {
      const key = req.apiKey?.trim();
      if (!key) throw AppError.badRequest("A Vapi API key is required");
      return key;
    }
    case "platform": {
      if (!env.VAPI_API_KEY) {
        throw AppError.badRequest(
          "No platform Vapi key is configured (VAPI_API_KEY)",
        );
      }
      return env.VAPI_API_KEY;
    }
    case "org": {
      const orgId = req.organizationId;
      if (!orgId) throw AppError.badRequest("organizationId is required");
      const cfg = await prisma.orgVapiConfig.findUnique({
        where: { organizationId: orgId },
        select: { vapiPrivateKeyEnc: true },
      });
      if (cfg?.vapiPrivateKeyEnc) return decryptSecret(cfg.vapiPrivateKeyEnc);
      // Fall back to the platform key when the org has no custom key (mirrors resolveProviderKey).
      if (env.VAPI_API_KEY) return env.VAPI_API_KEY;
      throw AppError.badRequest(
        "This organization has no stored Vapi key and no platform key is configured",
      );
    }
    default: {
      const _never: never = req.keySource;
      throw AppError.badRequest(`Unknown key source: ${String(_never)}`);
    }
  }
}

export async function runVapiTest(
  req: VapiTestRequest,
): Promise<VapiTestResponse> {
  const apiKey = await resolveKey(req);
  const params = (req.params ?? {}) as {
    id?: string;
    assistantId?: string;
    limit?: number;
  };
  const result = await runVapiTestAdapter(apiKey, req.operation, params);
  return {
    ok: result.ok,
    statusCode: result.statusCode,
    durationMs: result.durationMs,
    data: result.data ?? null,
    error: result.error,
  };
}
