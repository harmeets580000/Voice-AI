/**
 * Campaign launch governor (Product 2 §D, O8) — STUB. Resolves the audience, rejects over-cap,
 * then generates CampaignContact + QUEUED OutboundCall rows in batches. Opted-out contacts are
 * excluded (counted as skipped). Nothing dials. VOICE only.
 */

import { tenantDb } from "@server/platform/db/scoped";
import { AppError } from "@server/platform/http/errors";
import { eventBus } from "@server/platform/events/bus";
import { buildContactWhere, type ContactFilter } from "./contacts.service";
import { getSegment } from "./segments.service";

/** Read env caps at call time so they're configurable (and testable). */
function launchConfig() {
  return {
    max: Number(process.env.LAUNCH_MAX_AUDIENCE ?? 1000),
    batch: Number(process.env.LAUNCH_BATCH_SIZE ?? 200),
  };
}

export interface LaunchResult {
  total: number;
  queued: number;
  skipped: number;
}

/** The audience filter for a campaign: its segment's filter, else its ad-hoc audienceJson. */
export async function campaignFilter(
  orgId: string,
  campaign: { segmentId: string | null; audienceJson: unknown },
): Promise<ContactFilter> {
  if (campaign.segmentId) {
    const seg = await getSegment(orgId, campaign.segmentId);
    return ((seg?.filterJson as ContactFilter) ?? {}) as ContactFilter;
  }
  return (campaign.audienceJson as ContactFilter) ?? {};
}

/** Count the launchable audience (opt-out excluded) — for the review step + over-cap check. */
export async function campaignAudienceCount(
  orgId: string,
  campaign: { segmentId: string | null; audienceJson: unknown },
): Promise<number> {
  const filter = await campaignFilter(orgId, campaign);
  return tenantDb(orgId).outboundContact.count({
    where: buildContactWhere({ ...filter, optOut: false }),
  });
}

export async function launchCampaign(
  orgId: string,
  id: string,
): Promise<LaunchResult> {
  const db = tenantDb(orgId);
  const campaign = await db.campaign.findFirst({ where: { id } });
  if (!campaign) throw AppError.notFound("Campaign not found");
  if (campaign.channel !== "VOICE") {
    throw AppError.badRequest("Only VOICE campaigns can be launched this phase");
  }
  if (!campaign.outboundAgentId) {
    throw AppError.badRequest("Select an Outbound Agent before launching");
  }
  if (
    campaign.status === "RUNNING" ||
    campaign.status === "COMPLETED" ||
    campaign.status === "CANCELLED"
  ) {
    throw AppError.badRequest("Campaign has already been launched or closed");
  }

  const { max: LAUNCH_MAX_AUDIENCE, batch: LAUNCH_BATCH_SIZE } = launchConfig();
  const filter = await campaignFilter(orgId, campaign);
  // Raw audience INCLUDING opted-out so we can report them as skipped.
  const raw = await db.outboundContact.findMany({
    where: buildContactWhere(filter),
    select: { id: true, phone: true, optOut: true },
    orderBy: { createdAt: "asc" },
  });
  const toQueue = raw.filter((c) => !c.optOut);
  const skipped = raw.length - toQueue.length;

  if (toQueue.length > LAUNCH_MAX_AUDIENCE) {
    throw AppError.badRequest(
      `Audience of ${toQueue.length} exceeds the launch cap of ${LAUNCH_MAX_AUDIENCE}. Narrow the segment.`,
    );
  }

  await db.campaign.update({ where: { id }, data: { status: "RUNNING" } });

  // The from-number is the campaign agent's Vapi number (null allowed for the stub).
  const agent = await db.outboundAgent.findFirst({
    where: { id: campaign.outboundAgentId },
  });
  const fromNumber = agent?.providerPhoneNumber ?? null;

  let queued = 0;
  for (let i = 0; i < toQueue.length; i += LAUNCH_BATCH_SIZE) {
    // Stop if the campaign was cancelled/paused between batches.
    const current = await db.campaign.findFirst({
      where: { id },
      select: { status: true },
    });
    if (current?.status !== "RUNNING") break;

    const batch = toQueue.slice(i, i + LAUNCH_BATCH_SIZE);
    for (const contact of batch) {
      const existing = await db.campaignContact.findFirst({
        where: { campaignId: id, contactId: contact.id },
      });
      if (existing) continue;
      const call = await db.outboundCall.create({
        data: {
          organizationId: orgId,
          contactId: contact.id,
          campaignId: id,
          outboundAgentId: campaign.outboundAgentId,
          status: "QUEUED",
          fromNumber,
          toNumber: contact.phone,
        },
      });
      await db.campaignContact.create({
        data: {
          organizationId: orgId,
          campaignId: id,
          contactId: contact.id,
          status: "QUEUED",
          outboundCallId: call.id,
        },
      });
      queued++;
    }
    await db.campaign.update({
      where: { id },
      data: { statsJson: { total: raw.length, queued, skipped } },
    });
  }

  await db.campaign.update({
    where: { id },
    data: {
      status: "COMPLETED",
      statsJson: { total: raw.length, queued, skipped },
    },
  });
  await eventBus.publish("CampaignLaunched", {
    organizationId: orgId,
    campaignId: id,
    queued,
  });

  return { total: raw.length, queued, skipped };
}
