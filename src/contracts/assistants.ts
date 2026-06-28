import { z } from "zod";
import { SyncStatusEnum } from "./vapi";

/**
 * Assistants contract (multi-assistant). One org has N assistants; tools + knowledge are an
 * org-level library and each assistant selects a subset (selectedToolIds / selectedKnowledgeFileIds).
 * No secret ever appears here.
 */

export const AssistantDTO = z.object({
  id: z.string(),
  name: z.string(),
  isDefault: z.boolean(),
  provider: z.string(),
  providerAssistantId: z.string().nullable(),
  providerPhoneNumber: z.string().nullable(),
  providerPhoneNumberId: z.string().nullable(),
  providerKnowledgeBaseId: z.string().nullable(),
  greeting: z.string().nullable(),
  prompt: z.string().nullable(),
  voice: z.string().nullable(),
  llmModel: z.string().nullable(),
  syncStatus: SyncStatusEnum,
  lastSyncedAt: z.string().nullable(),
  syncError: z.string().nullable(),
  selectedToolIds: z.array(z.string()),
  selectedKnowledgeFileIds: z.array(z.string()),
  createdAt: z.string(),
});
export type AssistantDTO = z.infer<typeof AssistantDTO>;

export const AssistantResponse = z.object({ assistant: AssistantDTO });
export type AssistantResponse = z.infer<typeof AssistantResponse>;

export const AssistantsResponse = z.object({
  assistants: z.array(AssistantDTO),
});
export type AssistantsResponse = z.infer<typeof AssistantsResponse>;

export const CreateAssistantRequest = z.object({
  name: z.string().min(1).max(120),
  greeting: z.string().optional(),
  prompt: z.string().optional(),
  voice: z.string().optional(),
  llmModel: z.string().optional(),
  /** If set, adopt an existing provider assistant instead of creating a fresh row. */
  importProviderAssistantId: z.string().optional(),
});
export type CreateAssistantRequest = z.infer<typeof CreateAssistantRequest>;

export const UpdateAssistantRequest = z.object({
  name: z.string().min(1).max(120).optional(),
  greeting: z.string().nullable().optional(),
  prompt: z.string().nullable().optional(),
  voice: z.string().nullable().optional(),
  llmModel: z.string().nullable().optional(),
});
export type UpdateAssistantRequest = z.infer<typeof UpdateAssistantRequest>;

export const SetAssistantToolsRequest = z.object({
  toolIds: z.array(z.string()),
});
export type SetAssistantToolsRequest = z.infer<typeof SetAssistantToolsRequest>;

export const SetAssistantKnowledgeRequest = z.object({
  fileIds: z.array(z.string()),
});
export type SetAssistantKnowledgeRequest = z.infer<
  typeof SetAssistantKnowledgeRequest
>;

/** A selectable tool in the org-level catalog (for the Tools page / per-assistant dropdown). */
export const ToolCatalogItem = z.object({
  name: z.string(),
  group: z.enum(["booking", "customer", "service", "staff"]),
  access: z.enum(["read", "write"]),
  description: z.string(),
  parameters: z.unknown(),
});
export type ToolCatalogItem = z.infer<typeof ToolCatalogItem>;

export const ToolCatalogResponse = z.object({
  tools: z.array(ToolCatalogItem),
});
export type ToolCatalogResponse = z.infer<typeof ToolCatalogResponse>;

// ---------- Simulator (text-chat tester) ----------

export const SimulatorMessageDTO = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string(),
});
export type SimulatorMessageDTO = z.infer<typeof SimulatorMessageDTO>;

export const SimulateRequest = z.object({
  messages: z.array(SimulatorMessageDTO).min(1),
});
export type SimulateRequest = z.infer<typeof SimulateRequest>;

export const SimulateResponse = z.object({
  reply: z.string(),
  toolCalls: z.array(
    z.object({
      name: z.string(),
      args: z.unknown(),
      result: z.unknown(),
    }),
  ),
});
export type SimulateResponse = z.infer<typeof SimulateResponse>;
