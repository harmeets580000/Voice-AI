/**
 * Curated fallback lists for voice + LLM model dropdowns. The Vapi adapter tries a live
 * `voice-library` fetch first and falls back to these; LLM models have no list endpoint so
 * the curated set is authoritative.
 */

export interface VoiceOption {
  id: string;
  label: string;
  provider?: string;
}
export interface ModelOption {
  id: string;
  label: string;
  provider?: string;
}

export const CURATED_VOICES: VoiceOption[] = [
  { id: "Elliot", label: "Elliot (Vapi)", provider: "vapi" },
  { id: "Kylie", label: "Kylie (Vapi)", provider: "vapi" },
  { id: "Rohan", label: "Rohan (Vapi)", provider: "vapi" },
  { id: "Hana", label: "Hana (Vapi)", provider: "vapi" },
  { id: "Neha", label: "Neha (Vapi)", provider: "vapi" },
  { id: "burt", label: "Burt (PlayHT)", provider: "playht" },
  { id: "rachel", label: "Rachel (11Labs)", provider: "11labs" },
  { id: "adam", label: "Adam (11Labs)", provider: "11labs" },
];

export const CURATED_MODELS: ModelOption[] = [
  { id: "gpt-4o", label: "GPT-4o (OpenAI)", provider: "openai" },
  { id: "gpt-4o-mini", label: "GPT-4o mini (OpenAI)", provider: "openai" },
  { id: "gpt-4.1", label: "GPT-4.1 (OpenAI)", provider: "openai" },
  { id: "gpt-4.1-mini", label: "GPT-4.1 mini (OpenAI)", provider: "openai" },
  {
    id: "claude-3-5-sonnet-20241022",
    label: "Claude 3.5 Sonnet (Anthropic)",
    provider: "anthropic",
  },
  {
    id: "claude-3-5-haiku-20241022",
    label: "Claude 3.5 Haiku (Anthropic)",
    provider: "anthropic",
  },
  { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash (Google)", provider: "google" },
];

/**
 * The LLM provider Vapi should use for a given model id (e.g. "openai" | "anthropic" | "google").
 * Looked up from CURATED_MODELS; defaults to "openai" for unknown ids so the assistant still works.
 * Used by the Vapi adapter so an Anthropic/Google assistant isn't silently rewritten to OpenAI.
 */
export function providerForModel(modelId?: string | null): string {
  if (!modelId) return "openai";
  return CURATED_MODELS.find((m) => m.id === modelId)?.provider ?? "openai";
}
