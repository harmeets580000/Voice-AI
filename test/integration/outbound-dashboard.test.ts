import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { hasTestDb, truncateAll, disconnect } from "./helpers/db";
import { createOrg } from "./helpers/factories";
import { createContact } from "@server/features/outbound/contacts.service";
import {
  createLead,
  updateLeadStage,
} from "@server/features/outbound/leads.service";
import { createAgent } from "@server/features/outbound/agents.service";
import { placeOneOffCall } from "@server/features/outbound/outbound-call.service";
import { getSalesDashboard } from "@server/features/outbound/sales-analytics.service";

/**
 * Sales dashboard (Product 2 §G, tests P2-Q7). KPIs reconcile with the underlying lists, the
 * funnel sums to the lead total, and everything is org-scoped.
 */
describe.skipIf(!hasTestDb)("outbound sales dashboard (P2-Q7)", () => {
  beforeAll(async () => {
    await truncateAll();
  });
  beforeEach(async () => {
    await truncateAll();
  });
  afterAll(async () => {
    await disconnect();
  });

  async function seed(orgId: string) {
    const c1 = await createContact(orgId, { phone: "+1" });
    await createLead(orgId, { contactId: c1.id, source: "MANUAL", value: 1000 });
    const c2 = await createContact(orgId, { phone: "+2" });
    await createLead(orgId, { contactId: c2.id, source: "MANUAL", value: 2000 });
    const c3 = await createContact(orgId, { phone: "+3" });
    const l3 = await createLead(orgId, { contactId: c3.id, source: "MANUAL" });
    await updateLeadStage(orgId, l3.id, "WON");
    const c4 = await createContact(orgId, { phone: "+4" });
    const l4 = await createLead(orgId, { contactId: c4.id, source: "MANUAL" });
    await updateLeadStage(orgId, l4.id, "LOST", { lostReason: "no budget" });
    const agent = await createAgent(orgId, {
      name: "Sales",
      providerPhoneNumber: "+1999",
    });
    await placeOneOffCall(orgId, { contactId: c1.id, agentId: agent!.id });
  }

  it("P2-Q7-01: KPIs reconcile with the lists", async () => {
    const org = await createOrg();
    await seed(org.id);
    const dash = await getSalesDashboard(org.id, "30d");
    expect(dash.kpis.dials).toBe(1); // one QUEUED outbound call
    expect(dash.kpis.leadsCreated).toBe(4);
    expect(dash.kpis.conversionPct).toBe(25); // 1 WON / 4 leads
    expect(dash.kpis.pipelineValue).toBe(3000); // open leads: 1000 + 2000
  });

  it("P2-Q7-02: the funnel sums to the lead total across all 6 stages", async () => {
    const org = await createOrg();
    await seed(org.id);
    const dash = await getSalesDashboard(org.id, "30d");
    const sum = dash.funnel.reduce((a, f) => a + f.count, 0);
    expect(sum).toBe(4);
    expect(dash.funnel.find((f) => f.key === "WON")?.count).toBe(1);
    expect(dash.funnel.find((f) => f.key === "NEW")?.count).toBe(2);
    expect(dash.funnel).toHaveLength(6);
  });

  it("P2-Q7-03: the dashboard is org-scoped", async () => {
    const a = await createOrg({ slug: `a-${Date.now()}` });
    const b = await createOrg({ slug: `b-${Date.now()}` });
    await seed(a.id);
    const dashB = await getSalesDashboard(b.id, "30d");
    expect(dashB.kpis.leadsCreated).toBe(0);
    expect(dashB.kpis.pipelineValue).toBe(0);
    expect(dashB.funnel.reduce((s, f) => s + f.count, 0)).toBe(0);
  });
});
