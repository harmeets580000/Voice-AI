/**
 * Composition root for PORTS -> ADAPTERS. This is the ONE place that decides which
 * concrete vendor implements each port. Swapping Vapi for Retell later = add an adapter
 * and change the binding here; no feature code changes (doc 03 architecture principle 3).
 */

import { env } from "@server/config/env";
import type { VoiceProvider } from "@server/ports/voice-provider.port";
import { VapiVoiceProvider } from "@server/adapters/voice/vapi/vapi.provider";
import { FakeVoiceProvider } from "@server/adapters/voice/fake/fake.provider";
import type { SimulatorLlm } from "@server/ports/simulator-llm.port";
import { AnthropicSimulatorLlm } from "@server/adapters/llm/anthropic/anthropic.simulator";
import type { EmailProvider } from "@server/ports/email.port";
import { SendGridEmailProvider } from "@server/adapters/email/sendgrid/sendgrid.email";
import { FakeEmailProvider } from "@server/adapters/email/fake/fake.email";

let voiceProvider: VoiceProvider | null = null;
let simulatorLlm: SimulatorLlm | null = null;
let emailProvider: EmailProvider | null = null;

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

/** The active SimulatorLlm (Anthropic by default; the fake is injected in tests). */
export function getSimulatorLlm(): SimulatorLlm {
  if (!simulatorLlm) simulatorLlm = new AnthropicSimulatorLlm();
  return simulatorLlm;
}

/** Test/dev hook to inject a specific simulator LLM (e.g. a scripted FakeSimulatorLlm). */
export function setSimulatorLlm(llm: SimulatorLlm): void {
  simulatorLlm = llm;
}

/** The active EmailProvider — SendGrid when SENDGRID_API_KEY is set, else the fake/log adapter. */
export function getEmailProvider(): EmailProvider {
  if (!emailProvider) {
    emailProvider = env.SENDGRID_API_KEY
      ? new SendGridEmailProvider()
      : new FakeEmailProvider();
  }
  return emailProvider;
}

/** Test/dev hook to inject a specific email provider (e.g. a FakeEmailProvider for assertions). */
export function setEmailProvider(provider: EmailProvider): void {
  emailProvider = provider;
}
