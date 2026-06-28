/**
 * Fake VoiceProvider — an in-memory implementation of the VoiceProvider port.
 * Used for local dev without a Vapi account and (re-exported in `test/`) for the test
 * suite, so NO test ever calls real Vapi (doc 04 standing expectation).
 *
 * It returns deterministic, valid-shaped data and records calls for assertions.
 */

import { ToolName, VoiceProviderName, SyncStatus } from "@domain/enums";
import { CURATED_VOICES, CURATED_MODELS } from "@server/adapters/voice/voiceOptions";
import type {
  KeyValidationResult,
  NormalizedCallRecord,
  NormalizedToolCall,
  ProvisionOrgInput,
  ProvisionResult,
  ToolDefinitionInput,
  UpdateAssistantInput,
  UploadKnowledgeFileInput,
  UploadKnowledgeFileResult,
  VoiceProvider,
} from "@server/ports/voice-provider.port";

let counter = 0;
const id = (prefix: string) => `${prefix}_fake_${++counter}`;

function hashOrg(orgId: string): number {
  let h = 0;
  for (const c of orgId) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}
/**
 * Deterministic, unique E.164. Keyed by org (and our assistant id when multi-assistant) so
 * different orgs/assistants never collide on the @unique provider phone number.
 */
function fakePhone(orgId: string, assistantId?: string): string {
  const seed = hashOrg(assistantId ? `${orgId}:${assistantId}` : orgId);
  return "+1555" + String((seed % 9_000_000) + 1_000_000);
}
/** Deterministic assistant id so different orgs/assistants never share ids (their calls
 *  derive from it, and vapiCallId is globally @unique). */
function fakeAssistantId(orgId: string, assistantId?: string): string {
  const seed = hashOrg(assistantId ? `${orgId}:${assistantId}` : orgId);
  return `asst_fake_${seed.toString(36)}`;
}

export interface FakeProviderOptions {
  /** Force provisionOrg to fail at a given step (for failure-path tests). */
  failOnProvision?: boolean;
  /** Keys this fake considers valid (anything starting with these prefixes is "private"). */
  validKeyPrefixes?: string[];
  /** Ids that should report as missing (404 -> stale) during reconcile. */
  missingIds?: string[];
}

export class FakeVoiceProvider implements VoiceProvider {
  readonly name = VoiceProviderName.VAPI; // pretends to be the active provider
  readonly calls: { method: string; input: unknown }[] = [];

  constructor(private readonly opts: FakeProviderOptions = {}) {}

  private record(method: string, input: unknown) {
    this.calls.push({ method, input });
  }

  async provisionOrg(input: ProvisionOrgInput): Promise<ProvisionResult> {
    this.record("provisionOrg", input);
    if (this.opts.failOnProvision) {
      throw new Error("fake: provisioning failed");
    }
    return {
      assistantId:
        input.existing?.assistantId ??
        fakeAssistantId(input.organizationId, input.assistantId),
      phoneNumber:
        input.existing?.phoneNumber ??
        fakePhone(input.organizationId, input.assistantId),
      phoneNumberId: input.existing?.phoneNumberId ?? id("pn"),
      knowledgeBaseId: input.existing?.knowledgeBaseId ?? id("kb"),
      toolIds: [
        { name: ToolName.CHECK_AVAILABILITY, id: id("tool") },
        { name: ToolName.BOOK_APPOINTMENT, id: id("tool") },
        { name: ToolName.LOOKUP_CUSTOMER, id: id("tool") },
      ],
      providerOrgId: input.existing?.providerOrgId ?? id("org"),
      raw: { fake: true },
    };
  }

  async updateAssistant(input: UpdateAssistantInput) {
    this.record("updateAssistant", input);
    return { raw: { fake: true } };
  }

  async deleteOrg(input: unknown) {
    this.record("deleteOrg", input);
  }

  async uploadKnowledgeFile(
    input: UploadKnowledgeFileInput,
  ): Promise<UploadKnowledgeFileResult> {
    this.record("uploadKnowledgeFile", { ...input, content: "<buffer>" });
    return {
      fileId: id("file"),
      knowledgeBaseId: input.knowledgeBaseId ?? id("kb"),
      sizeBytes: input.content.byteLength,
      raw: { fake: true },
    };
  }

  async deleteKnowledgeFile(input: unknown) {
    this.record("deleteKnowledgeFile", input);
  }

  parseInboundToolCall(req: { body: unknown }): NormalizedToolCall {
    // The fake accepts an already-neutral body for direct testing.
    const b = (req.body ?? {}) as Partial<NormalizedToolCall>;
    return {
      organizationId: String(b.organizationId ?? ""),
      toolCallId: String(b.toolCallId ?? id("call")),
      toolName: (b.toolName as ToolName) ?? ToolName.CHECK_AVAILABILITY,
      args: (b.args as Record<string, unknown>) ?? {},
      raw: req.body,
    };
  }

