/**
 * Organizations feature: CRUD + Vapi provisioning + per-customer Vapi settings.
 * Org management is super-admin territory (not org-scoped customer data), so it uses the
 * raw Prisma client. Provisioning calls the VoiceProvider PORT (never the SDK directly)
 * and mirrors every returned Vapi id locally with a syncStatus (doc 03 §1.4.4).
 */

import crypto from "node:crypto";
import { prisma } from "@server/platform/db/client";
import { env } from "@server/config/env";
import { AppError } from "@server/platform/http/errors";
import { logger } from "@server/platform/logging/logger";
import { hashPassword } from "@server/platform/auth/password";
import {
  encryptSecret,
  decryptSecret,
  last4,
} from "@server/platform/crypto/secretBox";
import { getVoiceProvider } from "@server/config/providers";
import { importNewCalls } from "@server/features/calls/calls.service";
import { listTools } from "@server/features/tools/tools.service";
import { recordSyncLog } from "@server/features/sync/sync-log.service";
import { ToolName } from "@domain/enums";
import type {
  CreateOrgRequest,
  OrgDetail,
} from "@contracts/organizations";
import type {
  UpdateVapiSettingsRequest,
  VapiSettings,
} from "@contracts/vapi";

function toolsWebhookUrl(orgId: string): string {
  return `${env.PUBLIC_API_BASE_URL}/api/webhook/voice/tools?organization_id=${encodeURIComponent(orgId)}`;
}
function callEndedWebhookUrl(orgId: string): string {
  return `${env.PUBLIC_API_BASE_URL}/api/webhook/voice/call-ended?organization_id=${encodeURIComponent(orgId)}`;
}

interface OrgRow {
  id: string;
  name: string;
  slug: string;
  status: string;
  timezone: string;
  createdAt: Date;
}

async function toOrgDetail(org: OrgRow): Promise<OrgDetail> {
  const cfg = await prisma.orgVapiConfig.findUnique({
    where: { organizationId: org.id },
    select: { syncStatus: true, vapiPhoneNumber: true },
  });
  return {
    id: org.id,
    name: org.name,
    slug: org.slug,
    status: org.status as OrgDetail["status"],
    timezone: org.timezone,
    syncStatus: (cfg?.syncStatus as OrgDetail["syncStatus"]) ?? null,
    vapiPhoneNumber: cfg?.vapiPhoneNumber ?? null,
    createdAt: org.createdAt.toISOString(),
  };
}

export async function listOrganizations(): Promise<OrgDetail[]> {
  const orgs = await prisma.organization.findMany({ orderBy: { name: "asc" } });
  return Promise.all(orgs.map(toOrgDetail));
}

export async function getOrganization(id: string): Promise<OrgDetail> {
  const org = await prisma.organization.findUnique({ where: { id } });
  if (!org) throw AppError.notFound("Organization not found");
  return toOrgDetail(org);
}

export async function createOrganization(
  input: CreateOrgRequest,
): Promise<{ organization: OrgDetail; tempPassword: string | null }> {
  const existing = await prisma.organization.findUnique({
    where: { slug: input.slug },
  });
  if (existing) throw AppError.conflict("An organization with that slug exists");

  const generated = !input.adminPassword;
  const password = input.adminPassword ?? crypto.randomBytes(9).toString("base64url");
  const passwordHash = await hashPassword(password);

  const org = await prisma.organization.create({
    data: {
      name: input.name,
      slug: input.slug,
      timezone: input.timezone,
      theme: { create: { tokens: {} } },
      vapiConfig: { create: {} },
      users: {
        create: {
          email: input.adminEmail,
          name: input.adminName ?? `${input.name} Admin`,
          passwordHash,
          role: "org_admin",
        },
      },
    },
  });

  return {
    organization: await toOrgDetail(org),
    tempPassword: generated ? password : null,
  };
}

export async function updateOrganization(
  id: string,
  data: { name?: string; timezone?: string; status?: string },
): Promise<OrgDetail> {
  const org = await prisma.organization
    .update({
      where: { id },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: data as any,
    })
    .catch(() => {
      throw AppError.notFound("Organization not found");
    });
  return toOrgDetail(org);
}

/** Resolve the decrypted provider key for an org (per-customer override, else platform). */
async function resolveProviderKey(orgId: string): Promise<string | undefined> {
  const cfg = await prisma.orgVapiConfig.findUnique({
    where: { organizationId: orgId },
    select: { vapiPrivateKeyEnc: true },
  });
  if (cfg?.vapiPrivateKeyEnc) return decryptSecret(cfg.vapiPrivateKeyEnc);
  return undefined; // platform key (from env) is used by the adapter
}

