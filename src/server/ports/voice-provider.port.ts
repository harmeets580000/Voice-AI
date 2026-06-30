/**
 * VoiceProvider PORT — the interface every voice vendor (Vapi now, Retell later) must
 * satisfy, expressed entirely in OUR domain terms. No vendor words appear in these
 * signatures. Feature/business code depends ONLY on this interface; concrete vendor
 * SDKs live in `src/server/adapters/voice/<vendor>/` behind it (doc 03 rule 7).
 */

import type {
  CallDirection,
  SyncStatus,
  ToolName,
  VoiceProviderName,
} from "@domain/enums";

/** Inputs needed to provision an organization's voice setup. */
export interface ProvisionOrgInput {
  organizationId: string;
  organizationName: string;
  /**
   * Our Assistant row id (multi-assistant). Baked into the assistant's call-ended
   * `server.url` as `assistant_id` so call webhooks are attributed to the right assistant.
   * Optional for back-compat with the single-assistant (org-level) provisioning path.
   */
  assistantId?: string;
  /** Public base URL the provider should call for tools + call-ended webhooks. */
  publicApiBaseUrl: string;
  assistant: {
    /** The assistant's display name in the provider (falls back to the org name). */
    name?: string;
    greeting?: string;
    prompt?: string;
    voice?: string;
    llmModel?: string;
  };
  /** Optional per-customer private key (already decrypted) to use instead of the platform key. */
  providerApiKey?: string;
  /** Reuse existing ids to make provisioning idempotent (resume rather than duplicate). */
  existing?: Partial<ProvisionResult>;
}

/** Neutral result of provisioning — provider ids in a vendor-agnostic shape. */
export interface ProvisionResult {
  assistantId: string;
  /** Optional — a number may not be provisioned (e.g. no area code configured to buy one). */
  phoneNumber?: string; // E.164
  phoneNumberId?: string;
  knowledgeBaseId?: string;
  toolIds: Array<{ name: ToolName; id: string }>;
  providerOrgId?: string;
  raw?: unknown; // last raw provider payload, for debugging/reconciliation
}

export interface UpdateAssistantInput {
  organizationId: string;
  assistantId: string;
  name?: string;
  greeting?: string;
  prompt?: string;
  voice?: string;
  llmModel?: string;
  /** Attach this exact set of provider tool ids to the assistant (when provided). */
  toolIds?: string[];
  /**
   * Our Assistant row id. When provided, the adapter refreshes the assistant's call-ended
   * `server` object (URL + current webhook secret) with this id baked in for per-assistant
   * attribution. Omitted by config-only updates so the server object isn't touched.
   */
  callEndedAssistantId?: string;
  providerApiKey?: string;
}

/** A single tool definition to create/update in the provider. */
export interface ToolDefinitionInput {
  organizationId: string;
  /** Function name the assistant calls (e.g. "check_availability" or a custom name). */
  name: string;
  description?: string;
  /** JSON-schema-ish parameter spec for the function (custom tools). */
  parameters?: unknown;
  /** Server URL the provider calls when the tool fires. */
  serverUrl: string;
  /** Static params merged into every call (carries our organization_id). */
  staticParams?: Record<string, unknown>;
  providerApiKey?: string;
}

export interface UploadKnowledgeFileInput {
  organizationId: string;
  knowledgeBaseId?: string;
  assistantId?: string;
  fileName: string;
  content: Buffer;
  mimeType: string;
  providerApiKey?: string;
}

export interface UploadKnowledgeFileResult {
  fileId: string;
  knowledgeBaseId?: string;
  sizeBytes: number;
  raw?: unknown;
}

/** A normalized inbound tool call, parsed from a vendor-specific webhook payload. */
export interface NormalizedToolCall {
  /** Server-trusted tenant id, read from the provider's static parameters. */
  organizationId: string;
  /**
   * The provider's assistant id from the call payload (e.g. Vapi `message.assistant.id`), used to
   * attribute the call to one of the org's assistants for per-assistant scoping. Optional.
   */
  providerAssistantId?: string;
  /** Echoed back verbatim in the response (Vapi `toolCallId`). */
  toolCallId: string;
  toolName: ToolName | string;
  args: Record<string, unknown>;
  raw?: unknown;
}

/** A normalized end-of-call record, parsed from a vendor-specific call-ended payload. */
export interface NormalizedCallRecord {
  organizationId: string;
  direction: CallDirection;
  providerCallId: string; // vapiCallId
  providerOrgId?: string;
  assistantId?: string;
  phoneNumberId?: string;
  phoneCallProvider?: string;
  phoneCallProviderId?: string;
  fromNumber?: string;
  toNumber?: string;
  endedReason?: string;
  cost?: number;
  costBreakdown?: unknown;
  recordingUrl?: string;
  summary?: string;
  startedAt?: Date;
  endedAt?: Date;
  durationSeconds?: number;
  messages: Array<{
    role: string;
    text: string;
    secondsFromStart?: number;
  }>;
  raw?: unknown;
}

/** Result of validating a candidate provider API key (the "Test key" button). */
export interface KeyValidationResult {
  valid: boolean;
  reason?: string;
}

/** A selectable voice or model option. */
export interface VoiceOptionDTO {
  id: string;
  label: string;
  provider?: string;
}

