/**
 * Vapi payload <-> our neutral domain types. This is the ONLY place that knows Vapi's
 * exact webhook JSON nesting (Research §3.6 — the #1 cause of a broken first integration).
 * Pure functions, unit-tested against representative payloads (tests U-VAPI-01..03).
 *
 * Tenant identity (`organization_id`) is server-trusted: we read it from the webhook URL
 * query we baked in at provisioning time, falling back to assistant/call metadata. It is
 * NEVER taken from anything the AI could influence.
 */

import { CallDirection, type ToolName } from "@domain/enums";
import type {
  NormalizedCallRecord,
  NormalizedToolCall,
  ProviderAssistantConfig,
  RawWebhookRequest,
} from "@server/ports/voice-provider.port";

type Json = Record<string, unknown>;

function asObj(v: unknown): Json {
  return v && typeof v === "object" ? (v as Json) : {};
}

function resolveOrgId(req: RawWebhookRequest, message: Json): string {
  // 1) Server-trusted: the query param we configured on the tool/webhook URL.
  const fromQuery = req.query?.organization_id;
  if (fromQuery) return fromQuery;
  // 2) Fallbacks: assistant or call metadata we set at provisioning.
  const assistant = asObj(message.assistant);
  const assistantMeta = asObj(assistant.metadata);
  if (typeof assistantMeta.organization_id === "string")
    return assistantMeta.organization_id;
  const call = asObj(message.call);
  const callMeta = asObj(call.metadata);
  if (typeof callMeta.organization_id === "string")
    return callMeta.organization_id;
  return "";
}

function parseArgs(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === "object") return raw as Record<string, unknown>;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return {};
}

/** Vapi "tool-calls" webhook → NormalizedToolCall (first tool call in the payload). */
export function parseInboundToolCall(
  req: RawWebhookRequest,
): NormalizedToolCall {
  const body = asObj(req.body);
  const message = asObj(body.message);
  const organizationId = resolveOrgId(req, message);

  // Attribute the call to one of the org's assistants (per-assistant scoping). Same envelope as
  // the call-ended payload: prefer message.assistant.id, fall back to message.call.assistantId.
  const assistant = asObj(message.assistant);
  const callObj = asObj(message.call);
  const providerAssistantId =
    typeof assistant.id === "string"
      ? assistant.id
      : typeof callObj.assistantId === "string"
        ? callObj.assistantId
        : undefined;

  // Vapi may send either `toolCallList: [{id,name,arguments}]` or
  // `toolCalls: [{id, function:{name, arguments}}]`. Support both.
  const list = Array.isArray(message.toolCallList)
    ? (message.toolCallList as Json[])
    : [];
  const calls = Array.isArray(message.toolCalls)
    ? (message.toolCalls as Json[])
    : [];

  let toolCallId = "";
  let toolName = "";
  let args: Record<string, unknown> = {};

  if (list.length > 0) {
    const tc = list[0];
    toolCallId = String(tc.id ?? "");
    toolName = String(tc.name ?? "");
    args = parseArgs(tc.arguments);
  } else if (calls.length > 0) {
    const tc = calls[0];
    toolCallId = String(tc.id ?? "");
    const fn = asObj(tc.function);
    toolName = String(fn.name ?? "");
    args = parseArgs(fn.arguments);
  }

  return {
    organizationId,
    providerAssistantId,
    toolCallId,
    toolName: toolName as ToolName,
    args,
    raw: req.body,
  };
}

/** Tool result → Vapi's expected response shape, echoing the same toolCallId. */
export function formatToolResponse(toolCallId: string, result: unknown): Json {
  return {
    results: [
      {
        toolCallId,
        result: typeof result === "string" ? result : JSON.stringify(result),
      },
    ],
  };
}

function toDate(v: unknown): Date | undefined {
  if (typeof v === "string" || typeof v === "number") {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? undefined : d;
  }
  return undefined;
}

function toNum(v: unknown): number | undefined {
  return typeof v === "number" ? v : undefined;
}

