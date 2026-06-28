/**
 * Composition root for PORTS -> ADAPTERS. This is the ONE place that decides which
 * concrete vendor implements each port. Swapping Vapi for Retell later = add an adapter
 * and change the binding here; no feature code changes (doc 03 architecture principle 3).
 */

import { env } from "@server/config/env";
import type { VoiceProvider } from "@server/ports/voice-provider.port";
import { VapiVoiceProvider } from "@server/adapters/voice/vapi/vapi.provider";
import { FakeVoiceProvider } from "@server/adapters/voice/fake/fake.provider";

let voiceProvider: VoiceProvider | null = null;

/** Returns the active VoiceProvider, selected by env.VOICE_PROVIDER. */
export function getVoiceProvider(): VoiceProvider {
  if (voiceProvider) return voiceProvider;
  switch (env.VOICE_PROVIDER) {
    case "fake":
      voiceProvider = new FakeVoiceProvider();
      break;
    case "vapi":
    default:
      voiceProvider = new VapiVoiceProvider();
      break;
  }
  return voiceProvider;
}

/** Test/seed hook to inject a specific provider (e.g. a configured FakeVoiceProvider). */
export function setVoiceProvider(provider: VoiceProvider): void {
  voiceProvider = provider;
}
