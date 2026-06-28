/**
 * Assistants feature — multiple voice assistants per organization (1 org : N).
 *
 * The `Assistant` table is the canonical per-assistant store (provider-neutral mirror ids +
 * greeting/prompt/voice/model). Tools and knowledge files are an ORG-LEVEL library; each
 * assistant SELECTS a subset via the join tables (AssistantTool / AssistantKnowledgeFile).
 *
 * Provisioning/reconcile go through the VoiceProvider PORT only (never a vendor SDK) and bake
 * our Assistant id into the assistant's call-ended webhook so calls are attributed per-assistant.
 *
 * Org-scoped customer data → uses tenantDb(orgId). The org-level Vapi credential lives on
 * OrgVapiConfig and is read with the raw client (super-admin connection settings).
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@server/platform/db/client";
import { tenantDb } from "@server/platform/db/scoped";
import { env } from "@server/config/env";
import { AppError } from "@server/platform/http/errors";
import { logger } from "@server/platform/logging/logger";
import { decryptSecret } from "@server/platform/crypto/secretBox";
import { getVoiceProvider } from "@server/config/providers";
import { recordSyncLog } from "@server/features/sync/sync-log.service";
import { ensureBuiltinTools } from "@server/features/tools/tools.service";
import type { ToolName } from "@domain/enums";
import type { AssistantDTO } from "@contracts/assistants";

type AssistantRow = Prisma.AssistantGetPayload<{
  include: {
    tools: { select: { toolId: true } };
    knowledgeFiles: { select: { fileId: true } };
  };
}>;

const ASSISTANT_INCLUDE = {
  tools: { select: { toolId: true } },
  knowledgeFiles: { select: { fileId: true } },
} as const;

function toAssistantDTO(a: AssistantRow): AssistantDTO {
  return {
    id: a.id,
    name: a.name,
    isDefault: a.isDefault,
    provider: a.provider,
    providerAssistantId: a.providerAssistantId,
    providerPhoneNumber: a.providerPhoneNumber,
    providerPhoneNumberId: a.providerPhoneNumberId,
    providerKnowledgeBaseId: a.providerKnowledgeBaseId,
    greeting: a.greeting,
    prompt: a.prompt,
    voice: a.voice,
    llmModel: a.llmModel,
    syncStatus: a.syncStatus as AssistantDTO["syncStatus"],
    lastSyncedAt: a.lastSyncedAt ? a.lastSyncedAt.toISOString() : null,
    syncError: a.syncError,
    selectedToolIds: a.tools.map((t) => t.toolId),
    selectedKnowledgeFileIds: a.knowledgeFiles.map((f) => f.fileId),
    createdAt: a.createdAt.toISOString(),
  };
}

/** Resolve the decrypted provider key for an org (per-customer override, else platform). */
async function resolveProviderKey(orgId: string): Promise<string | undefined> {
  const cfg = await prisma.orgVapiConfig.findUnique({
    where: { organizationId: orgId },
    select: { vapiPrivateKeyEnc: true },
  });
  if (cfg?.vapiPrivateKeyEnc) return decryptSecret(cfg.vapiPrivateKeyEnc);
  return undefined;
}

export interface CreateAssistantInput {
  name: string;
  greeting?: string | null;
  prompt?: string | null;
  voice?: string | null;
  llmModel?: string | null;
  isDefault?: boolean;
}

export interface UpdateAssistantConfigInput {
  name?: string;
  greeting?: string | null;
  prompt?: string | null;
  voice?: string | null;
  llmModel?: string | null;
}

export async function listAssistants(orgId: string): Promise<AssistantDTO[]> {
  const rows = await tenantDb(orgId).assistant.findMany({
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    include: ASSISTANT_INCLUDE,
  });
  return rows.map(toAssistantDTO);
}

export async function getAssistant(
  orgId: string,
  assistantId: string,
): Promise<AssistantDTO> {
  const a = await tenantDb(orgId).assistant.findFirst({
    where: { id: assistantId },
    include: ASSISTANT_INCLUDE,
  });
  if (!a) throw AppError.notFound("Assistant not found");
  return toAssistantDTO(a);
}

/** Create an assistant row (provision separately). First assistant becomes the default. */
export async function createAssistant(
  orgId: string,
  input: CreateAssistantInput,
): Promise<AssistantDTO> {
  const db = tenantDb(orgId);
  const count = await db.assistant.count();
  const created = await db.assistant.create({
    data: {
      organizationId: orgId,
      name: input.name,
      greeting: input.greeting ?? null,
      prompt: input.prompt ?? null,
      voice: input.voice ?? null,
      llmModel: input.llmModel ?? null,
      isDefault: input.isDefault ?? count === 0,
    },
  });
  return getAssistant(orgId, created.id);
}

