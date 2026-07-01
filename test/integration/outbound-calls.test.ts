import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { hasTestDb, truncateAll, disconnect } from "./helpers/db";
import { createOrg } from "./helpers/factories";
import { createContact } from "@server/features/outbound/contacts.service";
import { createLead, getLead } from "@server/features/outbound/leads.service";
import { createAgent } from "@server/features/outbound/agents.service";
import {
  placeOneOffCall,
  listOutboundCalls,
} from "@server/features/outbound/outbound-call.service";

/**
 * One-off outbound call (Product 2 §E, tests P2-Q4). Queues a stub call using the AGENT's
 * from-number, logs a lead activity, hard-blocks opted-out contacts, and requires the agent to
 * have a from-number configured.
 */
describe.skipIf(!hasTestDb)("outbound one-off calls (P2-Q4)", () => {
  beforeAll(async () => {
    await truncateAll();
  });
  beforeEach(async () => {
    await truncateAll();
  });
  afterAll(async () => {
    await disconnect();
  });

  it("P2-Q4-01: placing a call from a lead queues it with the agent's number + logs CALL", async () => {
    const org = await createOrg();
    const contact = await createContact(org.id, { name: "C", phone: "+1555" });
    const lead = await createLead(org.id, {
      contactId: contact.id,
      source: "MANUAL",
    });
    const agent = await createAgent(org.id, {
      name: "Sales",
      providerPhoneNumber: "+14150001",
    });

    const call = await placeOneOffCall(
      org.id,
      { leadId: lead.id, agentId: agent!.id },
      "user-1",
    );
    expect(call.status).toBe("QUEUED");
    expect(call.fromNumber).toBe("+14150001");
    expect(call.toNumber).toBe("+1555");
    expect(await listOutboundCalls(org.id, {})).toHaveLength(1);

    const full = await getLead(org.id, lead.id);
    expect((full?.activities ?? []).some((a) => a.type === "CALL")).toBe(true);
  });

  it("P2-Q4-02: an opted-out contact is hard-blocked", async () => {
    const org = await createOrg();
    const contact = await createContact(org.id, {
      name: "C",
      phone: "+1",
      optOut: true,
    });
    const agent = await createAgent(org.id, {
      name: "Sales",
      providerPhoneNumber: "+14150001",
    });
    await expect(
      placeOneOffCall(org.id, { contactId: contact.id, agentId: agent!.id }),
    ).rejects.toThrow();
  });

  it("P2-Q4-03: an agent with no from-number is rejected", async () => {
    const org = await createOrg();
    const contact = await createContact(org.id, { name: "C", phone: "+1" });
    const agent = await createAgent(org.id, { name: "No number" });
    await expect(
      placeOneOffCall(org.id, { contactId: contact.id, agentId: agent!.id }),
    ).rejects.toThrow();
  });
});
