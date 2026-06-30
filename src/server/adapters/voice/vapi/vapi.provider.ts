/**
 * Vapi adapter — implements the VoiceProvider port using @vapi-ai/server-sdk.
 *
 * This is the ONLY place (with vapi.client/mapper) allowed to import the Vapi SDK
 * (doc 03 rule 7 / acceptance grep check). The provisioning request SHAPES below follow
 * Vapi's current REST API; per the plan's build note (Research §3.6) they must be verified
 * field-for-field against live Vapi docs before going to production. Webhook parsing is in
 * vapi.mapper.ts (unit-tested). The fake provider is used everywhere in tests.
 */

import { VoiceProviderName, ToolName, SyncStatus } from "@domain/enums";
import { env } from "@server/config/env";
import { logger } from "@server/platform/logging/logger";
import type {
  KeyValidationResult,
  NormalizedCallRecord,
  NormalizedToolCall,
  ProvisionOrgInput,
  ProvisionResult,
  RawWebhookRequest,
  ToolDefinitionInput,
  UpdateAssistantInput,
  UploadKnowledgeFileInput,
  UploadKnowledgeFileResult,
  VoiceProvider,
} from "@server/ports/voice-provider.port";
import { getVapiClient, VapiError } from "./vapi.client";
import {
  CURATED_VOICES,
  CURATED_MODELS,
  providerForModel,
} from "@server/adapters/voice/voiceOptions";
import {
  parseCallEnded,
  parseInboundToolCall,
  formatToolResponse,
  mapAssistant,
  mapCallObject,
} from "./vapi.mapper";
import type { ProviderSnapshot } from "@server/ports/voice-provider.port";

const TOOL_NAMES: ToolName[] = [
  ToolName.CHECK_AVAILABILITY,
  ToolName.BOOK_APPOINTMENT,
  ToolName.LOOKUP_CUSTOMER,
];

function toolsUrl(baseUrl: string, orgId: string): string {
  return `${baseUrl}/api/webhook/voice/tools?organization_id=${encodeURIComponent(orgId)}`;
}
function callEndedUrl(baseUrl: string, orgId: string, assistantId?: string): string {
  const url = `${baseUrl}/api/webhook/voice/call-ended?organization_id=${encodeURIComponent(orgId)}`;
  // Each assistant has its own server.url, so we can bake our Assistant id in for
  // per-assistant call attribution (the tools URL stays org-only — tool objects are shared).
  return assistantId
    ? `${url}&assistant_id=${encodeURIComponent(assistantId)}`
    : url;
}
/**
 * The Vapi `server` object for a webhook URL. When VAPI_WEBHOOK_SECRET is set, Vapi echoes it back
 * as the `x-vapi-secret` header on every call, which our webhook routes verify (so tools can't be
 * invoked by anyone who learns the URL). Omitted when unset so local dev still works.
 */
function serverObj(url: string): Record<string, unknown> {
  const secret = env.VAPI_WEBHOOK_SECRET?.trim();
  return secret ? { url, secret } : { url };
}

// The SDK request types are large and version-specific; we build plain request objects and
// call through a loosely-typed view of the client. Verify these shapes against live Vapi
// docs before production (Research §3.6). The SDK is still imported only in this adapter.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = Record<string, any>;

export class VapiVoiceProvider implements VoiceProvider {
  readonly name = VoiceProviderName.VAPI;

  private client(apiKey?: string): AnyClient {
    return getVapiClient(apiKey) as unknown as AnyClient;
  }

