import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { hasTestDb, truncateAll, disconnect } from "./helpers/db";
import { createOrg } from "./helpers/factories";
import { createContact } from "@server/features/outbound/contacts.service";
import { createLead, getLead } from "@server/features/outbound/leads.service";
import {
  convertLeadToMeeting,
  listMeetings,
} from "@server/features/outbound/meeting.engine";

/**
 * Convert lead → meeting (Product 2 §F/§Q6, tests P2-Q6). Creates a meeting + CONVERTED activity,
 * guards the owner rep against double-booking, and stays org-scoped.
 */
describe.skipIf(!hasTestDb)("outbound meetings (P2-Q6)", () => {
  beforeAll(async () => {
    await truncateAll();
  });
  beforeEach(async () => {
    await truncateAll();
  });
  afterAll(async () => {
    await disconnect();
  });

  it("P2-Q6-01: convert creates a meeting + CONVERTED activity", async () => {
    const org = await createOrg();
    const contact = await createContact(org.id, { name: "C", phone: "+1" });
    const lead = await createLead(org.id, {
      contactId: contact.id,
      source: "MANUAL",
    });

    const meeting = await convertLeadToMeeting(
      org.id,
      lead.id,
      { ownerUserId: "rep-1", start: new Date("2026-08-01T10:00:00Z"), durationMin: 30 },
      "user-1",
    );
    expect(meeting.status).toBe("SCHEDULED");
    expect(meeting.leadId).toBe(lead.id);
    expect(await listMeetings(org.id, {})).toHaveLength(1);

    const full = await getLead(org.id, lead.id);
    expect((full?.activities ?? []).some((a) => a.type === "CONVERTED")).toBe(
      true,
    );
  });

  it("P2-Q6-02: double-booking the same rep is rejected; another rep is fine", async () => {
    const org = await createOrg();
    const c1 = await createContact(org.id, { name: "A", phone: "+1" });
    const l1 = await createLead(org.id, { contactId: c1.id, source: "MANUAL" });
    const c2 = await createContact(org.id, { name: "B", phone: "+2" });
    const l2 = await createLead(org.id, { contactId: c2.id, source: "MANUAL" });

    await convertLeadToMeeting(org.id, l1.id, {
      ownerUserId: "rep-1",
      start: new Date("2026-08-01T10:00:00Z"),
      durationMin: 60,
    });

    // Overlaps rep-1's 10:00–11:00 meeting.
    await expect(
      convertLeadToMeeting(org.id, l2.id, {
        ownerUserId: "rep-1",
        start: new Date("2026-08-01T10:30:00Z"),
        durationMin: 30,
      }),
    ).rejects.toThrow();

    // Same time, different rep → allowed.
    const ok = await convertLeadToMeeting(org.id, l2.id, {
      ownerUserId: "rep-2",
      start: new Date("2026-08-01T10:30:00Z"),
      durationMin: 30,
    });
    expect(ok.status).toBe("SCHEDULED");
  });

  it("P2-Q6-03: meetings are org-scoped", async () => {
    const a = await createOrg({ slug: `a-${Date.now()}` });
    const b = await createOrg({ slug: `b-${Date.now()}` });
    const ca = await createContact(a.id, { name: "A", phone: "+1" });
    const la = await createLead(a.id, { contactId: ca.id, source: "MANUAL" });
    await convertLeadToMeeting(a.id, la.id, {
      ownerUserId: "rep-1",
      start: new Date("2026-08-01T10:00:00Z"),
    });
    expect(await listMeetings(a.id, {})).toHaveLength(1);
    expect(await listMeetings(b.id, {})).toHaveLength(0);
  });
});
