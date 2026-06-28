/**
 * Thin wrapper around the official Vapi Server SDK. The ONLY module (besides the provider)
 * that imports the SDK. Server-side only — the key never reaches the browser.
 *
 * Per-customer keys override the platform key when provided (already decrypted by the
 * caller). The SDK does automatic retries (408/429/5xx) with backoff.
 */

import { VapiClient } from "@vapi-ai/server-sdk";
import { env } from "@server/config/env";

let platformClient: VapiClient | null = null;

export function getVapiClient(apiKey?: string): VapiClient {
  if (apiKey) {
    // Per-customer key → a dedicated client (not cached).
    return new VapiClient({ token: apiKey, baseUrl: env.VAPI_BASE_URL });
  }
  if (!platformClient) {
    if (!env.VAPI_API_KEY) {
      throw new Error(
        "No Vapi API key available — set this organization's Vapi private key on its Vapi settings page and Save.",
      );
    }
    platformClient = new VapiClient({
      token: env.VAPI_API_KEY,
      baseUrl: env.VAPI_BASE_URL,
    });
  }
  return platformClient;
}

export { VapiError } from "@vapi-ai/server-sdk";