/** Vapi "end-of-call-report" webhook → NormalizedCallRecord (all ids + cost + reason). */
export function parseCallEnded(req: RawWebhookRequest): NormalizedCallRecord {
  const body = asObj(req.body);
  const message = asObj(body.message);
  const call = asObj(message.call);
  const assistant = asObj(message.assistant);
  const phoneNumber = asObj(message.phoneNumber);
  const customer = asObj(message.customer);
  const artifact = asObj(message.artifact);

  const organizationId = resolveOrgId(req, message);

  const rawMessages = Array.isArray(message.messages)
    ? (message.messages as Json[])
    : Array.isArray(artifact.messages)
      ? (artifact.messages as Json[])
      : [];

  const messages = rawMessages
    .filter((m) => typeof m.role === "string" && m.role !== "system")
    .map((m) => ({
      role: String(m.role),
      text: String(m.message ?? m.content ?? m.text ?? ""),
      secondsFromStart:
        typeof m.secondsFromStart === "number" ? m.secondsFromStart : undefined,
    }));

  const startedAt = toDate(message.startedAt) ?? toDate(call.startedAt);
  const endedAt = toDate(message.endedAt) ?? toDate(call.endedAt);
  let durationSeconds = toNum(message.durationSeconds);
  if (durationSeconds === undefined && startedAt && endedAt) {
    durationSeconds = Math.round((endedAt.getTime() - startedAt.getTime()) / 1000);
  }

  return {
    organizationId,
    direction: CallDirection.INBOUND,
    providerCallId: String(call.id ?? message.id ?? ""),
    providerOrgId:
      typeof call.orgId === "string" ? call.orgId : undefined,
    assistantId:
      typeof assistant.id === "string"
        ? assistant.id
        : typeof call.assistantId === "string"
          ? call.assistantId
          : undefined,
    phoneNumberId:
      typeof phoneNumber.id === "string"
        ? phoneNumber.id
        : typeof call.phoneNumberId === "string"
          ? call.phoneNumberId
          : undefined,
    phoneCallProvider:
      typeof call.phoneCallProvider === "string"
        ? call.phoneCallProvider
        : undefined,
    phoneCallProviderId:
      typeof call.phoneCallProviderId === "string"
        ? call.phoneCallProviderId
        : undefined,
    fromNumber:
      typeof customer.number === "string" ? customer.number : undefined,
    toNumber:
      typeof phoneNumber.number === "string" ? phoneNumber.number : undefined,
    endedReason:
      typeof message.endedReason === "string" ? message.endedReason : undefined,
    cost: toNum(message.cost),
    costBreakdown: message.costBreakdown ?? message.costs,
    recordingUrl:
      typeof message.recordingUrl === "string"
        ? message.recordingUrl
        : typeof artifact.recordingUrl === "string"
          ? artifact.recordingUrl
          : undefined,
    summary: resolveSummary(message),
    startedAt,
    endedAt,
    durationSeconds,
    messages,
    raw: req.body,
  };
}

function resolveSummary(message: Json): string | undefined {
  if (typeof message.summary === "string") return message.summary;
  const analysis = asObj(message.analysis);
  if (typeof analysis.summary === "string") return analysis.summary;
  return undefined;
}

const str = (v: unknown): string | undefined =>
  typeof v === "string" ? v : undefined;

/** Map a Vapi assistant object (assistants.get/list) → neutral assistant config. */
export function mapAssistant(raw: unknown): ProviderAssistantConfig {
  const a = asObj(raw);
  const model = asObj(a.model);
  const voice = asObj(a.voice);
  const sys = (Array.isArray(model.messages) ? (model.messages as Json[]) : []).find(
    (m) => m.role === "system",
  );
  return {
    assistantId: String(a.id ?? ""),
    name: str(a.name),
    greeting: str(a.firstMessage),
    prompt: sys ? str(sys.content) : undefined,
    voice: str(voice.voiceId) ?? str(a.voice),
    llmModel: str(model.model),
    phoneNumberId: str(a.phoneNumberId),
    knowledgeBaseId:
      str(model.knowledgeBaseId) ?? str(a.knowledgeBaseId) ?? undefined,
    raw,
  };
}

/** Map a Vapi call object (calls.list/get) → NormalizedCallRecord for a given org. */
export function mapCallObject(
  raw: unknown,
  organizationId: string,
): NormalizedCallRecord {
  const call = asObj(raw);
  const artifact = asObj(call.artifact);
  const analysis = asObj(call.analysis);
  const customer = asObj(call.customer);
  const phoneNumber = asObj(call.phoneNumber);

  const rawMessages = Array.isArray(call.messages)
    ? (call.messages as Json[])
    : Array.isArray(artifact.messages)
      ? (artifact.messages as Json[])
      : [];
  const messages = rawMessages
    .filter((m) => typeof m.role === "string" && m.role !== "system")
    .map((m) => ({
      role: String(m.role),
      text: String(m.message ?? m.content ?? m.text ?? ""),
      secondsFromStart:
        typeof m.secondsFromStart === "number" ? m.secondsFromStart : undefined,
    }));

  const startedAt = toDate(call.startedAt);
  const endedAt = toDate(call.endedAt);
  let durationSeconds = toNum(call.durationSeconds);
  if (durationSeconds === undefined && startedAt && endedAt) {
    durationSeconds = Math.round((endedAt.getTime() - startedAt.getTime()) / 1000);
  }

  return {
    organizationId,
    direction: CallDirection.INBOUND,
    providerCallId: String(call.id ?? ""),
    providerOrgId: str(call.orgId),
    assistantId: str(call.assistantId),
    phoneNumberId: str(call.phoneNumberId),
    phoneCallProvider: str(call.phoneCallProvider),
    phoneCallProviderId: str(call.phoneCallProviderId),
    fromNumber: str(customer.number),
    toNumber: str(phoneNumber.number),
    endedReason: str(call.endedReason),
    cost: toNum(call.cost),
    costBreakdown: call.costBreakdown ?? call.costs,
    recordingUrl: str(call.recordingUrl) ?? str(artifact.recordingUrl),
    summary: str(call.summary) ?? str(analysis.summary),
    startedAt,
    endedAt,
    durationSeconds,
    messages,
    raw,
  };
}