  async provisionOrg(input: ProvisionOrgInput): Promise<ProvisionResult> {
    const client = this.client(input.providerApiKey);
    const baseUrl = input.publicApiBaseUrl || env.PUBLIC_API_BASE_URL;
    const existing = input.existing ?? {};

    // 1) Tools (idempotent: reuse existing ids).
    const toolIds: ProvisionResult["toolIds"] = [];
    for (const name of TOOL_NAMES) {
      const prior = existing.toolIds?.find((t) => t.name === name);
      if (prior?.id) {
        toolIds.push({ name, id: prior.id });
        continue;
      }
      const created = await client.tools.create({
        type: "function",
        function: { name },
        server: serverObj(toolsUrl(baseUrl, input.organizationId)),
      });
      toolIds.push({ name, id: String(created.id) });
    }

    // 2) Knowledge base (best-effort; files attach in M1.6).
    // KB creation typically requires files; created lazily on first upload (M1.6).
    const knowledgeBaseId = existing.knowledgeBaseId;

    // 3) Assistant (attach tools, set end-of-call webhook + org metadata).
    let assistantId = existing.assistantId;
    const assistantBody = {
      name: input.assistant.name || input.organizationName,
      firstMessage: input.assistant.greeting,
      model: {
        provider: providerForModel(input.assistant.llmModel),
        model: input.assistant.llmModel ?? "gpt-4o",
        messages: input.assistant.prompt
          ? [{ role: "system", content: input.assistant.prompt }]
          : undefined,
        toolIds: toolIds.map((t) => t.id),
      },
      voice: input.assistant.voice
        ? { provider: "vapi", voiceId: input.assistant.voice }
        : undefined,
      server: serverObj(
        callEndedUrl(baseUrl, input.organizationId, input.assistantId),
      ),
      metadata: {
        organization_id: input.organizationId,
        ...(input.assistantId ? { assistant_id: input.assistantId } : {}),
      },
    };
    if (assistantId) {
      await client.assistants.update(assistantId, assistantBody);
    } else {
      const created = await client.assistants.create(assistantBody);
      assistantId = String(created.id);
    }

    // 4) Phone number (attach to assistant) — BEST EFFORT. Vapi requires a desired area code to buy
    // a free number; if VAPI_DEFAULT_AREA_CODE isn't set (or the purchase fails / none available),
    // create the assistant WITHOUT a number rather than failing the whole provision. A number can be
    // provisioned later once an area code (or imported number) is available.
    let phoneNumberId = existing.phoneNumberId;
    let phoneNumber = existing.phoneNumber;
    const areaCode = env.VAPI_DEFAULT_AREA_CODE?.trim();
    if (!phoneNumberId && areaCode) {
      try {
        const created = await client.phoneNumbers.create({
          provider: "vapi",
          assistantId,
          numberDesiredAreaCode: areaCode,
        });
        phoneNumberId = String(created.id);
        phoneNumber = String(created.number ?? phoneNumber ?? "");
      } catch (e) {
        logger.warn(
          "Vapi: could not buy a phone number; assistant created without one",
          {
            organizationId: input.organizationId,
            areaCode,
            error: e instanceof Error ? e.message : String(e),
          },
        );
      }
    }

    return {
      assistantId: assistantId!,
      phoneNumber,
      phoneNumberId,
      knowledgeBaseId,
      toolIds,
      providerOrgId: existing.providerOrgId,
      raw: { provisioned: true },
    };
  }

  async updateAssistant(input: UpdateAssistantInput): Promise<{ raw?: unknown }> {
    const client = this.client(input.providerApiKey);
    // Only include `model` when something model-related changed (llm/prompt/tools); undefined
    // sub-fields are dropped on serialization so unrelated config isn't clobbered.
    const includeModel = !!(input.llmModel || input.prompt || input.toolIds);
    const body = {
      name: input.name,
      firstMessage: input.greeting,
      model: includeModel
        ? {
            provider: providerForModel(input.llmModel),
            model: input.llmModel ?? "gpt-4o",
            messages: input.prompt
              ? [{ role: "system", content: input.prompt }]
              : undefined,
            toolIds: input.toolIds,
          }
        : undefined,
      voice: input.voice ? { provider: "vapi", voiceId: input.voice } : undefined,
      // Refresh the call-ended webhook (URL + current secret) only when asked, so config-only
      // updates don't clobber it. Our Assistant id is baked in for per-assistant attribution.
      server: input.callEndedAssistantId
        ? serverObj(
            callEndedUrl(
              env.PUBLIC_API_BASE_URL,
              input.organizationId,
              input.callEndedAssistantId,
            ),
          )
        : undefined,
    };
    const raw = await client.assistants.update(input.assistantId, body);
    return { raw };
  }

  async createTool(input: ToolDefinitionInput): Promise<{ id: string; raw?: unknown }> {
    const client = this.client(input.providerApiKey);
    const created = await client.tools.create({
      type: "function",
      function: {
        name: input.name,
        description: input.description,
        parameters: input.parameters,
      },
      server: serverObj(input.serverUrl),
    });
    return { id: String(created.id), raw: created };
  }

  async updateTool(
    input: ToolDefinitionInput & { toolId: string },
  ): Promise<{ raw?: unknown }> {
    const client = this.client(input.providerApiKey);
    const raw = await client.tools.update(input.toolId, {
      function: {
        name: input.name,
        description: input.description,
        parameters: input.parameters,
      },
      server: serverObj(input.serverUrl),
    });
    return { raw };
  }

