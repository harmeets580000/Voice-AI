import { z } from "zod";

/**
 * Sync history contract. Every Vapi sync run (provision / resync / tools sync) is recorded with
 * full detail so the portal can show a complete audit history per organization.
 */

export const SyncLogDTO = z.object({
  id: z.string(),
  type: z.string(), // "provision" | "resync" | "tools_sync"
  status: z.string(), // "success" | "partial" | "failed"
  summary: z.string().nullable(),
  details: z.unknown().nullable(),
  error: z.string().nullable(),
  triggeredBy: z.string().nullable(),
  startedAt: z.string(),
  finishedAt: z.string().nullable(),
});
export type SyncLogDTO = z.infer<typeof SyncLogDTO>;

export const SyncLogListResponse = z.object({ logs: z.array(SyncLogDTO) });
export type SyncLogListResponse = z.infer<typeof SyncLogListResponse>;