/** Adopt an existing provider assistant as a new Assistant row, pulling its config. */
export async function importAssistant(
  orgId: string,
  providerAssistantId: string,
  name?: string,
): Promise<AssistantDTO> {
  const db = tenantDb(orgId);
  const dup = await db.assistant.findFirst({ where: { providerAssistantId } });
  if (dup) throw AppError.conflict("That assistant is already imported");
  const count = await db.assistant.count();
  const created = await db.assistant.create({
    data: {
      organizationId: orgId,
      name: name ?? "Imported assistant",
      isDefault: count === 0,
      providerAssistantId,
      syncStatus: "pending",
    },
  });
  // Best-effort: pull the assistant's config from the provider.
  try {
    const snap = await getVoiceProvider().pullOrgData({
      organizationId: orgId,
      assistantId: providerAssistantId,
      providerApiKey: await resolveProviderKey(orgId),
      allowAdopt: false,
    });
    if (snap.assistant) {
      await db.assistant.update({
        where: { id: created.id },
        data: {
          name: name ?? snap.assistant.name ?? created.name,
          greeting: snap.assistant.greeting ?? null,
          prompt: snap.assistant.prompt ?? null,
          voice: snap.assistant.voice ?? null,
          llmModel: snap.assistant.llmModel ?? null,
          providerKnowledgeBaseId: snap.assistant.knowledgeBaseId ?? null,
          providerPhoneNumberId: snap.phoneNumber?.id ?? null,
          providerPhoneNumber: snap.phoneNumber?.number ?? null,
          syncStatus: "synced",
          lastSyncedAt: new Date(),
        },
      });
    }
  } catch (e) {
    logger.warn("importAssistant: provider pull failed (row kept as pending)", {
      orgId,
      error: e instanceof Error ? e.message : String(e),
    });
  }
  return getAssistant(orgId, created.id);
}

/** The org's default assistant, creating one if the org has none yet. */
export async function getOrCreateDefaultAssistant(orgId: string, name?: string) {
  const db = tenantDb(orgId);
  const existing = await db.assistant.findFirst({
    where: {},
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
  });
  if (existing) return existing;
  return db.assistant.create({
    data: { organizationId: orgId, name: name ?? "Default assistant", isDefault: true },
  });
}

export async function updateAssistantConfig(
  orgId: string,
  assistantId: string,
  input: UpdateAssistantConfigInput,
) {
  const db = tenantDb(orgId);
  const assistant = await db.assistant.findFirst({ where: { id: assistantId } });
  if (!assistant) throw AppError.notFound("Assistant not found");

  const data: Record<string, unknown> = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.greeting !== undefined) data.greeting = input.greeting;
  if (input.prompt !== undefined) data.prompt = input.prompt;
  if (input.voice !== undefined) data.voice = input.voice;
  if (input.llmModel !== undefined) data.llmModel = input.llmModel;

  await db.assistant.update({ where: { id: assistantId }, data });

  // Push config to the provider if this assistant is already provisioned.
  if (assistant.providerAssistantId) {
    try {
      await getVoiceProvider().updateAssistant({
        organizationId: orgId,
        assistantId: assistant.providerAssistantId,
        greeting: input.greeting ?? undefined,
        prompt: input.prompt ?? undefined,
        voice: input.voice ?? undefined,
        llmModel: input.llmModel ?? undefined,
        providerApiKey: await resolveProviderKey(orgId),
      });
      await db.assistant.update({
        where: { id: assistantId },
        data: { syncStatus: "synced", lastSyncedAt: new Date(), syncError: null },
      });
    } catch (e) {
      await db.assistant.update({
        where: { id: assistantId },
        data: {
          syncStatus: "failed",
          syncError: e instanceof Error ? e.message : String(e),
        },
      });
    }
  }
  return getAssistant(orgId, assistantId);
}

export async function setDefaultAssistant(orgId: string, assistantId: string) {
  const db = tenantDb(orgId);
  const assistant = await db.assistant.findFirst({ where: { id: assistantId } });
  if (!assistant) throw AppError.notFound("Assistant not found");
  await db.assistant.updateMany({ where: {}, data: { isDefault: false } });
  await db.assistant.update({ where: { id: assistantId }, data: { isDefault: true } });
  return getAssistant(orgId, assistantId);
}