  async deleteTool(input: {
    toolId: string;
    providerApiKey?: string;
  }): Promise<void> {
    const client = this.client(input.providerApiKey);
    await client.tools.delete(input.toolId);
  }

  async deleteOrg(input: {
    assistantId?: string;
    phoneNumberId?: string;
    knowledgeBaseId?: string;
    toolIds?: string[];
    providerApiKey?: string;
  }): Promise<void> {
    const client = this.client(input.providerApiKey);
    const safeDelete = async (fn: () => Promise<unknown>) => {
      try {
        await fn();
      } catch (e) {
        logger.warn("vapi deleteOrg step failed", {
          error: e instanceof Error ? e.message : String(e),
        });
      }
    };
    if (input.phoneNumberId)
      await safeDelete(() => client.phoneNumbers.delete(input.phoneNumberId));
    if (input.assistantId)
      await safeDelete(() => client.assistants.delete(input.assistantId));
    for (const id of input.toolIds ?? [])
      await safeDelete(() => client.tools.delete(id));
    if (input.knowledgeBaseId)
      await safeDelete(() => client.knowledgeBases.delete(input.knowledgeBaseId));
  }

  async uploadKnowledgeFile(
    input: UploadKnowledgeFileInput,
  ): Promise<UploadKnowledgeFileResult> {
    const client = this.client(input.providerApiKey);
    const file = new File([new Uint8Array(input.content)], input.fileName, {
      type: input.mimeType,
    });
    const created = await client.files.create(file);
    return {
      fileId: String(created.id),
      knowledgeBaseId: input.knowledgeBaseId,
      sizeBytes: input.content.byteLength,
      raw: created,
    };
  }

  async deleteKnowledgeFile(input: {
    fileId: string;
    providerApiKey?: string;
  }): Promise<void> {
    const client = this.client(input.providerApiKey);
    await client.files.delete(input.fileId);
  }

  parseInboundToolCall(req: RawWebhookRequest): NormalizedToolCall {
    return parseInboundToolCall(req);
  }
  formatToolResponse(toolCallId: string, result: unknown): unknown {
    return formatToolResponse(toolCallId, result);
  }
  parseCallEnded(req: RawWebhookRequest): NormalizedCallRecord {
    return parseCallEnded(req);
  }

  async listAssistants(input: { providerApiKey?: string }) {
    const client = this.client(input.providerApiKey);
    const list = await client.assistants.list({ limit: 100 });
    const arr = Array.isArray(list) ? list : [];
    return arr
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((a: any) => ({
        assistantId: String(a.id ?? ""),
        name: a.name ? String(a.name) : undefined,
      }))
      .filter((a) => a.assistantId);
  }

