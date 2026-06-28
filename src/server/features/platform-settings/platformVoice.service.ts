/**
 * Platform-wide voice defaults (super-admin). New orgs inherit these unless a per-customer
 * value overrides them. The platform Vapi key is stored encrypted; only last-4 is exposed.
 */

import { prisma } from "@server/platform/db/client";
import { env } from "@server/config/env";
import { encryptSecret, last4 } from "@server/platform/crypto/secretBox";
import type {
  PlatformVoiceSettings,
  UpdatePlatformVoiceRequest,
} from "@contracts/vapi";

const ID = "platform";

async function ensureRow() {
  return prisma.platformVoiceConfig.upsert({
    where: { id: ID },
    update: {},
    create: { id: ID },
  });
}

export async function getPlatformVoice(): Promise<PlatformVoiceSettings> {
  const row = await ensureRow();
  // A platform key may live in env (not the DB) — reflect either source.
  const hasPlatformKey = !!row.vapiPrivateKeyEnc || !!env.VAPI_API_KEY;
  return {
    defaultVoice: row.defaultVoice,
    defaultLlmModel: row.defaultLlmModel,
    defaultGreeting: row.defaultGreeting,
    defaultPrompt: row.defaultPrompt,
    publicApiBaseUrl: row.publicApiBaseUrl ?? env.PUBLIC_API_BASE_URL,
    hasPlatformKey,
    keyLast4: row.vapiKeyLast4 ?? (env.VAPI_API_KEY ? last4(env.VAPI_API_KEY) : null),
  };
}

export async function updatePlatformVoice(
  input: UpdatePlatformVoiceRequest,
): Promise<PlatformVoiceSettings> {
  await ensureRow();
  const data: Record<string, unknown> = {};
  if (input.defaultVoice !== undefined) data.defaultVoice = input.defaultVoice;
  if (input.defaultLlmModel !== undefined)
    data.defaultLlmModel = input.defaultLlmModel;
  if (input.defaultGreeting !== undefined)
    data.defaultGreeting = input.defaultGreeting;
  if (input.defaultPrompt !== undefined)
    data.defaultPrompt = input.defaultPrompt;
  if (input.publicApiBaseUrl !== undefined)
    data.publicApiBaseUrl = input.publicApiBaseUrl;
  if (input.privateKey !== undefined) {
    if (input.privateKey === "") {
      data.vapiPrivateKeyEnc = null;
      data.vapiKeyLast4 = null;
    } else {
      data.vapiPrivateKeyEnc = encryptSecret(input.privateKey);
      data.vapiKeyLast4 = last4(input.privateKey);
    }
  }
  await prisma.platformVoiceConfig.update({ where: { id: ID }, data });
  return getPlatformVoice();
}
