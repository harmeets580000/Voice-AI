/**
 * Per-customer voice tools (built-in + custom). Our DB is the source of truth; "sync" reconciles
 * the enabled set into Vapi (create/update enabled, delete disabled) and attaches them to the
 * assistant. Built-ins point at our tool webhook; custom tools call a user-supplied URL.
 *
 * Calls the VoiceProvider PORT only — never the Vapi SDK directly (doc 03 rule 5/7).
 */

import { prisma } from "@server/platform/db/client";
import { env } from "@server/config/env";
import { AppError } from "@server/platform/http/errors";
import { logger } from "@server/platform/logging/logger";
import { decryptSecret } from "@server/platform/crypto/secretBox";
import { getVoiceProvider } from "@server/config/providers";
import { recordSyncLog } from "@server/features/sync/sync-log.service";
import { Prisma } from "@prisma/client";
import { toolCatalog } from "@server/features/receptionist-tools/tools.registry";
import type {
  CreateToolRequest,
  UpdateToolRequest,
  VapiToolDTO,
} from "@contracts/vapi";

/**
 * The full receptionist tool catalog seeded into every org's library, sourced from the tool
 * registry so each carries its description + JSON-schema parameters. The 3 built-ins are enabled
 * by default; the rest are present-but-disabled so each assistant can SELECT them per-assistant.
 */
const CATALOG_TOOLS = toolCatalog();

/**
 * Order-insensitive JSON serialization: sorts object keys recursively (arrays keep their order).
 * Used to compare a stored JSONB value (whose key order Postgres does not preserve) against an
 * in-memory catalog value without false "drift".
 */
function canonicalJson(value: unknown): string {
  const normalize = (v: unknown): unknown => {
    if (v === null || typeof v !== "object") return v;
    if (Array.isArray(v)) return v.map(normalize);
    const obj = v as Record<string, unknown>;
    return Object.keys(obj)
      .sort()
      .reduce<Record<string, unknown>>((acc, k) => {
        acc[k] = normalize(obj[k]);
        return acc;
      }, {});
  };
  return JSON.stringify(normalize(value));
}

function toolsWebhookUrl(orgId: string): string {
  return `${env.PUBLIC_API_BASE_URL}/api/webhook/voice/tools?organization_id=${encodeURIComponent(orgId)}`;
}

async function resolveProviderKey(orgId: string): Promise<string | undefined> {
  const cfg = await prisma.orgVapiConfig.findUnique({
    where: { organizationId: orgId },
    select: { vapiPrivateKeyEnc: true },
  });
  if (cfg?.vapiPrivateKeyEnc) return decryptSecret(cfg.vapiPrivateKeyEnc);
  return undefined;
}

interface ToolRow {
  id: string;
  organizationId: string;
  name: string;
  kind: string;
  enabled: boolean;
  description: string | null;
  parameters: unknown;
  vapiToolId: string | null;
  serverUrl: string | null;
  syncStatus: string;
  syncError: string | null;
}

function toDTO(t: ToolRow): VapiToolDTO {
  return {
    id: t.id,
    name: t.name,
    kind: t.kind === "custom" ? "custom" : "builtin",
    enabled: t.enabled,
    description: t.description ?? null,
    parameters: t.parameters ?? null,
    vapiToolId: t.vapiToolId ?? null,
    serverUrl: t.serverUrl ?? null,
    organizationId: t.organizationId,
    syncStatus: t.syncStatus as VapiToolDTO["syncStatus"],
    syncError: t.syncError ?? null,
  };
}

/**
 * Ensure each given org-library tool id exists in Vapi (create-if-missing), persisting its
 * vapiToolId. Returns the provider tool ids for the selected tools, in input order. Best-effort
 * per tool: a single createTool failure marks that VapiTool syncStatus=failed and is skipped.
 *
 * Shared by the per-assistant tool-save path so selecting a library tool actually creates it in
 * Vapi (the same create logic `reconcileOrganizationTools` uses for the org-level sync).
 */
