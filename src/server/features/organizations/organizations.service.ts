/**
 * Organizations feature: CRUD + Vapi provisioning + per-customer Vapi settings.
 * Org management is super-admin territory (not org-scoped customer data), so it uses the
 * raw Prisma client. Provisioning calls the VoiceProvider PORT (never the SDK directly)
 * and mirrors every returned Vapi id locally with a syncStatus (doc 03 §1.4.4).
 */

import crypto from "node:crypto";
import { Prisma } from "@prisma/client";
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
import type { ProviderToolSnapshot } from "@server/ports/voice-provider.port";
import { importNewCalls } from "@server/features/calls/calls.service";
import { listTools } from "@server/features/tools/tools.service";
import { reflectAssistantsFromVapi } from "@server/features/assistants/assistants.service";
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

/**
 * The org's default/first assistant (read-only; null if the org has none yet). Per-assistant Vapi
 * data — assistant/phone/KB ids + greeting/prompt/voice/llmModel — lives on `Assistant`, not on the
 * org-level `OrgVapiConfig`. The legacy org-level flows below resolve the default assistant here.
 */
async function getDefaultAssistant(orgId: string) {
  return prisma.assistant.findFirst({
    where: { organizationId: orgId },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
  });
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
    select: { syncStatus: true },
  });
  const def = await getDefaultAssistant(org.id);
  return {
    id: org.id,
    name: org.name,
    slug: org.slug,
    status: org.status as OrgDetail["status"],
    timezone: org.timezone,
    syncStatus: (cfg?.syncStatus as OrgDetail["syncStatus"]) ?? null,
    vapiPhoneNumber: def?.providerPhoneNumber ?? null,
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
  if (cfg?.vapiPrivateKeyEnc) {
    try {
      return decryptSecret(cfg.vapiPrivateKeyEnc);
    } catch (e) {
      // A corrupt/wrong-key credential must not 500 the caller — fall back to the platform key and
      // let the provider call surface a graceful sync/provision failure instead.
      logger.warn("resolveProviderKey: stored key could not be decrypted", {
        orgId,
        error: e instanceof Error ? e.message : String(e),
      });
      return undefined;
    }
  }
  return undefined; // platform key (from env) is used by the adapter
}

/**
 * Mirror the org's provisioned/synced config into the canonical `Assistant` table (multi-assistant)
 * and link the org's synced tools to that assistant. `Assistant` is the source of truth for
 * per-assistant config + provider ids, so both the provision and the "Sync from Vapi" flows write
 * here and the assistant surfaces on the /assistants page. Returns `phoneSkipped: true` when the
 * pulled phone number was already linked to another assistant/org (unique constraint) and was
 * therefore dropped while keeping the rest of the mirror.
 */