  async listVoices(apiKey?: string) {
    // Best-effort live fetch from Vapi's voice-library; fall back to curated on any error.
    try {
      const token = apiKey || env.VAPI_API_KEY;
      if (!token) return CURATED_VOICES;
      const res = await fetch(`${env.VAPI_BASE_URL}/voice-library`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return CURATED_VOICES;
      const data = (await res.json()) as unknown;
      const arr = Array.isArray(data) ? data : [];
      const mapped = arr
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((v: any) => ({
          id: String(v.voiceId ?? v.id ?? v.slug ?? ""),
          label: String(v.name ?? v.voiceName ?? v.voiceId ?? v.id ?? ""),
          provider: v.provider ? String(v.provider) : undefined,
        }))
        .filter((v) => v.id);
      return mapped.length ? mapped.slice(0, 100) : CURATED_VOICES;
    } catch {
      return CURATED_VOICES;
    }
  }

  async listModels() {
    return CURATED_MODELS;
  }

  async provisionTools(input: {
    organizationId: string;
    publicApiBaseUrl: string;
    providerApiKey?: string;
  }): Promise<Array<{ name: ToolName; id: string }>> {
    const client = this.client(input.providerApiKey);
    const baseUrl = input.publicApiBaseUrl || env.PUBLIC_API_BASE_URL;
    const out: Array<{ name: ToolName; id: string }> = [];
    for (const name of TOOL_NAMES) {
      const created = await client.tools.create({
        type: "function",
        function: { name },
        server: serverObj(toolsUrl(baseUrl, input.organizationId)),
      });
      out.push({ name, id: String(created.id) });
    }
    return out;
  }

  async pullOrgData(input: {
    organizationId: string;
    assistantId?: string;
    phoneNumberId?: string;
    providerApiKey?: string;
    allowAdopt?: boolean;
  }): Promise<ProviderSnapshot> {
    const client = this.client(input.providerApiKey);
    const snap: ProviderSnapshot = { calls: [] };

    // Assistant (known id, else adopt the first existing one).
    try {
      let raw: unknown;
      if (input.assistantId) {
        raw = await client.assistants.get(input.assistantId);
      } else if (input.allowAdopt) {
        const list = await client.assistants.list({ limit: 1 });
        raw = Array.isArray(list) ? list[0] : undefined;
      }
      if (raw) {
        const a = mapAssistant(raw);
        if (a.assistantId) {
          snap.assistant = a;
          snap.knowledgeBaseId = a.knowledgeBaseId;
        }
      }
    } catch (e) {
      logger.warn("pullOrgData: assistant fetch failed", { error: String(e) });
    }

    // Assistant tools (reflect Vapi -> portal). Read the assistant's toolIds, then resolve the
    // tool objects from the account's tool list.
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rawA = snap.assistant?.raw as any;
      const model = rawA?.model ?? {};
      const toolIds: string[] = Array.isArray(model.toolIds)
        ? model.toolIds.map(String)
        : [];
      if (toolIds.length) {
        const list = await client.tools.list();
        const arr = Array.isArray(list) ? list : [];
        snap.tools = arr
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .filter((t: any) => toolIds.includes(String(t.id)))
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .map((t: any) => ({
            id: String(t.id),
            name: String(t.function?.name ?? t.name ?? ""),
            description: t.function?.description
              ? String(t.function.description)
              : undefined,
            parameters: t.function?.parameters,
            serverUrl: t.server?.url ? String(t.server.url) : undefined,
          }))
          .filter((t) => t.id && t.name);
      }
    } catch (e) {
      logger.warn("pullOrgData: tools fetch failed", { error: String(e) });
    }

    // Phone number.
    try {
      const pnId = input.phoneNumberId ?? snap.assistant?.phoneNumberId;
      if (pnId) {
        const pn = await client.phoneNumbers.get(pnId);
        snap.phoneNumber = { id: String(pn.id), number: pn.number };
      } else if (input.allowAdopt) {
        const list = await client.phoneNumbers.list({ limit: 1 });
        const pn = Array.isArray(list) ? list[0] : undefined;
        if (pn) snap.phoneNumber = { id: String(pn.id), number: pn.number };
      }
    } catch (e) {
      logger.warn("pullOrgData: phone fetch failed", { error: String(e) });
    }

    // Historical calls (scoped to the assistant when known).
    try {
      const opts = snap.assistant?.assistantId
        ? { assistantId: snap.assistant.assistantId, limit: 100 }
        : { limit: 100 };
      const list = await client.calls.list(opts);
      const arr = Array.isArray(list) ? list : [];
      snap.calls = arr
        .map((c: unknown) => mapCallObject(c, input.organizationId))
        .filter((c) => c.providerCallId);
    } catch (e) {
      logger.warn("pullOrgData: calls fetch failed", { error: String(e) });
    }

    return snap;
  }

  async validateApiKey(apiKey: string): Promise<KeyValidationResult> {
    try {
      // A lightweight authenticated call. Public keys can't do backend ops → 401.
      await this.client(apiKey).assistants.list({ limit: 1 });
      return { valid: true };
    } catch (e) {
      if (e instanceof VapiError) {
        return {
          valid: false,
          reason:
            e.statusCode === 401 || e.statusCode === 403
              ? "Key rejected — make sure it's a PRIVATE key"
              : `Vapi error ${e.statusCode}`,
        };
      }
      return { valid: false, reason: "Could not validate key" };
    }
  }

  async reconcile(input: {
    assistantId?: string;
    phoneNumberId?: string;
    providerApiKey?: string;
  }): Promise<{ status: SyncStatus; raw?: unknown }> {
    const client = this.client(input.providerApiKey);
    try {
      if (input.assistantId) {
        const a = await client.assistants.get(input.assistantId);
        return { status: SyncStatus.SYNCED, raw: a };
      }
      return { status: SyncStatus.SYNCED };
    } catch (e) {
      if (e instanceof VapiError && e.statusCode === 404) {
        return { status: SyncStatus.STALE };
      }
      return { status: SyncStatus.FAILED, raw: { error: String(e) } };
    }
  }
}
