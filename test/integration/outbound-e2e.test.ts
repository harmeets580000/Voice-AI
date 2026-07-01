import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { hasTestDb, truncateAll, disconnect } from "./helpers/db";
import { createOrg } from "./helpers/factories";
import { ProductKey, OrgProductStatus } from "@domain/enums";
import {
  setProduct,
  assertProductEnabled,
} from "@server/platform/registry/registry.service";
import {
  importContacts,
  listContacts,
} from "@server/features/outbound/contacts.service";
import { createSegment } from "@server/features/outbound/segments.service";
import {
  bulkPromoteToLeads,
  listLeads,
} from "@server/features/outbound/leads.service";
import { createAgent } from "@server/features/outbound/agents.service";
import { createCampaign } from "@server/features/outbound/campaigns.service";
import { launchCampaign } from "@server/features/outbound/campaign.launch";
import { placeOneOffCall } from "@server/features/outbound/outbound-call.service";
import { convertLeadToMeeting } from "@server/features/outbound/meeting.engine";
import { getSalesDashboard } from "@server/features/outbound/sales-analytics.service";

/**
 * Product 2 polish/QA (tests P2-Q8): the product-enablement gate, and the full end-to-end loop
 * (enable → import → segment → promote → campaign launch → call → meeting → dashboard reconciles).
 */
describe.skipIf(!hasTestDb)("outbound end-to-end (P2-Q8)", () => {
  beforeAll(async () => {
    await truncateAll();
  });
  beforeEach(async () => {
    await truncateAll();
  });
  afterAll(async () => {
    await disconnect();
  });

  it("P2-Q8-01: the product-enablement gate blocks until enabled", async () => {
    const org = await createOrg();
    await expect(
      assertProductEnabled(org.id, ProductKey.OUTBOUND_SALES),
    ).rejects.toThrow();
    await setProduct(
      org.id,
      ProductKey.OUTBOUND_SALES,
      OrgProductStatus.ACTIVE,
    );
    await expect(
      assertProductEnabled(org.id, ProductKey.OUTBOUND_SALES),
    ).resolves.toBeUndefined();
  });

  it("P2-Q8-02: full loop — import → promote → campaign → call → meeting → dashboard", async () => {
    const org = await createOrg();
    await setProduct(
      org.id,
      ProductKey.OUTBOUND_SALES,
      OrgProductStatus.ACTIVE,
    );

    await importContacts(org.id, {
      filename: "c.csv",
      rows: [
        { name: "A", phone: "+1" },
        { name: "B", phone: "+2" },
        { name: "C", phone: "+3" },
      ],
    });
    const seg = await createSegment(org.id, { name: "all", filter: {} });

    const contacts = await listContacts(org.id);
    const promote = await bulkPromoteToLeads(
      org.id,
      contacts.map((c) => c.id),
    );
    expect(promote.promoted).toBe(3);

    const agent = await createAgent(org.id, {
      name: "Sales",
      providerPhoneNumber: "+14155550100",
    });
    const campaign = await createCampaign(org.id, {
      name: "Launch",
      outboundAgentId: agent!.id,
      segmentId: seg.id,
    });
    const launched = await launchCampaign(org.id, campaign.id);
    expect(launched.queued).toBe(3);

    const leads = await listLeads(org.id);
    await placeOneOffCall(org.id, {
      leadId: leads[0].id,
      agentId: agent!.id,
    });
    await convertLeadToMeeting(org.id, leads[0].id, {
      ownerUserId: "rep-1",
      start: new Date("2026-09-01T10:00:00Z"),
    });

    const dash = await getSalesDashboard(org.id, "30d");
    expect(dash.kpis.leadsCreated).toBe(3);
    // 3 campaign stub calls + 1 one-off = 4 queued dials.
    expect(dash.kpis.dials).toBe(4);
  });
});
