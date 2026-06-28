import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { hasTestDb, truncateAll, disconnect, prisma } from "./helpers/db";
import { createOrg } from "./helpers/factories";
import { setVoiceProvider } from "@server/config/providers";
import { FakeVoiceProvider } from "@server/adapters/voice/fake/fake.provider";
import {
  syncOrganizationFromVapi,
  getVapiSettings,
} from "@server/features/organizations/organizations.service";
import { reconcileOrganizationTools } from "@server/features/tools/tools.service";

describe.skipIf(!hasTestDb)("pull-sync from Vapi (R6)", () => {
  beforeEach(async () => {
    await truncateAll();
    setVoiceProvider(new FakeVoiceProvider());
  });
  afterAll(async () => {
    await disconnect();
  });

  it("pulls assistant config + number + KB into OrgVapiConfig", async () => {
    const org = await createOrg();
    // Give it a known assistant id so pull uses it.
    await prisma.orgVapiConfig.update({
      where: { organizationId: org.id },
      data: { vapiAssistantId: "asst_known" },
    });

    const res = await syncOrganizationFromVapi(org.id);
    expect(res.syncStatus).toBe("synced");

    const cfg = await prisma.orgVapiConfig.findUnique({
      where: { organizationId: org.id },
    });
    expect(cfg?.greeting).toBe("Hello from Vapi");
    expect(cfg?.prompt).toContain("receptionist");
    expect(cfg?.voice).toBe("Elliot");
    expect(cfg?.llmModel).toBe("gpt-4o");
    expect(cfg?.vapiPhoneNumber).toMatch(/^\+1555\d{7}$/);
    expect(cfg?.vapiKnowledgeBaseId).toBeTruthy();
    expect(cfg?.syncStatus).toBe("synced");
  });

  it("imports historical calls and is idempotent on re-sync", async () => {
    const org = await createOrg();
    await prisma.orgVapiConfig.update({
      where: { organizationId: org.id },
      data: { vapiAssistantId: "asst_known" },
    });

    const first = await syncOrganizationFromVapi(org.id);
    expect(first.importedCalls).toBe(2);
    expect(await prisma.call.count({ where: { organizationId: org.id } })).toBe(2);

    // Re-run: same calls upsert, no duplicates.
    await syncOrganizationFromVapi(org.id);
    expect(await prisma.call.count({ where: { organizationId: org.id } })).toBe(2);
  });

  it("reconcileOrganizationTools creates the 3 built-in tools as synced and getVapiSettings returns them", async () => {
    const org = await createOrg();
    const res = await reconcileOrganizationTools(org.id);
    expect(res.syncError).toBeNull();
    expect(res.tools).toHaveLength(3);
    expect(res.tools.every((t) => t.vapiToolId && t.syncStatus === "synced")).toBe(true);

    const settings = await getVapiSettings(org.id);
    expect(settings.tools).toHaveLength(3);
    const names = settings.tools.map((t) => t.name).sort();
    expect(names).toEqual([
      "book_appointment",
      "check_availability",
      "lookup_customer",
    ]);
  });

  it("records syncStatus=failed when the provider throws", async () => {
    const org = await createOrg();
    setVoiceProvider({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...(new FakeVoiceProvider() as any),
      pullOrgData: async () => {
        throw new Error("boom");
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    const res = await syncOrganizationFromVapi(org.id);
    expect(res.syncStatus).toBe("failed");
    expect(res.syncError).toContain("boom");
  });
});
