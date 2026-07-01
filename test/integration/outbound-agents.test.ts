import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { hasTestDb, truncateAll, disconnect } from "./helpers/db";
import { createOrg, createUser } from "./helpers/factories";
import { tenantDb } from "@server/platform/db/scoped";
import { createContact } from "@server/features/outbound/contacts.service";
import {
  listAgents,
  createAgent,
  updateAgent,
  setAgentAction,
} from "@server/features/outbound/agents.service";

/**
 * Outbound Agents (Product 2 §C, tests P2-Q2). Multiple agents/org, config-only actions that
 * do NOT execute (MARK_DNC is inert), and org isolation.
 */
describe.skipIf(!hasTestDb)("outbound agents (P2-Q2)", () => {
  beforeAll(async () => {
    await truncateAll();
  });
  beforeEach(async () => {
    await truncateAll();
  });
  afterAll(async () => {
    await disconnect();
  });

  it("P2-Q2-01: create + activate, enable actions, and a second agent", async () => {
    const org = await createOrg();
    await createUser(org.id, "org_admin"); // makes scheduling available for BOOK_MEETING

    const a1 = await createAgent(org.id, { name: "Sales A" });
    await setAgentAction(org.id, a1!.id, "QUALIFY_LEAD", { enabled: true });
    await setAgentAction(org.id, a1!.id, "BOOK_MEETING", { enabled: true });
    await updateAgent(org.id, a1!.id, { status: "ACTIVE" });
    await createAgent(org.id, { name: "Sales B" });

    const agents = await listAgents(org.id);
    expect(agents).toHaveLength(2);
    const active = agents.find((x) => x.id === a1!.id)!;
    expect(active.status).toBe("ACTIVE");
    expect(active.actions.find((ac) => ac.type === "QUALIFY_LEAD")?.enabled).toBe(
      true,
    );
    expect(active.actions.find((ac) => ac.type === "BOOK_MEETING")?.enabled).toBe(
      true,
    );
  });

  it("P2-Q2-02: enabling MARK_DNC persists config but mutates no contact", async () => {
    const org = await createOrg();
    const contact = await createContact(org.id, { name: "C", phone: "+1" });
    const agent = await createAgent(org.id, { name: "A" });

    await setAgentAction(org.id, agent!.id, "MARK_DNC", {
      enabled: true,
      config: { note: "flag noisy callers" },
    });

    const after = await tenantDb(org.id).outboundContact.findFirst({
      where: { id: contact.id },
    });
    expect(after?.optOut).toBe(false);
  });

  it("P2-Q2-03: agents are org-scoped", async () => {
    const a = await createOrg({ slug: `a-${Date.now()}` });
    const b = await createOrg({ slug: `b-${Date.now()}` });
    await createAgent(a.id, { name: "A only" });
    expect(await listAgents(a.id)).toHaveLength(1);
    expect(await listAgents(b.id)).toHaveLength(0);
  });
});
