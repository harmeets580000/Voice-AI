/**
 * Outbound from-number source (Product 2 §E) — the org's phone numbers pulled live from the voice
 * provider (Vapi) THROUGH THE PORT, for the Outbound Agent's from-number picker. SDK stays isolated:
 * this calls `getVoiceProvider()`, never the Vapi SDK. The org's own key is used when present
 * (per-customer), else the platform key (see resolveProviderKey).
 */

import { resolveProviderKey } from "@server/features/organizations/organizations.service";
import { getVoiceProvider } from "@server/config/providers";

export async function listOrgVapiNumbers(orgId: string) {
  const providerApiKey = await resolveProviderKey(orgId);
  return getVoiceProvider().listPhoneNumbers({ providerApiKey });
}
