/**
 * Sync history: a persistent audit log of every Vapi sync run (provision / resync / tools sync),
 * with full detail. Writing a log must never break the operation it records, so failures here are
 * swallowed (logged only).
 */

import { prisma } from "@server/platform/db/client";
import { logger } from "@server/platform/logging/logger";
import type { SyncLogDTO } from "@contracts/sync";

export type SyncLogType = "provision" | "resync" | "tools_sync";
export type SyncLogStatus = "success" | "partial" | "failed";

export interface RecordSyncLogInput {
  organizationId: string;
  type: SyncLogType;
  status: SyncLogStatus;
  summary?: string | null;
  details?: unknown;
  error?: string | null;
  triggeredBy?: string | null;
  startedAt?: Date;
}

export async function recordSyncLog(input: RecordSyncLogInput): Promise<void> {
  try {
    await prisma.syncLog.create({
      data: {
        organizationId: input.organizationId,
        type: input.type,
        status: input.status,
        summary: input.summary ?? null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        details: (input.details ?? null) as any,
        error: input.error ?? null,
        triggeredBy: input.triggeredBy ?? null,
        startedAt: input.startedAt ?? new Date(),
        finishedAt: new Date(),
      },
    });
  } catch (e) {
    logger.warn("Failed to write sync log", {
      organizationId: input.organizationId,
      error: e instanceof Error ? e.message : String(e),
    });
  }
}

interface SyncLogRow {
  id: string;
  type: string;
  status: string;
  summary: string | null;
  details: unknown;
  error: string | null;
  triggeredBy: string | null;
  startedAt: Date;
  finishedAt: Date | null;
}

function toDTO(r: SyncLogRow): SyncLogDTO {
  return {
    id: r.id,
    type: r.type,
    status: r.status,
    summary: r.summary,
    details: r.details ?? null,
    error: r.error,
    triggeredBy: r.triggeredBy,
    startedAt: r.startedAt.toISOString(),
    finishedAt: r.finishedAt?.toISOString() ?? null,
  };
}

export async function listSyncLogs(
  orgId: string,
  limit = 50,
): Promise<SyncLogDTO[]> {
  const rows = await prisma.syncLog.findMany({
    where: { organizationId: orgId },
    orderBy: { startedAt: "desc" },
    take: limit,
  });
  return rows.map((r) => toDTO(r as unknown as SyncLogRow));
}
