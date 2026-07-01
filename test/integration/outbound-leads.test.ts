import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { hasTestDb, truncateAll, disconnect } from "./helpers/db";
import { createOrg } from "./helpers/factories";
import { createContact } from "@server/features/outbound/contacts.service";
import {
  createLead,
  updateLeadStage,
  getLead,
  listLeads,
  bulkPromoteToLeads,
} from "@server/features/outbound/leads.service";

/**
 * Lead pipeline (Product 2 §F, tests P2-Q3). Bulk-promote dedupe/opt-out, stage-change activity
 * logging, the LOST-needs-a-reason rule, and org isolation.
 */
describe.skipIf(!hasTestDb)("outbound leads (P2-Q3)", () => {
  beforeAll(async () => {
    await truncateAll();
  });
  beforeEach(async () => {
    await truncateAll();
  });
  afterAll(async () => {
    await disconnect();
  });

  it("P2-Q3-01: bulk-promote skips opted-out and already-open-lead contacts", async () => {
    const org = await createOrg();
    const c1 = await createContact(org.id, { name: "C1", phone: "+1" });
    const c2 = await createContact(org.id, { name: "C2", phone: "+2" });
    const c3 = await createContact(org.id, { name: "C3", phone: "+3" });
    const optedOut = await createContact(org.id, {
      name: "C4",
      phone: "+4",
      optOut: true,
    });
    const alreadyLead = await createContact(org.id, { name: "C5", phone: "+5" });
    await createLead(org.id, { contactId: alreadyLead.id, source: "MANUAL" });

    const summary = await bulkPromoteToLeads(org.id, [
      c1.id,
      c2.id,
      c3.id,
      optedOut.id,
      alreadyLead.id,
    ]);
    expect(summary.total).toBe(5);
    expect(summary.promoted).toBe(3);
    expect(summary.skippedOptOut).toBe(1);
    expect(summary.skippedExisting).toBe(1);
  });

  it("P2-Q3-02: each stage change appends an activity", async () => {
    const org = await createOrg();
    const contact = await createContact(org.id, { name: "C", phone: "+1" });
    const lead = await createLead(org.id, {
      contactId: contact.id,
      source: "MANUAL",
    });

    await updateLeadStage(org.id, lead.id, "CONTACTED");
    await updateLeadStage(org.id, lead.id, "QUALIFIED");
    await updateLeadStage(org.id, lead.id, "PROPOSAL");

    const full = await getLead(org.id, lead.id);
    expect(full?.stage).toBe("PROPOSAL");
    const stageChanges = (full?.activities ?? []).filter(
      (a) => a.type === "STAGE_CHANGED",
    );
    expect(stageChanges).toHaveLength(3);
    expect((full?.activities ?? []).some((a) => a.type === "CREATED")).toBe(true);
  });

  it("P2-Q3-03: marking LOST requires a reason", async () => {
    const org = await createOrg();
    const contact = await createContact(org.id, { name: "C", phone: "+1" });
    const lead = await createLead(org.id, {
      contactId: contact.id,
      source: "MANUAL",
    });

    await expect(updateLeadStage(org.id, lead.id, "LOST")).rejects.toThrow();

    const lost = await updateLeadStage(org.id, lead.id, "LOST", {
      lostReason: "no budget",
    });
    expect(lost.stage).toBe("LOST");
    expect(lost.lostReason).toBe("no budget");
  });

  it("P2-Q3-04: leads are org-scoped", async () => {
    const a = await createOrg({ slug: `a-${Date.now()}` });
    const b = await createOrg({ slug: `b-${Date.now()}` });
    const ca = await createContact(a.id, { name: "A", phone: "+1" });
    await createLead(a.id, { contactId: ca.id, source: "MANUAL" });
    expect(await listLeads(a.id)).toHaveLength(1);
    expect(await listLeads(b.id)).toHaveLength(0);
  });
});
