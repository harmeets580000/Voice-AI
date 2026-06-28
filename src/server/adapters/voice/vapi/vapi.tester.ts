/**
 * Vapi READ-ONLY API tester — a super-admin debug helper. Like vapi.provider/vapi.client this lives
 * in the adapter folder, so it may use the Vapi SDK (CLAUDE.md rule 5). It imports `getVapiClient`
 * from ./vapi.client rather than the SDK directly, so the SDK stays isolated to vapi.client.ts.
 *
 * It intentionally does NOT go through the VoiceProvider port: the port bundles multi-call
 * provisioning workflows, whereas the tester needs raw 1:1 access to individual read-only endpoints.
 * Only read operations are exposed — nothing is created, updated, or deleted. The api key is never
 * logged.
 */

import { env } from "@server/config/env";
import type { VapiTesterOp } from "@contracts/vapi-tester";
import { getVapiClient, VapiError } from "./vapi.client";

// The SDK request/response types are version-specific; we call through a loose view (same approach
// as vapi.provider.ts). The SDK is still imported only inside this adapter folder.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = Record<string, any>;

export interface VapiTestParams {
  id?: string;
  assistantId?: string;
  limit?: number;
}

export interface VapiTestRawResult {
  ok: boolean;
  statusCode: number | null;
  durationMs: number;
  data: unknown;
  error: string | null;
}

/** A non-2xx response from the direct voice-library fetch, carrying its status code. */
class HttpStatusError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "HttpStatusError";
  }
}

function clampLimit(limit: number | undefined, fallback: number): number {
  const n = typeof limit === "number" ? limit : Number(limit);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(Math.trunc(n), 1), 1000);
}

function requireId(id: string | undefined, label: string): string {
  if (!id || !id.trim()) throw new Error(`Missing required ${label}`);
  return id.trim();
}

function statusOf(e: unknown): number | null {
  if (e instanceof VapiError) return e.statusCode ?? null;
  if (e instanceof HttpStatusError) return e.statusCode;
  if (e && typeof e === "object" && "statusCode" in e) {
    const s = (e as { statusCode?: unknown }).statusCode;
    if (typeof s === "number") return s;
  }
  return null;
}

/** Direct fetch of Vapi's voice-library (same endpoint the provider uses for listVoices). */
async function fetchVoiceLibrary(apiKey: string): Promise<unknown> {
  const res = await fetch(`${env.VAPI_BASE_URL}/voice-library`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  const body = (await res.json().catch(() => null)) as unknown;
  if (!res.ok) {
    throw new HttpStatusError(res.status, `Vapi voice-library returned ${res.status}`);
  }
  return body;
}

async function dispatch(
  client: AnyClient,
  op: VapiTesterOp,
  params: VapiTestParams,
  apiKey: string,
): Promise<unknown> {
  switch (op) {
    case "validateKey":
      return client.assistants.list({ limit: 1 });
    case "listAssistants":
      return client.assistants.list({ limit: clampLimit(params.limit, 100) });
    case "getAssistant":
      return client.assistants.get(requireId(params.id, "assistant id"));
    case "listPhoneNumbers":
      return client.phoneNumbers.list({ limit: clampLimit(params.limit, 100) });
    case "getPhoneNumber":
      return client.phoneNumbers.get(requireId(params.id, "phone number id"));
    case "listCalls":
      return client.calls.list(
        params.assistantId
          ? { assistantId: params.assistantId, limit: clampLimit(params.limit, 100) }
          : { limit: clampLimit(params.limit, 100) },
      );
    case "getCall":
      return client.calls.get(requireId(params.id, "call id"));
    case "listVoices":
      return fetchVoiceLibrary(apiKey);
    default: {
      const _never: never = op;
      throw new Error(`Unsupported operation: ${String(_never)}`);
    }
  }
}

/**
 * Run a single read-only Vapi operation with the given (already-resolved, plaintext) key and return
 * a structured result. Never throws — Vapi/SDK errors are captured into `{ ok:false, statusCode }`.
 */
export async function runVapiTest(
  apiKey: string,
  op: VapiTesterOp,
  params: VapiTestParams,
): Promise<VapiTestRawResult> {
  const start = Date.now();
  try {
    const client = getVapiClient(apiKey) as unknown as AnyClient;
    const data = await dispatch(client, op, params, apiKey);
    return {
      ok: true,
      statusCode: 200,
      durationMs: Date.now() - start,
      data,
      error: null,
    };
  } catch (e) {
    return {
      ok: false,
      statusCode: statusOf(e),
      durationMs: Date.now() - start,
      data: null,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
