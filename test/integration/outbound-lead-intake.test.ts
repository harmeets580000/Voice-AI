import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { hasTestDb, truncateAll, disconnect } from "./helpers/db";
import { createOrg } from "./helpers/factories";
import { tenantDb } from "@server/platform/db/scoped";
import {
  createContact,
  listContacts,
} from "@server/features/outbound/contacts.service";
import {
  createLead,
  listLeads,
  getLead,
} from "@server/features/outbound/leads.service";
import {
  importLeads,
  createManualLead,
} from "@server/features/outbound/lead-intake.service";

/**
 * Lead intake (Product 2 §H, tests P2-Q35). CSV upload + manual form; both upsert a contact
 * first, respect opt-out, and dedupe against an existing open lead.
 */
describe.skipIf(!hasTestDb)("outbound lead intake (P2-Q35)", () => {
  beforeAll(async () => {
    await truncateAll();
  });
  beforeEach(async () => {
    await truncateAll();
  });
  afterAll(async () => {
    await disconnect();
  });

  it("P2-Q35-01: CSV lead import upserts contacts, skips dupe-lead + opt-out", async () => {
    const org = await createOrg();
    const dupe = await createContact(org.id, { name: "Dupe", phone: "+15551" });
    await createLead(org.id, { contactId: dupe.id, source: "MANUAL" });
    await createContact(org.id, {
      name: "OptedOut",
      phone: "+15552",
      optOut: true,
    });

    const summary = await importLeads(org.id, {
      filename: "leads.csv",
      rows: [
        { name: "New1", phone: "+15553" },
        { name: "New2", phone: "+15554" },
        { name: "New3", phone: "+15555" },
        { name: "New4", phone: "+15556" },
        { name: "Dupe", phone: "+15551" },
        { name: "OptedOut", phone: "+15552" },
      ],
    });

    expect(summary.total).toBe(6);
    expect(summary.imported).toBe(4);
    expect(summary.skipped).toBe(2);
    // 2 pre-existing contacts + 4 upserted = 6; 1 pre-existing lead + 4 new = 5.
    expect(await listContacts(org.id)).toHaveLength(6);
    expect(await listLeads(org.id)).toHaveLength(5);
    const imports = await tenantDb(org.id).leadImport.findMany();
    expect(imports[0].importedRows).toBe(4);
  });

  it("P2-Q35-02: manual form creates a contact + lead + CREATED activity", async () => {
    const org = await createOrg();
    const res = await createManualLead(org.id, { name: "Fresh", phone: "+19990" });
    expect(res.existed).toBe(false);
    expect(res.lead.source).toBe("MANUAL");
    expect(await listContacts(org.id)).toHaveLength(1);
    expect(await listLeads(org.id)).toHaveLength(1);
    const full = await getLead(org.id, res.lead.id);
    expect((full?.activities ?? []).some((a) => a.type === "CREATED")).toBe(true);
  });

  it("P2-Q35-03: manual form for an existing open lead routes to it (no duplicate)", async () => {
    const org = await createOrg();
    const first = await createManualLead(org.id, {
      name: "Repeat",
      phone: "+18880",
    });
    expect(first.existed).toBe(false);

    const second = await createManualLead(org.id, {
      name: "Repeat",
      phone: "+18880",
      note: "called again",
    });
    expect(second.existed).toBe(true);
    expect(second.lead.id).toBe(first.lead.id);
    expect(await listLeads(org.id)).toHaveLength(1);
  });
});
