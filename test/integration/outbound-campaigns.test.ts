import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { hasTestDb, truncateAll, disconnect } from "./helpers/db";
import { createOrg } from "./helpers/factories";
import { tenantDb } from "@server/platform/db/scoped";
import { createContact } from "@server/features/outbound/contacts.service";
import { createSegment } from "@server/features/outbound/segments.service";
import { createAgent } from "@server/features/outbound/agents.service";
import { listOutboundCalls } from "@server/features/outbound/outbound-call.service";
import {
  createCampaign,
  getCampaign,
  setCampaignStatus,
} from "@server/features/outbound/campaigns.service";
import { launchCampaign } from "@server/features/outbound/campaign.launch";

/**
 * Voice campaigns + launch governor (Product 2 §D, tests P2-Q5). Launch counts/skip/stats,
 * over-cap rejection, batching, non-VOICE rejection, and cancel keeping stubs.
 */
describe.skipIf(!hasTestDb)("outbound campaigns (P2-Q5)", () => {
  beforeAll(async () => {
    await truncateAll();
  });
  beforeEach(async () => {
    await truncateAll();
  });
  afterAll(async () => {
    await disconnect();
    delete process.env.LAUNCH_MAX_AUDIENCE;
    delete process.env.LAUNCH_BATCH_SIZE;
  });

  async function seedAudience(orgId: string, n: number, optedOut = 0) {
    for (let i = 0; i < n; i++) {
      await createContact(orgId, {
        name: `C${i}`,
        phone: `+1000${i}`,
        tags: ["camp"],
      });
    }
    for (let i = 0; i < optedOut; i++) {
      await createContact(orgId, {
        name: `O${i}`,
        phone: `+2000${i}`,
        tags: ["camp"],
        optOut: true,
      });
    }
    return createSegment(orgId, { name: "camp", filter: { tags: ["camp"] } });
  }

  it("P2-Q5-01: launch queues non-opted-out members; stats reconcile; re-launch blocked", async () => {
    const org = await createOrg();
    const seg = await seedAudience(org.id, 8, 2);
    const agent = await createAgent(org.id, { name: "A" });
    const campaign = await createCampaign(org.id, {
      name: "Spring",
      outboundAgentId: agent!.id,
      segmentId: seg.id,
    });

    const res = await launchCampaign(org.id, campaign.id);
    expect(res.total).toBe(10);
    expect(res.queued).toBe(8);
    expect(res.skipped).toBe(2);

    expect(await listOutboundCalls(org.id, { status: "QUEUED" })).toHaveLength(8);
    const members = await tenantDb(org.id).campaignContact.findMany({
      where: { campaignId: campaign.id },
    });
    expect(members).toHaveLength(8);

    const updated = await getCampaign(org.id, campaign.id);
    expect(updated?.status).toBe("COMPLETED");
    expect(updated?.statsJson).toMatchObject({ queued: 8, skipped: 2, total: 10 });

    await expect(launchCampaign(org.id, campaign.id)).rejects.toThrow();
  });

  it("P2-Q5-02: an over-cap audience is rejected with zero rows", async () => {
    process.env.LAUNCH_MAX_AUDIENCE = "3";
    const org = await createOrg();
    const seg = await seedAudience(org.id, 5);
    const agent = await createAgent(org.id, { name: "A" });
    const campaign = await createCampaign(org.id, {
      name: "Big",
      outboundAgentId: agent!.id,
      segmentId: seg.id,
    });
    await expect(launchCampaign(org.id, campaign.id)).rejects.toThrow(/cap/i);
    expect(
      await tenantDb(org.id).campaignContact.findMany({
        where: { campaignId: campaign.id },
      }),
    ).toHaveLength(0);
    delete process.env.LAUNCH_MAX_AUDIENCE;
  });

  it("P2-Q5-03: generation is batched (small batch size still queues everyone)", async () => {
    process.env.LAUNCH_BATCH_SIZE = "2";
    const org = await createOrg();
    const seg = await seedAudience(org.id, 5);
    const agent = await createAgent(org.id, { name: "A" });
    const campaign = await createCampaign(org.id, {
      name: "Batched",
      outboundAgentId: agent!.id,
      segmentId: seg.id,
    });
    const res = await launchCampaign(org.id, campaign.id);
    expect(res.queued).toBe(5);
    delete process.env.LAUNCH_BATCH_SIZE;
  });

  it("P2-Q5-04: creating a non-VOICE campaign is rejected", async () => {
    const org = await createOrg();
    await expect(
      createCampaign(org.id, { name: "SMS blast", channel: "SMS" }),
    ).rejects.toThrow();
  });

  it("P2-Q5-05: cancel keeps generated stubs", async () => {
    const org = await createOrg();
    const seg = await seedAudience(org.id, 3);
    const agent = await createAgent(org.id, { name: "A" });
    const campaign = await createCampaign(org.id, {
      name: "Cancel me",
      outboundAgentId: agent!.id,
      segmentId: seg.id,
    });
    await launchCampaign(org.id, campaign.id);
    await setCampaignStatus(org.id, campaign.id, "CANCELLED");

    const c = await getCampaign(org.id, campaign.id);
    expect(c?.status).toBe("CANCELLED");
    expect(await listOutboundCalls(org.id, {})).toHaveLength(3);
  });
});