/** Provision (idempotent): create/reuse Vapi resources and mirror every id locally. */
export async function provisionOrganization(
  orgId: string,
  triggeredBy?: string,
): Promise<{ syncStatus: string; syncError: string | null }> {
  const org = await prisma.organization.findUnique({ where: { id: orgId } });
  if (!org) throw AppError.notFound("Organization not found");
  const cfg = await prisma.orgVapiConfig.findUnique({
    where: { organizationId: orgId },
  });
  const tools = await prisma.vapiTool.findMany({
    where: { organizationId: orgId },
  });

  const provider = getVoiceProvider();
  const providerApiKey = await resolveProviderKey(orgId);
  const startedAt = new Date();

  try {
    const result = await provider.provisionOrg({
      organizationId: orgId,
      organizationName: org.name,
      publicApiBaseUrl: env.PUBLIC_API_BASE_URL,
      providerApiKey,
      assistant: {
        greeting: cfg?.greeting ?? undefined,
        prompt: cfg?.prompt ?? undefined,
        voice: cfg?.voice ?? undefined,
        llmModel: cfg?.llmModel ?? undefined,
      },
      existing: {
        assistantId: cfg?.vapiAssistantId ?? undefined,
        phoneNumberId: cfg?.vapiPhoneNumberId ?? undefined,
        phoneNumber: cfg?.vapiPhoneNumber ?? undefined,
        knowledgeBaseId: cfg?.vapiKnowledgeBaseId ?? undefined,
        providerOrgId: cfg?.vapiOrgId ?? undefined,
        toolIds: tools
          .filter((t) => t.vapiToolId)
          .map((t) => ({ name: t.name as ToolName, id: t.vapiToolId! })),
      },
    });

    await prisma.orgVapiConfig.update({
      where: { organizationId: orgId },
      data: {
        vapiAssistantId: result.assistantId,
        vapiPhoneNumberId: result.phoneNumberId,
        vapiPhoneNumber: result.phoneNumber || null,
        vapiKnowledgeBaseId: result.knowledgeBaseId ?? null,
        vapiOrgId: result.providerOrgId ?? null,
        syncStatus: "synced",
        lastSyncedAt: new Date(),
        syncError: null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        vapiRaw: (result.raw ?? null) as any,
      },
    });

    for (const t of result.toolIds) {
      await prisma.vapiTool.upsert({
        where: { organizationId_name: { organizationId: orgId, name: t.name } },
        update: {
          vapiToolId: t.id,
          serverUrl: toolsWebhookUrl(orgId),
          staticParams: { organization_id: orgId },
          syncStatus: "synced",
        },
        create: {
          organizationId: orgId,
          name: t.name,
          vapiToolId: t.id,
          serverUrl: toolsWebhookUrl(orgId),
          staticParams: { organization_id: orgId },
          syncStatus: "synced",
        },
      });
    }

    await recordSyncLog({
      organizationId: orgId,
      type: "provision",
      status: "success",
      summary: `Provisioned assistant, phone number, and ${result.toolIds.length} tools`,
      details: {
        assistantId: result.assistantId,
        phoneNumber: result.phoneNumber,
        phoneNumberId: result.phoneNumberId,
        knowledgeBaseId: result.knowledgeBaseId ?? null,
        toolIds: result.toolIds,
      },
      triggeredBy,
      startedAt,
    });
    return { syncStatus: "synced", syncError: null };
  } catch (e) {
    const syncError = e instanceof Error ? e.message : String(e);
    logger.error("Provisioning failed", { orgId, syncError });
    await prisma.orgVapiConfig.update({
      where: { organizationId: orgId },
      data: { syncStatus: "failed", syncError },
    });
    await recordSyncLog({
      organizationId: orgId,
      type: "provision",
      status: "failed",
      summary: "Provisioning failed",
      error: syncError,
      triggeredBy,
      startedAt,
    });
    return { syncStatus: "failed", syncError };
  }
}