export async function ensureToolsProvisionedInVapi(
  orgId: string,
  toolIds: string[],
  providerApiKey?: string,
  opts: { refreshExisting?: boolean } = {},
): Promise<string[]> {
  if (toolIds.length === 0) return [];
  const provider = getVoiceProvider();
  const key = providerApiKey ?? (await resolveProviderKey(orgId));
  const rows = await prisma.vapiTool.findMany({
    where: { id: { in: toolIds }, organizationId: orgId },
  });
  const byId = new Map(rows.map((r) => [r.id, r]));

  const out: string[] = [];
  for (const id of toolIds) {
    const t = byId.get(id);
    if (!t) continue;
    const serverUrlFor = () =>
      t.kind === "builtin"
        ? toolsWebhookUrl(orgId)
        : (t.serverUrl ?? toolsWebhookUrl(orgId));
    if (t.vapiToolId) {
      // Exists in Vapi. On a refresh (Re-sync), push the current config — crucially the webhook
      // `server` object (URL + secret) — so an existing tool picks up a newly-set VAPI_WEBHOOK_SECRET.
      if (opts.refreshExisting) {
        try {
          await provider.updateTool({
            toolId: t.vapiToolId,
            organizationId: orgId,
            name: t.name,
            description: t.description ?? undefined,
            parameters: t.parameters ?? undefined,
            serverUrl: serverUrlFor(),
            staticParams: { organization_id: orgId },
            providerApiKey: key,
          });
          await prisma.vapiTool.update({
            where: { id: t.id },
            data: { syncStatus: "synced", lastSyncedAt: new Date(), syncError: null },
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          logger.warn("ensureToolsProvisionedInVapi: updateTool (refresh) failed", {
            orgId,
            tool: t.name,
            error: msg,
          });
          await prisma.vapiTool.update({
            where: { id: t.id },
            data: { syncStatus: "failed", syncError: msg },
          });
        }
      }
      out.push(t.vapiToolId);
      continue;
    }
    const serverUrl = serverUrlFor();
    try {
      const created = await provider.createTool({
        organizationId: orgId,
        name: t.name,
        description: t.description ?? undefined,
        parameters: t.parameters ?? undefined,
        serverUrl,
        staticParams: { organization_id: orgId },
        providerApiKey: key,
      });
      await prisma.vapiTool.update({
        where: { id: t.id },
        data: {
          vapiToolId: created.id,
          serverUrl,
          syncStatus: "synced",
          lastSyncedAt: new Date(),
          syncError: null,
        },
      });
      out.push(created.id);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      logger.warn("ensureToolsProvisionedInVapi: createTool failed", {
        orgId,
        tool: t.name,
        error: msg,
      });
      await prisma.vapiTool.update({
        where: { id: t.id },
        data: { syncStatus: "failed", syncError: msg },
      });
    }
  }
  return out;
}

/** Make sure the org's tool-library rows exist for the full catalog (idempotent). */
export async function ensureBuiltinTools(orgId: string): Promise<void> {
  const existing = await prisma.vapiTool.findMany({
    where: { organizationId: orgId },
    select: { id: true, name: true, kind: true, description: true, parameters: true },
  });
  const byName = new Map(existing.map((t) => [t.name, t]));
  const missing = CATALOG_TOOLS.filter((b) => !byName.has(b.name));
  if (missing.length > 0) {
    await prisma.vapiTool.createMany({
      data: missing.map((b) => ({
        organizationId: orgId,
        name: b.name,
        kind: "builtin",
        enabled: b.builtin, // built-ins on by default; other catalog tools opt-in per assistant
        description: b.description,
        parameters: b.parameters as Prisma.InputJsonValue,
        serverUrl: toolsWebhookUrl(orgId),
        staticParams: { organization_id: orgId },
        syncStatus: "pending",
      })),
      skipDuplicates: true,
    });
  }

  // Self-heal: the code catalog is the source of truth for a built-in's description + parameter
  // schema. `createMany` above only inserts *new* rows, so a row created before its schema existed
  // (e.g. an early `check_availability` with no parameters) would keep syncing an empty schema to
  // the provider forever. Refresh any catalog-backed row that has drifted, and mark it `pending`
  // so the next Re-sync repushes the corrected schema. Custom tools (kind "custom") are untouched.
  for (const b of CATALOG_TOOLS) {
    const row = byName.get(b.name);
    if (!row || row.kind === "custom") continue;
    // Compare order-insensitively: a Postgres JSONB round-trip does NOT preserve object key order,
    // so a plain JSON.stringify would read every already-synced row as "drifted" and re-flip it to
    // `pending` on every listTools() call (which re-runs this heal), undoing a completed sync.
    const paramsDrift = canonicalJson(row.parameters ?? null) !== canonicalJson(b.parameters ?? null);
    const descDrift = (row.description ?? "") !== (b.description ?? "");
    if (!paramsDrift && !descDrift) continue;
    await prisma.vapiTool.update({
      where: { id: row.id },
      data: {
        description: b.description,
        parameters: b.parameters as Prisma.InputJsonValue,
        syncStatus: "pending",
      },
    });
  }
}

export async function listTools(orgId: string): Promise<VapiToolDTO[]> {
  await ensureBuiltinTools(orgId);
  const rows = await prisma.vapiTool.findMany({
    where: { organizationId: orgId },
    orderBy: [{ kind: "asc" }, { name: "asc" }],
  });
  return rows.map((r) => toDTO(r as unknown as ToolRow));
}

export async function createCustomTool(
  orgId: string,
  input: CreateToolRequest,
): Promise<VapiToolDTO> {
  const dup = await prisma.vapiTool.findUnique({
    where: { organizationId_name: { organizationId: orgId, name: input.name } },
  });
  if (dup) throw AppError.conflict("A tool with that name already exists");
  const row = await prisma.vapiTool.create({
    data: {
      organizationId: orgId,
      name: input.name,
      kind: "custom",
      enabled: input.enabled ?? true,
      description: input.description ?? null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      parameters: (input.parameters ?? null) as any,
      serverUrl: input.serverUrl,
      staticParams: { organization_id: orgId },
      syncStatus: "pending",
    },
  });
  return toDTO(row as unknown as ToolRow);
}

export async function updateTool(
  orgId: string,
  toolId: string,
  input: UpdateToolRequest,
): Promise<VapiToolDTO> {
  const row = await prisma.vapiTool.findFirst({
    where: { id: toolId, organizationId: orgId },
  });
  if (!row) throw AppError.notFound("Tool not found");

  const data: Record<string, unknown> = {};
  if (input.description !== undefined) data.description = input.description;
  if (input.parameters !== undefined) data.parameters = input.parameters;
  if (input.enabled !== undefined) data.enabled = input.enabled;
  if (input.serverUrl !== undefined) {
    if (row.kind === "builtin") {
      throw AppError.badRequest("A built-in tool's server URL can't be changed");
    }
    data.serverUrl = input.serverUrl;
  }
  // Any config change means it's out of sync with Vapi until the next "Sync".
  data.syncStatus = "pending";

  const updated = await prisma.vapiTool.update({
    where: { id: toolId },
    data,
  });
  return toDTO(updated as unknown as ToolRow);
}

export async function deleteTool(
  orgId: string,
  toolId: string,
): Promise<{ deleted: true }> {
  const row = await prisma.vapiTool.findFirst({
    where: { id: toolId, organizationId: orgId },
  });
  if (!row) throw AppError.notFound("Tool not found");
  if (row.kind === "builtin") {
    throw AppError.badRequest(
      "Built-in tools can't be deleted — disable it instead",
    );
  }
  if (row.vapiToolId) {
    try {
      await getVoiceProvider().deleteTool({
        toolId: row.vapiToolId,
        providerApiKey: await resolveProviderKey(orgId),
      });
    } catch (e) {
      logger.warn("Failed to delete tool in Vapi (removing locally anyway)", {
        orgId,
        toolId,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
  await prisma.vapiTool.delete({ where: { id: toolId } });
  return { deleted: true };
}

/**
 * Reconcile the org's tools into Vapi: create/update each enabled tool, delete disabled tools that
 * still exist in Vapi, then attach the enabled set to the assistant. Records a SyncLog entry.
 */
export async function reconcileOrganizationTools(
  orgId: string,
  triggeredBy?: string,
): Promise<{ tools: VapiToolDTO[]; syncError: string | null }> {
  const org = await prisma.organization.findUnique({ where: { id: orgId } });
  if (!org) throw AppError.notFound("Organization not found");
  await ensureBuiltinTools(orgId);

  const providerApiKey = await resolveProviderKey(orgId);
  const provider = getVoiceProvider();
  // Per-assistant provider id + config live on the default Assistant now.
  const def = await prisma.assistant.findFirst({
    where: { organizationId: orgId },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
  });
  const tools = await prisma.vapiTool.findMany({
    where: { organizationId: orgId },
    orderBy: [{ kind: "asc" }, { name: "asc" }],
  });

  const startedAt = new Date();
  const details = {
    created: [] as string[],
    updated: [] as string[],
    deleted: [] as string[],
    failed: [] as string[],
  };
  let anyFailed = false;

  for (const t of tools) {
    try {
      if (t.enabled) {
        const serverUrl =
          t.kind === "builtin"
            ? toolsWebhookUrl(orgId)
            : (t.serverUrl ?? toolsWebhookUrl(orgId));
        if (t.vapiToolId) {
          await provider.updateTool({
            toolId: t.vapiToolId,
            organizationId: orgId,
            name: t.name,
            description: t.description ?? undefined,
            parameters: t.parameters ?? undefined,
            serverUrl,
            staticParams: { organization_id: orgId },
            providerApiKey,
          });
          details.updated.push(t.name);
          await prisma.vapiTool.update({
            where: { id: t.id },
            data: {
              serverUrl,
              syncStatus: "synced",
              lastSyncedAt: new Date(),
              syncError: null,
            },
          });
        } else {
          const created = await provider.createTool({
            organizationId: orgId,
            name: t.name,
            description: t.description ?? undefined,
            parameters: t.parameters ?? undefined,
            serverUrl,
            staticParams: { organization_id: orgId },
            providerApiKey,
          });
          details.created.push(t.name);
          await prisma.vapiTool.update({
            where: { id: t.id },
            data: {
              vapiToolId: created.id,
              serverUrl,
              syncStatus: "synced",
              lastSyncedAt: new Date(),
              syncError: null,
            },
          });
        }
      } else if (t.vapiToolId) {
        // Disabled but still present in Vapi → remove it there.
        await provider.deleteTool({ toolId: t.vapiToolId, providerApiKey });
        details.deleted.push(t.name);
        await prisma.vapiTool.update({
          where: { id: t.id },
          data: {
            vapiToolId: null,
            syncStatus: "pending",
            lastSyncedAt: new Date(),
            syncError: null,
          },
        });
      }
    } catch (e) {
      anyFailed = true;
      const msg = e instanceof Error ? e.message : String(e);
      details.failed.push(`${t.name}: ${msg}`);
      await prisma.vapiTool.update({
        where: { id: t.id },
        data: { syncStatus: "failed", syncError: msg },
      });
    }
  }

  // Attach the currently-enabled tools to the default assistant (best-effort).
  let attachError: string | null = null;
  if (def?.providerAssistantId) {
    const enabled = await prisma.vapiTool.findMany({
      where: { organizationId: orgId, enabled: true, vapiToolId: { not: null } },
      select: { vapiToolId: true },
    });
    const enabledIds = enabled
      .map((t) => t.vapiToolId)
      .filter((id): id is string => !!id);
    try {
      await provider.updateAssistant({
        organizationId: orgId,
        assistantId: def.providerAssistantId,
        greeting: def.greeting ?? undefined,
        prompt: def.prompt ?? undefined,
        voice: def.voice ?? undefined,
        llmModel: def.llmModel ?? undefined,
        toolIds: enabledIds,
        providerApiKey,
      });
    } catch (e) {
      attachError = e instanceof Error ? e.message : String(e);
      logger.warn("Failed to attach tools to assistant", {
        orgId,
        error: attachError,
      });
    }
  }

  const changed =
    details.created.length + details.updated.length + details.deleted.length;
  const status = anyFailed
    ? changed > 0
      ? "partial"
      : "failed"
    : "success";
  const syncError = anyFailed ? details.failed.join("; ") : attachError;

  await recordSyncLog({
    organizationId: orgId,
    type: "tools_sync",
    status,
    summary: `Tools sync: ${details.created.length} created, ${details.updated.length} updated, ${details.deleted.length} removed${anyFailed ? `, ${details.failed.length} failed` : ""}`,
    details: { ...details, attachError },
    error: syncError,
    triggeredBy,
    startedAt,
  });

  return { tools: await listTools(orgId), syncError };
}
