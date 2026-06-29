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
    services: { select: { serviceId: true } };
    staff: { select: { staffId: true } };
  };
}>;

const ASSISTANT_INCLUDE = {
  tools: { select: { toolId: true } },
  knowledgeFiles: { select: { fileId: true } },
  services: { select: { serviceId: true } },
  staff: { select: { staffId: true } },
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
    selectedServiceIds: a.services.map((s) => s.serviceId),
    selectedStaffIds: a.staff.map((s) => s.staffId),
    createdAt: a.createdAt.toISOString(),
  };
}

/** Resolve the decrypted provider key for an org (per-customer override, else platform). */
async function resolveProviderKey(orgId: string): Promise<string | undefined> {
  const cfg = await prisma.orgVapiConfig.findUnique({
    where: { organizationId: orgId },
    select: { vapiPrivateKeyEnc: true },
  });
  if (cfg?.vapiPrivateKeyEnc) {
    try {
      return decryptSecret(cfg.vapiPrivateKeyEnc);
    } catch (e) {
      // A corrupt/wrong-key credential must not 500 the caller — fall back to the platform key.
      logger.warn("resolveProviderKey: stored key could not be decrypted", {
        orgId,
        error: e instanceof Error ? e.message : String(e),
      });
      return undefined;
    }
  }
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

/**
 * Create an assistant AND provision it in the provider (Vapi assistant + phone + tools) so a portal
 * "Add" produces the same record on both sides. Provisioning is best-effort — the local row is always
 * kept; its `syncStatus`/`syncError` reflect the outcome, and the detail page's Provision button retries.
 */
export async function createAndProvisionAssistant(
  orgId: string,
  input: CreateAssistantInput,
  triggeredBy?: string,
): Promise<AssistantDTO> {
  const created = await createAssistant(orgId, input);
  await provisionAssistant(orgId, created.id, triggeredBy);
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

/**
 * Reflect EVERY assistant in the org's Vapi account into the portal `Assistant` table so they all
 * appear on /assistants. Imports any account assistant we don't already have (keyed on
 * providerAssistantId); existing rows are left untouched. Best-effort per assistant — a single
 * failure (or no key) never throws. Returns how many new rows were created.
 */
export async function reflectAssistantsFromVapi(
  orgId: string,
): Promise<{ created: number }> {
  const db = tenantDb(orgId);
  let summaries: { assistantId: string; name?: string }[];
  try {
    summaries = await getVoiceProvider().listAssistants({
      providerApiKey: await resolveProviderKey(orgId),
    });
  } catch (e) {
    logger.warn("reflectAssistantsFromVapi: listAssistants failed", {
      orgId,
      error: e instanceof Error ? e.message : String(e),
    });
    return { created: 0 };
  }

  let created = 0;
  for (const s of summaries) {
    if (!s.assistantId) continue;
    const exists = await db.assistant.findFirst({
      where: { providerAssistantId: s.assistantId },
      select: { id: true },
    });
    if (exists) continue;
    try {
      await importAssistant(orgId, s.assistantId, s.name);
      created++;
    } catch (e) {
      logger.warn("reflectAssistantsFromVapi: import failed", {
        orgId,
        assistantId: s.assistantId,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
  return { created };
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
        name: input.name ?? undefined,
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

/** Replace this assistant's selected services with `serviceIds` (org-library Service ids). */
export async function setAssistantServices(
  orgId: string,
  assistantId: string,
  serviceIds: string[],
) {
  const db = tenantDb(orgId);
  const assistant = await db.assistant.findFirst({ where: { id: assistantId } });
  if (!assistant) throw AppError.notFound("Assistant not found");

  const valid = await db.service.findMany({
    where: { id: { in: serviceIds } },
    select: { id: true },
  });
  const validIds = new Set(valid.map((s) => s.id));
  for (const id of serviceIds) {
    if (!validIds.has(id)) throw AppError.badRequest(`Unknown service: ${id}`);
  }

  await db.assistantService.deleteMany({ where: { assistantId } });
  if (serviceIds.length > 0) {
    await db.assistantService.createMany({
      data: serviceIds.map((serviceId) => ({ organizationId: orgId, assistantId, serviceId })),
      skipDuplicates: true,
    });
  }
  return getAssistant(orgId, assistantId);
}

/** Replace this assistant's selected staff with `staffIds` (org-library Staff ids). */
export async function setAssistantStaff(
  orgId: string,
  assistantId: string,
  staffIds: string[],
) {
  const db = tenantDb(orgId);
  const assistant = await db.assistant.findFirst({ where: { id: assistantId } });
  if (!assistant) throw AppError.notFound("Assistant not found");

  const valid = await db.staff.findMany({
    where: { id: { in: staffIds } },
    select: { id: true },
  });
  const validIds = new Set(valid.map((s) => s.id));
  for (const id of staffIds) {
    if (!validIds.has(id)) throw AppError.badRequest(`Unknown staff: ${id}`);
  }

  await db.assistantStaff.deleteMany({ where: { assistantId } });
  if (staffIds.length > 0) {
    await db.assistantStaff.createMany({
      data: staffIds.map((staffId) => ({ organizationId: orgId, assistantId, staffId })),
      skipDuplicates: true,
    });
  }
  return getAssistant(orgId, assistantId);
}

/**
 * The assistant's selected service & staff ids for runtime scoping. A `null` dimension means the
 * assistant has NO selection there → "offer all" (no restriction). `assistantId` null (call not
 * attributed to a known assistant) → fully unrestricted.
 */
export async function getAssistantScope(
  orgId: string,
  assistantId: string | null,
): Promise<{ serviceIds: string[] | null; staffIds: string[] | null }> {
  if (!assistantId) return { serviceIds: null, staffIds: null };
  const db = tenantDb(orgId);
  const [services, staff] = await Promise.all([
    db.assistantService.findMany({ where: { assistantId }, select: { serviceId: true } }),
    db.assistantStaff.findMany({ where: { assistantId }, select: { staffId: true } }),
  ]);
  return {
    serviceIds: services.length > 0 ? services.map((s) => s.serviceId) : null,
    staffIds: staff.length > 0 ? staff.map((s) => s.staffId) : null,
  };
}

/** Map a provider assistant id back to our Assistant.id (for the org-only tool webhook). */
export async function resolveAssistantIdByProviderId(
  orgId: string,
  providerAssistantId: string,
): Promise<string | null> {
  const a = await tenantDb(orgId).assistant.findFirst({
    where: { providerAssistantId },
    select: { id: true },
  });
  return a?.id ?? null;
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
        name: assistant.name,
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
        providerPhoneNumberId: result.phoneNumberId ?? null,
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