/** Re-read stored ids from the provider and refresh syncStatus (manual reconcile). */
export async function reconcileOrganization(
  orgId: string,
): Promise<{ syncStatus: string }> {
  const cfg = await prisma.orgVapiConfig.findUnique({
    where: { organizationId: orgId },
  });
  if (!cfg) throw AppError.notFound("Org config not found");
  const provider = getVoiceProvider();
  const providerApiKey = await resolveProviderKey(orgId);
  const { status } = await provider.reconcile({
    assistantId: cfg.vapiAssistantId ?? undefined,
    phoneNumberId: cfg.vapiPhoneNumberId ?? undefined,
    providerApiKey,
  });
  await prisma.orgVapiConfig.update({
    where: { organizationId: orgId },
    data: { syncStatus: status, lastSyncedAt: new Date() },
  });
  return { syncStatus: status };
}

/**
 * Pull-sync: read the org's data FROM Vapi and reflect it in the portal — assistant config,
 * phone number, KB, and historical calls. `allowAdopt` (discover existing assistants/numbers)
 * is only enabled when the org has its OWN per-customer key, since the shared platform key
 * lists every org's resources.
 */
export async function syncOrganizationFromVapi(
  orgId: string,
  triggeredBy?: string,
): Promise<{ syncStatus: string; importedCalls: number; syncError: string | null }> {
  const cfg = await prisma.orgVapiConfig.findUnique({
    where: { organizationId: orgId },
  });
  if (!cfg) throw AppError.notFound("Org config not found");

  const provider = getVoiceProvider();
  const providerApiKey = await resolveProviderKey(orgId);
  const startedAt = new Date();

  try {
    const snap = await provider.pullOrgData({
      organizationId: orgId,
      assistantId: cfg.vapiAssistantId ?? undefined,
      phoneNumberId: cfg.vapiPhoneNumberId ?? undefined,
      providerApiKey,
      allowAdopt: !!cfg.vapiPrivateKeyEnc,
    });

    // Mirror identifiers always, but PROTECT locally-edited assistant config: only adopt a
    // Vapi value when our local field is still empty (first-time adoption). Never overwrite
    // greeting/prompt/voice/llmModel the customer has set in the portal.
    const adopted: string[] = [];
    const data: Record<string, unknown> = {
      syncStatus: "synced",
      lastSyncedAt: new Date(),
      syncError: null,
    };
    if (snap.assistant) {
      data.vapiAssistantId = snap.assistant.assistantId;
      if (!cfg.greeting && snap.assistant.greeting != null) {
        data.greeting = snap.assistant.greeting;
        adopted.push("greeting");
      }
      if (!cfg.prompt && snap.assistant.prompt != null) {
        data.prompt = snap.assistant.prompt;
        adopted.push("prompt");
      }
      if (!cfg.voice && snap.assistant.voice != null) {
        data.voice = snap.assistant.voice;
        adopted.push("voice");
      }
      if (!cfg.llmModel && snap.assistant.llmModel != null) {
        data.llmModel = snap.assistant.llmModel;
        adopted.push("llmModel");
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data.vapiRaw = (snap.assistant.raw ?? null) as any;
    }
    if (snap.phoneNumber) {
      data.vapiPhoneNumberId = snap.phoneNumber.id;
      if (snap.phoneNumber.number) data.vapiPhoneNumber = snap.phoneNumber.number;
    }
    if (snap.knowledgeBaseId) data.vapiKnowledgeBaseId = snap.knowledgeBaseId;
    if (snap.providerOrgId) data.vapiOrgId = snap.providerOrgId;

    let phoneSkipped = false;
    try {
      await prisma.orgVapiConfig.update({
        where: { organizationId: orgId },
        data,
      });
    } catch (e) {
      // vapiPhoneNumber is @unique — if the pulled number is already linked to another
      // org, skip the phone fields and keep the rest of the sync rather than failing.
      if ((e as { code?: string }).code === "P2002") {
        logger.warn("Sync: phone number already in use by another org; skipping it", {
          orgId,
        });
        phoneSkipped = true;
        delete data.vapiPhoneNumber;
        delete data.vapiPhoneNumberId;
        await prisma.orgVapiConfig.update({
          where: { organizationId: orgId },
          data,
        });
      } else {
        throw e;
      }
    }

    // Backfill: INSERT ONLY calls we don't already have (never overwrite existing calls).
    const importedCalls = await importNewCalls(orgId, snap.calls);

    await recordSyncLog({
      organizationId: orgId,
      type: "resync",
      status: phoneSkipped ? "partial" : "success",
      summary: `Imported ${importedCalls} new call${importedCalls === 1 ? "" : "s"}${adopted.length ? `; adopted ${adopted.join(", ")}` : ""}${phoneSkipped ? "; phone number skipped (in use)" : ""}`,
      details: {
        importedCalls,
        callsSeen: snap.calls.length,
        adoptedConfigFields: adopted,
        phoneSkipped,
      },
      triggeredBy,
      startedAt,
    });

    return { syncStatus: "synced", importedCalls, syncError: null };
  } catch (e) {
    const syncError = e instanceof Error ? e.message : String(e);
    logger.error("Sync from Vapi failed", { orgId, syncError });
    await prisma.orgVapiConfig.update({
      where: { organizationId: orgId },
      data: { syncStatus: "failed", syncError },
    });
    await recordSyncLog({
      organizationId: orgId,
      type: "resync",
      status: "failed",
      summary: "Sync from Vapi failed",
      error: syncError,
      triggeredBy,
      startedAt,
    });
    return { syncStatus: "failed", importedCalls: 0, syncError };
  }
}

export async function getVapiSettings(orgId: string): Promise<VapiSettings> {
  const cfg = await prisma.orgVapiConfig.findUnique({
    where: { organizationId: orgId },
  });
  if (!cfg) throw AppError.notFound("Org config not found");
  const tools = await listTools(orgId);
  return {
    greeting: cfg.greeting,
    prompt: cfg.prompt,
    voice: cfg.voice,
    llmModel: cfg.llmModel,
    vapiAssistantId: cfg.vapiAssistantId,
    vapiPhoneNumberId: cfg.vapiPhoneNumberId,
    vapiPhoneNumber: cfg.vapiPhoneNumber,
    vapiKnowledgeBaseId: cfg.vapiKnowledgeBaseId,
    vapiOrgId: cfg.vapiOrgId,
    syncStatus: cfg.syncStatus as VapiSettings["syncStatus"],
    lastSyncedAt: cfg.lastSyncedAt?.toISOString() ?? null,
    syncError: cfg.syncError,
    hasCustomKey: !!cfg.vapiPrivateKeyEnc,
    keyLast4: cfg.vapiKeyLast4,
    toolsWebhookUrl: toolsWebhookUrl(orgId),
    callEndedWebhookUrl: callEndedWebhookUrl(orgId),
    tools,
  };
}

export async function updateVapiSettings(
  orgId: string,
  input: UpdateVapiSettingsRequest,
): Promise<VapiSettings> {
  const cfg = await prisma.orgVapiConfig.findUnique({
    where: { organizationId: orgId },
  });
  if (!cfg) throw AppError.notFound("Org config not found");

  // Handle the per-customer key: validate before storing; never echo plaintext.
  const data: Record<string, unknown> = {};
  if (input.greeting !== undefined) data.greeting = input.greeting;
  if (input.prompt !== undefined) data.prompt = input.prompt;
  if (input.voice !== undefined) data.voice = input.voice;
  if (input.llmModel !== undefined) data.llmModel = input.llmModel;

  if (input.privateKey !== undefined) {
    if (input.privateKey === "") {
      data.vapiPrivateKeyEnc = null;
      data.vapiKeyLast4 = null;
    } else {
      // Store the key as-is (encrypted). Validation is the explicit "Test key" button's
      // job — it must NOT block saving the settings (a save shouldn't depend on a live
      // Vapi round-trip succeeding).
      data.vapiPrivateKeyEnc = encryptSecret(input.privateKey);
      data.vapiKeyLast4 = last4(input.privateKey);
    }
  }

  await prisma.orgVapiConfig.update({
    where: { organizationId: orgId },
    data,
  });

  // Push assistant config changes to the provider if it's already provisioned.
  if (cfg.vapiAssistantId) {
    try {
      const providerApiKey = await resolveProviderKey(orgId);
      await getVoiceProvider().updateAssistant({
        organizationId: orgId,
        assistantId: cfg.vapiAssistantId,
        greeting: input.greeting,
        prompt: input.prompt,
        voice: input.voice,
        llmModel: input.llmModel,
        providerApiKey,
      });
      await prisma.orgVapiConfig.update({
        where: { organizationId: orgId },
        data: { syncStatus: "synced", lastSyncedAt: new Date(), syncError: null },
      });
    } catch (e) {
      await prisma.orgVapiConfig.update({
        where: { organizationId: orgId },
        data: {
          syncStatus: "failed",
          syncError: e instanceof Error ? e.message : String(e),
        },
      });
    }
  }

  return getVapiSettings(orgId);
}

export async function testVapiKey(
  apiKey: string,
): Promise<{ valid: boolean; reason?: string }> {
  return getVoiceProvider().validateApiKey(apiKey);
}