async function mirrorDefaultAssistant(
  orgId: string,
  orgName: string,
  cfg: {
    provider?: string;
    greeting?: string | null;
    prompt?: string | null;
    voice?: string | null;
    llmModel?: string | null;
  } | null,
  result: {
    assistantId: string;
    phoneNumber?: string | null;
    phoneNumberId?: string | null;
    knowledgeBaseId?: string | null;
  },
): Promise<{ id: string; phoneSkipped: boolean }> {
  const existing = await prisma.assistant.findFirst({
    where: { organizationId: orgId },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
  });
  const data = {
    provider: cfg?.provider ?? "vapi",
    providerAssistantId: result.assistantId,
    providerPhoneNumberId: result.phoneNumberId ?? null,
    providerPhoneNumber: result.phoneNumber || null,
    providerKnowledgeBaseId: result.knowledgeBaseId ?? null,
    greeting: cfg?.greeting ?? null,
    prompt: cfg?.prompt ?? null,
    voice: cfg?.voice ?? null,
    llmModel: cfg?.llmModel ?? null,
    syncStatus: "synced" as const,
    lastSyncedAt: new Date(),
    syncError: null,
  };
  const write = (d: typeof data) =>
    existing
      ? prisma.assistant.update({ where: { id: existing.id }, data: d })
      : prisma.assistant.create({
          data: { organizationId: orgId, name: orgName, isDefault: true, ...d },
        });

  let phoneSkipped = false;
  let assistant;
  try {
    assistant = await write(data);
  } catch (e) {
    // providerPhoneNumber / providerPhoneNumberId are @unique — if the pulled number is already
    // linked to another assistant/org, drop the phone fields and keep the rest of the mirror.
    if ((e as { code?: string }).code === "P2002") {
      phoneSkipped = true;
      assistant = await write({
        ...data,
        providerPhoneNumber: null,
        providerPhoneNumberId: null,
      });
    } else {
      throw e;
    }
  }

  // Link the org's synced tools (those mirrored to a provider id) to this assistant.
  const orgToolRows = await prisma.vapiTool.findMany({
    where: { organizationId: orgId, vapiToolId: { not: null } },
    select: { id: true },
  });
  for (const tr of orgToolRows) {
    await prisma.assistantTool.upsert({
      where: { assistantId_toolId: { assistantId: assistant.id, toolId: tr.id } },
      update: {},
      create: { organizationId: orgId, assistantId: assistant.id, toolId: tr.id },
    });
  }
  return { id: assistant.id, phoneSkipped };
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
  // Per-assistant config + existing provider ids live on the default Assistant now.
  const def = await getDefaultAssistant(orgId);

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
        name: def?.name ?? org.name,
        greeting: def?.greeting ?? undefined,
        prompt: def?.prompt ?? undefined,
        voice: def?.voice ?? undefined,
        llmModel: def?.llmModel ?? undefined,
      },
      existing: {
        assistantId: def?.providerAssistantId ?? undefined,
        phoneNumberId: def?.providerPhoneNumberId ?? undefined,
        phoneNumber: def?.providerPhoneNumber ?? undefined,
        knowledgeBaseId: def?.providerKnowledgeBaseId ?? undefined,
        providerOrgId: cfg?.vapiOrgId ?? undefined,
        toolIds: tools
          .filter((t) => t.vapiToolId)
          .map((t) => ({ name: t.name as ToolName, id: t.vapiToolId! })),
      },
    });

    // OrgVapiConfig only tracks the org-level connection now (the Vapi org id + sync status).
    await prisma.orgVapiConfig.update({
      where: { organizationId: orgId },
      data: {
        vapiOrgId: result.providerOrgId ?? null,
        syncStatus: "synced",
        lastSyncedAt: new Date(),
        syncError: null,
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

    // Mirror into the canonical Assistant table + link the org's synced tools to it.
    await mirrorDefaultAssistant(
      orgId,
      org.name,
      def
        ? {
            provider: def.provider,
            greeting: def.greeting,
            prompt: def.prompt,
            voice: def.voice,
            llmModel: def.llmModel,
          }
        : null,
      result,
    );

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
  const def = await getDefaultAssistant(orgId);
  const provider = getVoiceProvider();
  const providerApiKey = await resolveProviderKey(orgId);
  const { status } = await provider.reconcile({
    assistantId: def?.providerAssistantId ?? undefined,
    phoneNumberId: def?.providerPhoneNumberId ?? undefined,
    providerApiKey,
  });
  if (def) {
    await prisma.assistant.update({
      where: { id: def.id },
      data: { syncStatus: status, lastSyncedAt: new Date() },
    });
  }
  await prisma.orgVapiConfig.update({
    where: { organizationId: orgId },
    data: { syncStatus: status, lastSyncedAt: new Date() },
  });
  return { syncStatus: status };
}

const BUILTIN_TOOL_NAMES = new Set<string>([
  ToolName.CHECK_AVAILABILITY,
  ToolName.BOOK_APPOINTMENT,
  ToolName.LOOKUP_CUSTOMER,
]);

/**
 * Reflect the assistant's Vapi tools into our tool rows (Vapi is the source of truth). Upserts each
 * Vapi tool by (org, name); marks previously-synced rows no longer present in Vapi as disabled/stale
 * (never deletes); leaves portal-created-but-unpushed rows (no vapiToolId) untouched. Returns counts.
 */
async function reflectTools(
  orgId: string,
  snapTools: ProviderToolSnapshot[],
): Promise<{ created: number; updated: number; removed: number }> {
  const existing = await prisma.vapiTool.findMany({
    where: { organizationId: orgId },
  });
  const byName = new Map(existing.map((t) => [t.name, t]));
  const vapiIds = new Set(snapTools.map((t) => t.id));
  let created = 0;
  let updated = 0;
  let removed = 0;

  for (const t of snapTools) {
    if (!t.name) continue;
    const kind = BUILTIN_TOOL_NAMES.has(t.name) ? "builtin" : "custom";
    const params =
      t.parameters != null
        ? { parameters: t.parameters as Prisma.InputJsonValue }
        : {};
    const prior = byName.get(t.name);
    await prisma.vapiTool.upsert({
      where: { organizationId_name: { organizationId: orgId, name: t.name } },
      update: {
        vapiToolId: t.id,
        enabled: true,
        kind,
        description: t.description ?? null,
        serverUrl: t.serverUrl ?? null,
        syncStatus: "synced",
        lastSyncedAt: new Date(),
        syncError: null,
        ...params,
      },
      create: {
        organizationId: orgId,
        name: t.name,
        kind,
        enabled: true,
        description: t.description ?? null,
        serverUrl: t.serverUrl ?? null,
        staticParams: { organization_id: orgId },
        vapiToolId: t.id,
        syncStatus: "synced",
        lastSyncedAt: new Date(),
        ...params,
      },
    });
    if (!prior) {
      created++;
    } else {
      const changedTool =
        (prior.vapiToolId ?? null) !== t.id ||
        prior.enabled !== true ||
        prior.kind !== kind ||
        prior.syncStatus !== "synced" ||
        (prior.description ?? null) !== (t.description ?? null) ||
        (prior.serverUrl ?? null) !== (t.serverUrl ?? null);
      if (changedTool) updated++;
    }
  }

  // Tools we'd synced before that Vapi no longer has → disable + mark stale (keep the row).
  for (const t of existing) {
    if (t.vapiToolId && !vapiIds.has(t.vapiToolId)) {
      await prisma.vapiTool.update({
        where: { id: t.id },
        data: { enabled: false, vapiToolId: null, syncStatus: "stale" },
      });
      removed++;
    }
  }

  return { created, updated, removed };
}

/**
 * Pull-sync: read the org's data FROM Vapi and FULLY REFLECT it into the portal — assistant config
 * (OVERWRITTEN; Vapi is the source of truth), phone number, KB, tools, and new calls (insert-only).
 * Every run is recorded in sync history; `auto` marks poller-driven runs. `allowAdopt` (discover an
 * existing assistant/number when we have no stored id) is enabled only when the org has its own key.
 */
export async function syncOrganizationFromVapi(
  orgId: string,
  opts: { triggeredBy?: string; auto?: boolean } = {},
): Promise<{ syncStatus: string; importedCalls: number; syncError: string | null }> {
  const { triggeredBy, auto = false } = opts;
  const prefix = auto ? "Auto-sync" : "Sync";
  const cfg = await prisma.orgVapiConfig.findUnique({
    where: { organizationId: orgId },
  });
  if (!cfg) throw AppError.notFound("Org config not found");
  const org = await prisma.organization.findUnique({ where: { id: orgId } });

  const provider = getVoiceProvider();
  const providerApiKey = await resolveProviderKey(orgId);
  const startedAt = new Date();

  try {
    const def = await getDefaultAssistant(orgId);
    const snap = await provider.pullOrgData({
      organizationId: orgId,
      assistantId: def?.providerAssistantId ?? undefined,
      phoneNumberId: def?.providerPhoneNumberId ?? undefined,
      providerApiKey,
      allowAdopt: !!cfg.vapiPrivateKeyEnc,
    });

    // FULL REFLECT: Vapi is the source of truth. Per-assistant config (greeting/prompt/voice/
    // llmModel + provider ids) is written to the Assistant table via mirrorDefaultAssistant below;
    // OrgVapiConfig only tracks the org-level connection (Vapi org id + sync status).
    const changedFields: string[] = [];
    if (snap.assistant) {
      const cmp = (
        key: "greeting" | "prompt" | "voice" | "llmModel",
        next: string | null | undefined,
      ) => {
        const prior = (def?.[key] as string | null | undefined) ?? null;
        if (prior !== (next ?? null)) changedFields.push(key);
      };
      cmp("greeting", snap.assistant.greeting);
      cmp("prompt", snap.assistant.prompt);
      cmp("voice", snap.assistant.voice);
      cmp("llmModel", snap.assistant.llmModel);
    }

    const orgData: Record<string, unknown> = {
      syncStatus: "synced",
      lastSyncedAt: new Date(),
      syncError: null,
    };
    if (snap.providerOrgId) orgData.vapiOrgId = snap.providerOrgId;
    await prisma.orgVapiConfig.update({
      where: { organizationId: orgId },
      data: orgData,
    });

    // Backfill: INSERT ONLY calls we don't already have (never overwrite existing calls).
    const importedCalls = await importNewCalls(orgId, snap.calls);
    // Reflect the assistant's tools from Vapi.
    const toolChanges = await reflectTools(orgId, snap.tools ?? []);

    // Mirror the synced assistant into the canonical Assistant table (source of truth for
    // per-assistant config + provider ids) so it surfaces on /assistants.
    let phoneSkipped = false;
    if (snap.assistant) {
      const mirror = await mirrorDefaultAssistant(
        orgId,
        org?.name ?? "Assistant",
        {
          provider: "vapi",
          greeting: snap.assistant.greeting ?? null,
          prompt: snap.assistant.prompt ?? null,
          voice: snap.assistant.voice ?? null,
          llmModel: snap.assistant.llmModel ?? null,
        },
        {
          assistantId: snap.assistant.assistantId,
          phoneNumber: snap.phoneNumber?.number ?? null,
          phoneNumberId: snap.phoneNumber?.id ?? null,
          knowledgeBaseId: snap.knowledgeBaseId ?? null,
        },
      );
      phoneSkipped = mirror.phoneSkipped;
    }

    // Reflect EVERY account assistant into the portal so they all appear on /assistants (the single
    // mirror above only covers the org's primary/default assistant). Best-effort — never aborts sync.
    let assistantsCreated = 0;
    try {
      assistantsCreated = (await reflectAssistantsFromVapi(orgId)).created;
    } catch (e) {
      logger.warn("Sync: reflect-all assistants failed", {
        orgId,
        error: e instanceof Error ? e.message : String(e),
      });
    }

    const configChanged = changedFields.length > 0;
    const toolsChanged =
      toolChanges.created + toolChanges.updated + toolChanges.removed > 0;
    const changed =
      importedCalls > 0 || configChanged || toolsChanged || assistantsCreated > 0;

    const parts: string[] = [
      `imported ${importedCalls} call${importedCalls === 1 ? "" : "s"}`,
    ];
    if (configChanged) parts.push(`config updated (${changedFields.join(", ")})`);
    if (toolsChanged) {
      parts.push(
        `tools +${toolChanges.created}/~${toolChanges.updated}/-${toolChanges.removed}`,
      );
    }
    if (assistantsCreated > 0) parts.push(`assistants +${assistantsCreated}`);
    if (phoneSkipped) parts.push("phone skipped (in use)");
    const summary = changed
      ? `${prefix} — ${parts.join("; ")}`
      : `${prefix} — no changes`;

    // Always log every run (manual and every poller cycle) so all syncs are visible in history.
    await recordSyncLog({
      organizationId: orgId,
      type: "resync",
      status: phoneSkipped ? "partial" : "success",
      summary,
      details: {
        importedCalls,
        callsSeen: snap.calls.length,
        configChanged,
        changedFields,
        tools: toolChanges,
        assistantsCreated,
        phoneSkipped,
        changed,
        auto,
      },
      triggeredBy: triggeredBy ?? null,
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
      summary: `${prefix} failed`,
      error: syncError,
      details: { auto },
      triggeredBy: triggeredBy ?? null,
      startedAt,
    });
    return { syncStatus: "failed", importedCalls: 0, syncError };
  }
}

/**
 * Reset everything Vapi-derived for an org back to a clean slate, KEEPING the saved API key.
 * Clears the org-level connection status + each assistant's provider mirror ids (assistants keep
 * their name/config), deletes imported calls and sync history, and clears each tool's Vapi mirror
 * id. Used to wipe stale/fake data (e.g. left over from fake mode).
 */
export async function resetOrgVapiData(orgId: string): Promise<VapiSettings> {
  const cfg = await prisma.orgVapiConfig.findUnique({
    where: { organizationId: orgId },
  });
  if (!cfg) throw AppError.notFound("Org config not found");

  // Org-level connection status (keep vapiPrivateKeyEnc / vapiKeyLast4 / vapiPublicKey).
  await prisma.orgVapiConfig.update({
    where: { organizationId: orgId },
    data: {
      vapiOrgId: null,
      lastSyncedAt: null,
      syncError: null,
      syncStatus: "pending",
    },
  });

  // Disconnect each assistant from Vapi (clear provider mirror ids) but keep its name + config.
  await prisma.assistant.updateMany({
    where: { organizationId: orgId },
    data: {
      providerAssistantId: null,
      providerPhoneNumberId: null,
      providerPhoneNumber: null,
      providerKnowledgeBaseId: null,
      providerRaw: Prisma.DbNull,
      lastSyncedAt: null,
      syncError: null,
      syncStatus: "pending",
    },
  });

  // Imported calls (+ transcript turns cascade) and sync history.
  await prisma.call.deleteMany({ where: { organizationId: orgId } });
  await prisma.syncLog.deleteMany({ where: { organizationId: orgId } });

  // Keep tool definitions, clear their (stale) Vapi mirror ids so they re-create on next sync.
  await prisma.vapiTool.updateMany({
    where: { organizationId: orgId },
    data: {
      vapiToolId: null,
      syncStatus: "pending",
      lastSyncedAt: null,
      syncError: null,
    },
  });

  return getVapiSettings(orgId);
}

export async function getVapiSettings(orgId: string): Promise<VapiSettings> {
  const cfg = await prisma.orgVapiConfig.findUnique({
    where: { organizationId: orgId },
  });
  if (!cfg) throw AppError.notFound("Org config not found");
  const tools = await listTools(orgId);
  // The Status tab's mirror ids reflect the org's default assistant (canonical per-assistant store).
  const def = await getDefaultAssistant(orgId);
  return {
    vapiAssistantId: def?.providerAssistantId ?? null,
    vapiPhoneNumberId: def?.providerPhoneNumberId ?? null,
    vapiPhoneNumber: def?.providerPhoneNumber ?? null,
    vapiKnowledgeBaseId: def?.providerKnowledgeBaseId ?? null,
    vapiOrgId: cfg.vapiOrgId,
    syncStatus: cfg.syncStatus as VapiSettings["syncStatus"],
    lastSyncedAt: cfg.lastSyncedAt?.toISOString() ?? null,
    syncError: cfg.syncError,
    hasCustomKey: !!cfg.vapiPrivateKeyEnc,
    keyLast4: cfg.vapiKeyLast4,
    vapiPublicKey: cfg.vapiPublicKey,
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

  // OrgVapiConfig is the org-level connection only: the key + the browser public key. Per-assistant
  // config (greeting/prompt/voice/llmModel) is edited on the Assistants page (assistants.service).
  const data: Record<string, unknown> = {};
  if (input.vapiPublicKey !== undefined) {
    data.vapiPublicKey = input.vapiPublicKey || null;
  }

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

  return getVapiSettings(orgId);
}

export async function testVapiKey(
  apiKey: string,
): Promise<{ valid: boolean; reason?: string }> {
  return getVoiceProvider().validateApiKey(apiKey);
}

/**
 * Background poller target: FULLY REFLECT Vapi into the portal for every org that has its own key +
 * a provisioned default assistant (config + tools + new calls). Per-org failures are logged and
 * skipped; every run is recorded in sync history (via syncOrganizationFromVapi).
 */
export async function reflectAllOrgsFromVapi(): Promise<
  { orgId: string; imported: number }[]
> {
  // Every org with its own Vapi key — including ones with NO assistants yet, so the poller
  // bootstraps them: sync discovers + reflects their account assistants on the first cycle.
  const cfgs = await prisma.orgVapiConfig.findMany({
    where: { vapiPrivateKeyEnc: { not: null } },
    select: { organizationId: true },
  });
  const results: { orgId: string; imported: number }[] = [];
  for (const c of cfgs) {
    try {
      const r = await syncOrganizationFromVapi(c.organizationId, { auto: true });
      results.push({ orgId: c.organizationId, imported: r.importedCalls });
    } catch (e) {
      logger.warn("Auto-sync: org reflect failed", {
        orgId: c.organizationId,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
  return results;
}