  formatToolResponse(toolCallId: string, result: unknown) {
    // Mirror the real Vapi mapper: result is a string in the response.
    return {
      results: [
        {
          toolCallId,
          result: typeof result === "string" ? result : JSON.stringify(result),
        },
      ],
    };
  }

  parseCallEnded(req: { body: unknown }): NormalizedCallRecord {
    const b = (req.body ?? {}) as Partial<NormalizedCallRecord>;
    return {
      organizationId: String(b.organizationId ?? ""),
      direction: b.direction ?? "inbound",
      providerCallId: String(b.providerCallId ?? id("call")),
      messages: b.messages ?? [],
      raw: req.body,
      ...b,
    } as NormalizedCallRecord;
  }

  async listAssistants(input: { providerApiKey?: string }) {
    this.record("listAssistants", input);
    return [
      { assistantId: "asst_fake_1", name: "Receptionist A" },
      { assistantId: "asst_fake_2", name: "Receptionist B" },
    ];
  }

  async listVoices() {
    return CURATED_VOICES;
  }
  async listModels() {
    return CURATED_MODELS;
  }

  async provisionTools(input: {
    organizationId: string;
    publicApiBaseUrl: string;
    providerApiKey?: string;
  }) {
    this.record("provisionTools", input);
    return [
      { name: ToolName.CHECK_AVAILABILITY, id: `tool_${input.organizationId}_check` },
      { name: ToolName.BOOK_APPOINTMENT, id: `tool_${input.organizationId}_book` },
      { name: ToolName.LOOKUP_CUSTOMER, id: `tool_${input.organizationId}_lookup` },
    ];
  }

  async createTool(input: ToolDefinitionInput): Promise<{ id: string; raw?: unknown }> {
    this.record("createTool", input);
    return { id: id("tool"), raw: { fake: true } };
  }

  async updateTool(
    input: ToolDefinitionInput & { toolId: string },
  ): Promise<{ raw?: unknown }> {
    this.record("updateTool", input);
    return { raw: { fake: true } };
  }

  async deleteTool(input: { toolId: string; providerApiKey?: string }) {
    this.record("deleteTool", input);
  }

  async pullOrgData(input: {
    organizationId: string;
    assistantId?: string;
    phoneNumberId?: string;
    providerApiKey?: string;
    allowAdopt?: boolean;
  }) {
    this.record("pullOrgData", input);
    const assistantId = input.assistantId ?? fakeAssistantId(input.organizationId);
    return {
      assistant: {
        assistantId,
        name: "Synced Assistant",
        greeting: "Hello from Vapi",
        prompt: "You are a helpful receptionist.",
        voice: "Elliot",
        llmModel: "gpt-4o",
        knowledgeBaseId: id("kb"),
        raw: { fake: true },
      },
      phoneNumber: {
        id: input.phoneNumberId ?? id("pn"),
        number: fakePhone(input.organizationId),
      },
      knowledgeBaseId: id("kb"),
      providerOrgId: id("org"),
      tools: [
        {
          id: `tool_${input.organizationId}_check`,
          name: ToolName.CHECK_AVAILABILITY,
          description: "Check open slots",
        },
        {
          id: `tool_${input.organizationId}_book`,
          name: ToolName.BOOK_APPOINTMENT,
          description: "Book an appointment",
        },
      ],
      calls: [
        {
          organizationId: input.organizationId,
          direction: "inbound" as const,
          providerCallId: `${assistantId}-call-1`,
          endedReason: "customer-ended-call",
          summary: "Imported call 1",
          messages: [{ role: "assistant", text: "Hi" }],
        },
        {
          organizationId: input.organizationId,
          direction: "inbound" as const,
          providerCallId: `${assistantId}-call-2`,
          endedReason: "customer-ended-call",
          summary: "Imported call 2",
          messages: [{ role: "user", text: "Bye" }],
        },
      ],
    };
  }

  async validateApiKey(apiKey: string): Promise<KeyValidationResult> {
    const prefixes = this.opts.validKeyPrefixes ?? ["sk_", "priv_"];
    const valid = prefixes.some((p) => apiKey.startsWith(p));
    return valid
      ? { valid: true }
      : { valid: false, reason: "Not a valid private key" };
  }

  async reconcile(input: {
    assistantId?: string;
    phoneNumberId?: string;
  }): Promise<{ status: SyncStatus; raw?: unknown }> {
    this.record("reconcile", input);
    const missing = this.opts.missingIds ?? [];
    const stale =
      (input.assistantId && missing.includes(input.assistantId)) ||
      (input.phoneNumberId && missing.includes(input.phoneNumberId));
    return { status: stale ? SyncStatus.STALE : SyncStatus.SYNCED };
  }
}
