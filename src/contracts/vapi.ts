import { z } from "zod";

/**
 * Vapi settings contract. CRITICAL: no response shape here ever includes the plaintext
 * private key — only `keyLast4` + `hasCustomKey` are exposed (tests I-SEC-05, I-AUTH-13).
 */

export const SyncStatusEnum = z.enum(["pending", "synced", "failed", "stale"]);

export const ToolKindEnum = z.enum(["builtin", "custom"]);

export const VapiToolDTO = z.object({
  id: z.string(),
  name: z.string(),
  kind: ToolKindEnum,
  enabled: z.boolean(),
  description: z.string().nullable(),
  parameters: z.unknown().nullable(),
  vapiToolId: z.string().nullable(),
  serverUrl: z.string().nullable(),
  organizationId: z.string(),
  syncStatus: SyncStatusEnum,
  syncError: z.string().nullable(),
});
export type VapiToolDTO = z.infer<typeof VapiToolDTO>;

/** A tool function name: lowercase letters, numbers, underscores (Vapi-compatible). */
const toolName = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-zA-Z0-9_]+$/, "letters, numbers, and underscores only");

export const CreateToolRequest = z.object({
  name: toolName,
  description: z.string().max(2000).optional(),
  /** JSON-schema-ish parameter spec for the function. */
  parameters: z.unknown().optional(),
  serverUrl: z.string().url(),
  enabled: z.boolean().optional(),
});
export type CreateToolRequest = z.infer<typeof CreateToolRequest>;

export const UpdateToolRequest = z.object({
  description: z.string().max(2000).optional(),
  parameters: z.unknown().optional(),
  serverUrl: z.string().url().optional(),
  enabled: z.boolean().optional(),
});
export type UpdateToolRequest = z.infer<typeof UpdateToolRequest>;

export const ToolsResponse = z.object({ tools: z.array(VapiToolDTO) });
export type ToolsResponse = z.infer<typeof ToolsResponse>;

/** Read view of a customer's Vapi connection + status (super-admin only). Per-assistant config
 * (greeting/prompt/voice/llmModel) lives on the Assistants page, not here. */
export const VapiSettings = z.object({
  // Read-only mirrored identifiers + status (sourced from the org's default assistant).
  vapiAssistantId: z.string().nullable(),
  vapiPhoneNumberId: z.string().nullable(),
  vapiPhoneNumber: z.string().nullable(),
  vapiKnowledgeBaseId: z.string().nullable(),
  vapiOrgId: z.string().nullable(),
  syncStatus: SyncStatusEnum,
  lastSyncedAt: z.string().nullable(),
  syncError: z.string().nullable(),

  // Per-customer key: only the last-4 and a boolean ever leave the server.
  hasCustomKey: z.boolean(),
  keyLast4: z.string().nullable(),
  // Browser-safe Vapi PUBLIC key (used by the web-call simulator). Not a secret.
  vapiPublicKey: z.string().nullable(),

  // Read-only webhook URLs this customer is wired to.
  toolsWebhookUrl: z.string(),
  callEndedWebhookUrl: z.string(),

  // The 3 receptionist tools mirrored from Vapi.
  tools: z.array(VapiToolDTO),
});
export type VapiSettings = z.infer<typeof VapiSettings>;

export const VapiSettingsResponse = z.object({ settings: VapiSettings });
export type VapiSettingsResponse = z.infer<typeof VapiSettingsResponse>;

export const UpdateVapiSettingsRequest = z.object({
  /** Write-only. If provided, stored encrypted; never echoed back. Empty string clears it. */
  privateKey: z.string().optional(),
  /** Browser-safe Vapi PUBLIC key (not a secret) for the web-call simulator. */
  vapiPublicKey: z.string().optional(),
});
export type UpdateVapiSettingsRequest = z.infer<
  typeof UpdateVapiSettingsRequest
>;

export const TestKeyRequest = z.object({ apiKey: z.string().min(1) });
export type TestKeyRequest = z.infer<typeof TestKeyRequest>;

export const TestKeyResponse = z.object({
  valid: z.boolean(),
  reason: z.string().optional(),
});
export type TestKeyResponse = z.infer<typeof TestKeyResponse>;

export const ProvisionResponse = z.object({
  syncStatus: SyncStatusEnum,
  syncError: z.string().nullable(),
});
export type ProvisionResponse = z.infer<typeof ProvisionResponse>;

export const SyncResponse = z.object({
  syncStatus: SyncStatusEnum,
  importedCalls: z.number(),
  syncError: z.string().nullable(),
});
export type SyncResponse = z.infer<typeof SyncResponse>;

export const ToolsSyncResponse = z.object({
  tools: z.array(VapiToolDTO),
  syncError: z.string().nullable(),
});
export type ToolsSyncResponse = z.infer<typeof ToolsSyncResponse>;

/** Platform-wide voice defaults (super-admin). Key never returned in plaintext. */
export const PlatformVoiceSettings = z.object({
  defaultVoice: z.string().nullable(),
  defaultLlmModel: z.string().nullable(),
  defaultGreeting: z.string().nullable(),
  defaultPrompt: z.string().nullable(),
  publicApiBaseUrl: z.string().nullable(),
  hasPlatformKey: z.boolean(),
  keyLast4: z.string().nullable(),
});
export type PlatformVoiceSettings = z.infer<typeof PlatformVoiceSettings>;

export const PlatformVoiceResponse = z.object({
  settings: PlatformVoiceSettings,
});
export type PlatformVoiceResponse = z.infer<typeof PlatformVoiceResponse>;

export const VoiceOption = z.object({
  id: z.string(),
  label: z.string(),
  provider: z.string().optional(),
});
export type VoiceOption = z.infer<typeof VoiceOption>;

export const VoiceOptionsResponse = z.object({
  voices: z.array(VoiceOption),
  models: z.array(VoiceOption),
});
export type VoiceOptionsResponse = z.infer<typeof VoiceOptionsResponse>;

export const UpdatePlatformVoiceRequest = z.object({
  defaultVoice: z.string().optional(),
  defaultLlmModel: z.string().optional(),
  defaultGreeting: z.string().optional(),
  defaultPrompt: z.string().optional(),
  publicApiBaseUrl: z.string().optional(),
  privateKey: z.string().optional(),
});
export type UpdatePlatformVoiceRequest = z.infer<
  typeof UpdatePlatformVoiceRequest
>;
