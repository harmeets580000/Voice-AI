/**
 * Calls feature — persists end-of-call records (+ transcript turns), org-scoped. Idempotent
 * on the provider call id: re-delivery of the same call updates rather than duplicates
 * (tests I-VAPI-08/09).
 */

import { tenantDb } from "@server/platform/db/scoped";
import { AppError } from "@server/platform/http/errors";
import { logger } from "@server/platform/logging/logger";
import { findCustomerByPhone } from "@server/features/customers/customers.service";
import type { NormalizedCallRecord } from "@server/ports/voice-provider.port";

/** The scalar Call columns built from a normalized provider record (incl. the full raw payload). */
function buildCallData(record: NormalizedCallRecord, customerId: string | null) {
  return {
    direction: record.direction,
    customerId,
    vapiOrgId: record.providerOrgId ?? null,
    vapiAssistantId: record.assistantId ?? null,
    vapiPhoneNumberId: record.phoneNumberId ?? null,
    phoneCallProvider: record.phoneCallProvider ?? null,
    phoneCallProviderId: record.phoneCallProviderId ?? null,
    fromNumber: record.fromNumber ?? null,
    toNumber: record.toNumber ?? null,
    endedReason: record.endedReason ?? null,
    cost: record.cost ?? null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    costBreakdown: (record.costBreakdown ?? null) as any,
    recordingUrl: record.recordingUrl ?? null,
    summary: record.summary ?? null,
    startedAt: record.startedAt ?? null,
    endedAt: record.endedAt ?? null,
    durationSeconds: record.durationSeconds ?? null,
    // Full raw provider payload so the call detail can show everything Vapi returned.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vapiRaw: (record.raw ?? null) as any,
  };
}

async function resolveCustomerId(
  orgId: string,
  fromNumber?: string,
): Promise<string | null> {
  if (!fromNumber) return null;
  const customer = await findCustomerByPhone(orgId, fromNumber);
  return customer?.id ?? null;
}

export async function saveCallRecord(record: NormalizedCallRecord) {
  if (!record.organizationId) {
    throw AppError.badRequest("Call record is missing organization_id");
  }
  if (!record.providerCallId) {
    throw AppError.badRequest("Call record is missing the provider call id");
  }
  const db = tenantDb(record.organizationId);

  const customerId = await resolveCustomerId(
    record.organizationId,
    record.fromNumber,
  );
  const data = buildCallData(record, customerId);

  const call = await db.call.upsert({
    where: { vapiCallId: record.providerCallId },
    update: data,
    create: {
      organizationId: record.organizationId,
      vapiCallId: record.providerCallId,
      ...data,
    },
  });

  // Replace transcript turns (idempotent re-delivery).
  await db.callMessage.deleteMany({ where: { callId: call.id } });
  if (record.messages.length > 0) {
    await db.callMessage.createMany({
      data: record.messages.map((m) => ({
        callId: call.id,
        role: m.role,
        text: m.text,
        secondsFromStart: m.secondsFromStart ?? null,
        organizationId: record.organizationId,
      })),
    });
  }

  return call;
}

/**
 * Pure helper: of the incoming records, which are NOT already in our DB (by provider call id)?
 * Also de-dupes within the incoming batch. Used by the insert-only backfill sync.
 */
export function diffNewCalls<T extends { providerCallId?: string }>(
  existingIds: Iterable<string>,
  incoming: T[],
): T[] {
  const have = new Set(existingIds);
  const seen = new Set<string>();
  const out: T[] = [];
  for (const c of incoming) {
    if (!c.providerCallId) continue;
    if (have.has(c.providerCallId) || seen.has(c.providerCallId)) continue;
    seen.add(c.providerCallId);
    out.push(c);
  }
  return out;
}

/**
 * Backfill from a provider pull: INSERT ONLY calls we don't already have. Never updates or
 * overwrites existing calls (those are owned by the live call-ended webhook). Returns the count
 * actually inserted.
 */
export async function importNewCalls(
  orgId: string,
  calls: NormalizedCallRecord[],
): Promise<number> {
  const db = tenantDb(orgId);
  const withId = calls.filter((c) => c.providerCallId);
  if (withId.length === 0) return 0;

  const existing = await db.call.findMany({
    where: { vapiCallId: { in: withId.map((c) => c.providerCallId) } },
    select: { vapiCallId: true },
  });
  const toInsert = diffNewCalls(
    existing.map((e) => e.vapiCallId),
    withId,
  );

  let inserted = 0;
  for (const record of toInsert) {
    try {
      const customerId = await resolveCustomerId(orgId, record.fromNumber);
      const call = await db.call.create({
        data: {
          organizationId: orgId,
          vapiCallId: record.providerCallId,
          ...buildCallData(record, customerId),
        },
      });
      if (record.messages.length > 0) {
        await db.callMessage.createMany({
          data: record.messages.map((m) => ({
            callId: call.id,
            role: m.role,
            text: m.text,
            secondsFromStart: m.secondsFromStart ?? null,
            organizationId: orgId,
          })),
        });
      }
      inserted++;
    } catch (e) {
      // A single bad call (e.g. a provider id already owned by another org) is skipped.
      logger.warn("importNewCalls: skipped a call that could not be inserted", {
        orgId,
        vapiCallId: record.providerCallId,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
  return inserted;
}

export async function listCalls(orgId: string) {
  return tenantDb(orgId).call.findMany({
    orderBy: { createdAt: "desc" },
    include: { customer: { select: { name: true, phone: true } } },
  });
}

export async function getCall(orgId: string, callId: string) {
  const call = await tenantDb(orgId).call.findFirst({
    where: { id: callId },
    include: { messages: { orderBy: { secondsFromStart: "asc" } } },
  });
  if (!call) throw AppError.notFound("Call not found");
  return call;
}