/** A lightweight assistant listing (for the active-assistant selector). */
export interface ProviderAssistantSummary {
  assistantId: string;
  name?: string;
}

/** Assistant config pulled back from the provider (neutral shape). */
export interface ProviderAssistantConfig {
  assistantId: string;
  name?: string;
  greeting?: string;
  prompt?: string;
  voice?: string;
  llmModel?: string;
  phoneNumberId?: string;
  knowledgeBaseId?: string;
  raw?: unknown;
}

/** A tool as it currently exists on the provider (for reflecting Vapi → portal). */
export interface ProviderToolSnapshot {
  id: string;
  name: string;
  description?: string;
  parameters?: unknown;
  serverUrl?: string;
}

/** A read-back snapshot of an org's data from the provider (for pull-sync). */
export interface ProviderSnapshot {
  assistant?: ProviderAssistantConfig;
  phoneNumber?: { id: string; number?: string };
  knowledgeBaseId?: string;
  providerOrgId?: string;
  /** The assistant's tools as they exist in the provider right now. */
  tools?: ProviderToolSnapshot[];
  calls: NormalizedCallRecord[];
}

/**
 * A raw inbound webhook as the route handler sees it. `query` carries the server-trusted
 * `organization_id` we baked into the tool/webhook URL at provisioning time (the AI never
 * sees it). The vendor-specific JSON lives in `body`.
 */
export interface RawWebhookRequest {
  body: unknown;
  headers?: Record<string, string>;
  query?: Record<string, string>;
}

export interface VoiceProvider {
  readonly name: VoiceProviderName;

  provisionOrg(input: ProvisionOrgInput): Promise<ProvisionResult>;
  updateAssistant(input: UpdateAssistantInput): Promise<{ raw?: unknown }>;
  deleteOrg(input: {
    organizationId: string;
    assistantId?: string;
    phoneNumberId?: string;
    knowledgeBaseId?: string;
    toolIds?: string[];
    providerApiKey?: string;
  }): Promise<void>;

  uploadKnowledgeFile(
    input: UploadKnowledgeFileInput,
  ): Promise<UploadKnowledgeFileResult>;
  deleteKnowledgeFile(input: {
    organizationId: string;
    fileId: string;
    knowledgeBaseId?: string;
    providerApiKey?: string;
  }): Promise<void>;

  /** Parse a raw inbound webhook into our neutral tool-call shape. */
  parseInboundToolCall(req: RawWebhookRequest): NormalizedToolCall;
  /** Format a tool result back into the vendor's exact expected response shape. */
  formatToolResponse(toolCallId: string, result: unknown): unknown;
  /** Parse a raw call-ended webhook into our neutral call record. */
  parseCallEnded(req: RawWebhookRequest): NormalizedCallRecord;

  /** Validate a candidate API key server-side (catches public-vs-private mistakes). */
  validateApiKey(apiKey: string): Promise<KeyValidationResult>;

  /** List the assistants in the account (for the active-assistant selector). */
  listAssistants(input: {
    providerApiKey?: string;
  }): Promise<ProviderAssistantSummary[]>;

  /** Available voices (live where possible, curated fallback). */
  listVoices(apiKey?: string): Promise<VoiceOptionDTO[]>;
  /** Available LLM models (curated; no universal list endpoint). */
  listModels(): Promise<VoiceOptionDTO[]>;

  /**
   * Read-back: pull the org's current data FROM the provider (assistant config, phone
   * number, KB, historical calls) so the portal can reflect Vapi. `allowAdopt` lets it
   * discover existing assistants/numbers when we have no stored id (per-customer key only).
   */
  pullOrgData(input: {
    organizationId: string;
    assistantId?: string;
    phoneNumberId?: string;
    providerApiKey?: string;
    allowAdopt?: boolean;
  }): Promise<ProviderSnapshot>;

  /**
   * Create/update the 3 receptionist tools in the provider (server URL with the org's
   * organization_id baked in) and return their ids. Used by the per-customer "Sync tools".
   */
  provisionTools(input: {
    organizationId: string;
    publicApiBaseUrl: string;
    providerApiKey?: string;
  }): Promise<Array<{ name: ToolName; id: string }>>;

  /** Create a single tool (built-in or custom) in the provider; returns its id. */
  createTool(input: ToolDefinitionInput): Promise<{ id: string; raw?: unknown }>;
  /** Update an existing provider tool by id. */
  updateTool(
    input: ToolDefinitionInput & { toolId: string },
  ): Promise<{ raw?: unknown }>;
  /** Delete a provider tool by id (e.g. when a customer disables/removes it). */
  deleteTool(input: { toolId: string; providerApiKey?: string }): Promise<void>;

  /**
   * Verify our stored provider ids still exist on the provider; returns a sync status
   * (`stale` if the provider 404s). Manual reconcile (full scheduled reconcile is Phase 6).
   */
  reconcile(input: {
    assistantId?: string;
    phoneNumberId?: string;
    providerApiKey?: string;
  }): Promise<{ status: SyncStatus; raw?: unknown }>;

  // FORWARD-COMPAT (do NOT implement in Phase 1 — inbound only):
  //   startOutboundCall(input): Promise<NormalizedCallRecord>;
  // Outbound is a future METHOD on this same port, not a new abstraction. The neutral
  // NormalizedCallRecord already covers both directions via `direction`.
}