export async function deleteAssistant(orgId: string, assistantId: string) {
  const db = tenantDb(orgId);
  const assistant = await db.assistant.findFirst({ where: { id: assistantId } });
  if (!assistant) throw AppError.notFound("Assistant not found");

  // Best-effort: tear down provider resources for this assistant.
  if (assistant.providerAssistantId || assistant.providerPhoneNumberId) {
    try {
      await getVoiceProvider().deleteOrg({
        organizationId: orgId,
        assistantId: assistant.providerAssistantId ?? undefined,
        phoneNumberId: assistant.providerPhoneNumberId ?? undefined,
        knowledgeBaseId: assistant.providerKnowledgeBaseId ?? undefined,
        providerApiKey: await resolveProviderKey(orgId),
      });
    } catch (e) {
      logger.warn("deleteAssistant: provider teardown failed (removing row anyway)", {
        orgId,
        assistantId,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
  await db.assistant.delete({ where: { id: assistantId } });
  return { deleted: true as const };
}

/** Replace this assistant's selected tools with `toolIds` (org-library VapiTool ids). */
export async function setAssistantTools(
  orgId: string,
  assistantId: string,
  toolIds: string[],
) {
  const db = tenantDb(orgId);
  const assistant = await db.assistant.findFirst({ where: { id: assistantId } });
  if (!assistant) throw AppError.notFound("Assistant not found");

  // Validate every tool id belongs to this org's library.
  const valid = await db.vapiTool.findMany({
    where: { id: { in: toolIds } },
    select: { id: true },
  });
  const validIds = new Set(valid.map((t) => t.id));
  for (const id of toolIds) {
    if (!validIds.has(id)) throw AppError.badRequest(`Unknown tool: ${id}`);
  }

  await db.assistantTool.deleteMany({ where: { assistantId } });
  if (toolIds.length > 0) {
    await db.assistantTool.createMany({
      data: toolIds.map((toolId) => ({ organizationId: orgId, assistantId, toolId })),
      skipDuplicates: true,
    });
  }
  return getAssistant(orgId, assistantId);
}

/** Replace this assistant's selected knowledge files with `fileIds` (org-library ids). */
export async function setAssistantKnowledge(
  orgId: string,
  assistantId: string,
  fileIds: string[],
) {
  const db = tenantDb(orgId);
  const assistant = await db.assistant.findFirst({ where: { id: assistantId } });
  if (!assistant) throw AppError.notFound("Assistant not found");

  const valid = await db.knowledgeBaseFile.findMany({
    where: { id: { in: fileIds } },
    select: { id: true },
  });
  const validIds = new Set(valid.map((f) => f.id));
  for (const id of fileIds) {
    if (!validIds.has(id)) throw AppError.badRequest(`Unknown knowledge file: ${id}`);
  }

  await db.assistantKnowledgeFile.deleteMany({ where: { assistantId } });
  if (fileIds.length > 0) {
    await db.assistantKnowledgeFile.createMany({
      data: fileIds.map((fileId) => ({ organizationId: orgId, assistantId, fileId })),
      skipDuplicates: true,
    });
  }
  return getAssistant(orgId, assistantId);
}

/**
 * Provision (idempotent) this assistant's voice resources: create/reuse a provider assistant +
 * phone number with our Assistant id baked into the call-ended webhook, mirror every id back,
 * seed the org's built-in tools, and select them for this assistant.
 */
export async function provisionAssistant(
  orgId: string,
  assistantId: string,
  triggeredBy?: string,
): Promise<{ syncStatus: string; syncError: string | null }> {
  const org = await prisma.organization.findUnique({ where: { id: orgId } });
  if (!org) throw AppError.notFound("Organization not found");
  const db = tenantDb(orgId);
  const assistant = await db.assistant.findFirst({
    where: { id: assistantId },
    include: { tools: { include: { tool: true } } },
  });
  if (!assistant) throw AppError.notFound("Assistant not found");

  const provider = getVoiceProvider();
  const providerApiKey = await resolveProviderKey(orgId);
  const startedAt = new Date();

  try {
    const result = await provider.provisionOrg({
      organizationId: orgId,
      organizationName: org.name,
      assistantId: assistant.id,
      publicApiBaseUrl: env.PUBLIC_API_BASE_URL,
      providerApiKey,
      assistant: {
        greeting: assistant.greeting ?? undefined,
        prompt: assistant.prompt ?? undefined,
        voice: assistant.voice ?? undefined,
        llmModel: assistant.llmModel ?? undefined,
      },
      existing: {
        assistantId: assistant.providerAssistantId ?? undefined,
        phoneNumberId: assistant.providerPhoneNumberId ?? undefined,
        phoneNumber: assistant.providerPhoneNumber ?? undefined,
        knowledgeBaseId: assistant.providerKnowledgeBaseId ?? undefined,
        toolIds: assistant.tools
          .filter((s) => s.tool.vapiToolId)
          .map((s) => ({ name: s.tool.name as ToolName, id: s.tool.vapiToolId! })),
      },
    });

    await db.assistant.update({
      where: { id: assistantId },
      data: {
        providerAssistantId: result.assistantId,
        providerPhoneNumberId: result.phoneNumberId,
        providerPhoneNumber: result.phoneNumber || null,
        providerKnowledgeBaseId: result.knowledgeBaseId ?? null,
        syncStatus: "synced",
        lastSyncedAt: new Date(),
        syncError: null,
        providerRaw: (result.raw ?? Prisma.JsonNull) as Prisma.InputJsonValue,
      },
    });
    if (result.providerOrgId) {
      await prisma.orgVapiConfig.update({
        where: { organizationId: orgId },
        data: { vapiOrgId: result.providerOrgId },
      });
    }

    // Seed the org's built-in tool library and select the provisioned tools for this assistant.
    await ensureBuiltinTools(orgId);
    for (const t of result.toolIds) {
      const tool = await db.vapiTool.upsert({
        where: { organizationId_name: { organizationId: orgId, name: t.name } },
        update: { vapiToolId: t.id, syncStatus: "synced", lastSyncedAt: new Date() },
        create: {
          organizationId: orgId,
          name: t.name,
          vapiToolId: t.id,
          staticParams: { organization_id: orgId },
          syncStatus: "synced",
        },
      });
      await db.assistantTool.upsert({
        where: { assistantId_toolId: { assistantId, toolId: tool.id } },
        update: {},
        create: { organizationId: orgId, assistantId, toolId: tool.id },
      });
    }

    await recordSyncLog({
      organizationId: orgId,
      type: "provision",
      status: "success",
      summary: `Provisioned assistant "${assistant.name}", phone number, and ${result.toolIds.length} tools`,
      details: {
        assistantId,
        providerAssistantId: result.assistantId,
        phoneNumber: result.phoneNumber,
      },
      triggeredBy,
      startedAt,
    });
    return { syncStatus: "synced", syncError: null };
  } catch (e) {
    const syncError = e instanceof Error ? e.message : String(e);
    logger.error("Assistant provisioning failed", { orgId, assistantId, syncError });
    await db.assistant.update({
      where: { id: assistantId },
      data: { syncStatus: "failed", syncError },
    });
    await recordSyncLog({
      organizationId: orgId,
      type: "provision",
      status: "failed",
      summary: `Provisioning assistant "${assistant.name}" failed`,
      error: syncError,
      triggeredBy,
      startedAt,
    });
    return { syncStatus: "failed", syncError };
  }
}

/** Attach exactly this assistant's currently-selected (synced) tools to the provider assistant. */
export async function reconcileAssistant(orgId: string, assistantId: string) {
  const db = tenantDb(orgId);
  const assistant = await db.assistant.findFirst({
    where: { id: assistantId },
    include: { tools: { include: { tool: true } } },
  });
  if (!assistant) throw AppError.notFound("Assistant not found");
  if (!assistant.providerAssistantId) {
    throw AppError.badRequest("Assistant is not provisioned yet");
  }

  const toolIds = assistant.tools
    .map((s) => s.tool.vapiToolId)
    .filter((id): id is string => !!id);

  await getVoiceProvider().updateAssistant({
    organizationId: orgId,
    assistantId: assistant.providerAssistantId,
    greeting: assistant.greeting ?? undefined,
    prompt: assistant.prompt ?? undefined,
    voice: assistant.voice ?? undefined,
    llmModel: assistant.llmModel ?? undefined,
    toolIds,
    providerApiKey: await resolveProviderKey(orgId),
  });
  await db.assistant.update({
    where: { id: assistantId },
    data: { syncStatus: "synced", lastSyncedAt: new Date(), syncError: null },
  });
  return getAssistant(orgId, assistantId);
}
