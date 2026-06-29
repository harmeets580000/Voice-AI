import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { hasTestDb, truncateAll, disconnect, prisma } from "./helpers/db";
import { createOrg } from "./helpers/factories";
import { setVoiceProvider } from "@server/config/providers";
import { FakeVoiceProvider } from "@server/adapters/voice/fake/fake.provider";
import { encryptSecret } from "@server/platform/crypto/secretBox";
import {
  syncOrganizationFromVapi,
  getVapiSettings,
  resetOrgVapiData,
  reflectAllOrgsFromVapi,
} from "@server/features/organizations/organizations.service";
import { reconcileOrganizationTools } from "@server/features/tools/tools.service";

/** Per-assistant Vapi data lives on the Assistant table now; seed/read the org's default there. */
const createDefaultAssistant = (
  orgId: string,
  data: Record<string, unknown> = {},
) =>
  prisma.assistant.create({
    data: { organizationId: orgId, name: "Default", isDefault: true, ...data },
  });
const getDefaultAssistant = (orgId: string) =>
  prisma.assistant.findFirst({
    where: { organizationId: orgId },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
  });

describe.skipIf(!hasTestDb)("pull-sync from Vapi (R6)", () => {
  beforeEach(async () => {
    await truncateAll();
    setVoiceProvider(new FakeVoiceProvider());
  });
  afterAll(async () => {
    await disconnect();
  });

  it("pulls assistant config + number + KB into the default Assistant", async () => {
    const org = await createOrg();
    // Give it a known assistant id so pull uses it.
    await createDefaultAssistant(org.id, { providerAssistantId: "asst_known" });

    const res = await syncOrganizationFromVapi(org.id);
    expect(res.syncStatus).toBe("synced");

    const assistant = await getDefaultAssistant(org.id);
    expect(assistant?.greeting).toBe("Hello from Vapi");
    expect(assistant?.prompt).toContain("receptionist");
    expect(assistant?.voice).toBe("Elliot");
    expect(assistant?.llmModel).toBe("gpt-4o");
    expect(assistant?.providerPhoneNumber).toMatch(/^\+1555\d{7}$/);
    expect(assistant?.providerKnowledgeBaseId).toBeTruthy();

    const cfg = await prisma.orgVapiConfig.findUnique({
      where: { organizationId: org.id },
    });
    expect(cfg?.syncStatus).toBe("synced");
  });

  it("imports historical calls and is idempotent on re-sync", async () => {
    const org = await createOrg();
    await createDefaultAssistant(org.id, { providerAssistantId: "asst_known" });

    const first = await syncOrganizationFromVapi(org.id);
    expect(first.importedCalls).toBe(2);
    expect(await prisma.call.count({ where: { organizationId: org.id } })).toBe(2);

    // Re-run: same calls upsert, no duplicates.
    await syncOrganizationFromVapi(org.id);
    expect(await prisma.call.count({ where: { organizationId: org.id } })).toBe(2);
  });

  it("reconcileOrganizationTools syncs the enabled built-in tools; getVapiSettings exposes the catalog", async () => {
    const org = await createOrg();
    const res = await reconcileOrganizationTools(org.id);
    expect(res.syncError).toBeNull();

    // The org library now holds the full tool catalog; the 3 built-ins are enabled by
    // default and therefore the ones pushed to Vapi (synced with a vapiToolId).
    const BUILTINS = ["book_appointment", "check_availability", "lookup_customer"];
    const synced = res.tools.filter((t) => t.vapiToolId && t.syncStatus === "synced");
    expect(synced.map((t) => t.name).sort()).toEqual([...BUILTINS].sort());

    const settings = await getVapiSettings(org.id);
    const names = settings.tools.map((t) => t.name);
    for (const b of BUILTINS) expect(names).toContain(b);
    expect(settings.tools.length).toBeGreaterThan(BUILTINS.length);
  });

  it("resetOrgVapiData clears Vapi-derived data + calls but keeps the saved key", async () => {
    const org = await createOrg();
    await createDefaultAssistant(org.id, {
      providerAssistantId: "asst_fake_x",
      providerPhoneNumber: "+15551234567",
      greeting: "Hello from Vapi",
      voice: "Elliot",
      llmModel: "gpt-4o",
      syncStatus: "synced",
    });
    await prisma.orgVapiConfig.update({
      where: { organizationId: org.id },
      data: {
        vapiPrivateKeyEnc: "enc-blob",
        vapiKeyLast4: "abcd",
        syncStatus: "synced",
      },
    });
    await prisma.call.create({
      data: {
        organizationId: org.id,
        vapiCallId: "asst_fake_x-call-1",
        direction: "inbound",
      },
    });

    const res = await resetOrgVapiData(org.id);

    // The mirror ids (sourced from the default assistant) are cleared.
    expect(res.vapiAssistantId).toBeNull();
    expect(res.vapiPhoneNumber).toBeNull();
    // Key is preserved.
    expect(res.hasCustomKey).toBe(true);
    expect(res.keyLast4).toBe("abcd");

    // The assistant is disconnected from Vapi (provider ids cleared) but keeps its config.
    const assistant = await getDefaultAssistant(org.id);
    expect(assistant?.providerAssistantId).toBeNull();
    expect(assistant?.providerPhoneNumber).toBeNull();
    expect(assistant?.greeting).toBe("Hello from Vapi");

    // Imported calls are gone.
    expect(await prisma.call.count({ where: { organizationId: org.id } })).toBe(0);
  });

  it("reflectAllOrgsFromVapi fully reflects Vapi for keyed orgs and logs every run", async () => {
    const keyed = await createOrg();
    await createDefaultAssistant(keyed.id, { providerAssistantId: "asst_known" });
    await prisma.orgVapiConfig.update({
      where: { organizationId: keyed.id },
      data: {
        vapiPrivateKeyEnc: encryptSecret("priv_test_key"),
        vapiKeyLast4: "key0",
      },
    });
    const keyless = await createOrg(); // no key / no assistant → must be skipped

    // First reflect: imports calls, overwrites config from Vapi, reflects tools.
    const res = await reflectAllOrgsFromVapi();
    expect(res.find((r) => r.orgId === keyed.id)?.imported).toBe(2);
    expect(res.find((r) => r.orgId === keyless.id)).toBeUndefined();
    expect(await prisma.call.count({ where: { organizationId: keyed.id } })).toBe(2);

    const assistant = await getDefaultAssistant(keyed.id);
    expect(assistant?.greeting).toBe("Hello from Vapi"); // overwritten from Vapi (full reflect)
    expect(assistant?.voice).toBe("Elliot");

    const tools = await prisma.vapiTool.findMany({
      where: { organizationId: keyed.id },
    });
    expect(tools.length).toBe(2); // reflected from fake snap.tools
    expect(tools.every((t) => t.vapiToolId && t.syncStatus === "synced")).toBe(true);

    const logs1 = await prisma.syncLog.count({
      where: { organizationId: keyed.id },
    });
    expect(logs1).toBeGreaterThanOrEqual(1);

    // Second reflect: no new calls/changes, but STILL logged (every run is visible).
    const res2 = await reflectAllOrgsFromVapi();
    expect(res2.find((r) => r.orgId === keyed.id)?.imported).toBe(0);
    expect(await prisma.call.count({ where: { organizationId: keyed.id } })).toBe(2);
    const logs2 = await prisma.syncLog.count({
      where: { organizationId: keyed.id },
    });
    expect(logs2).toBe(logs1 + 1);
  });

  it("reflects ALL Vapi-account assistants, bootstrapping a keyed org that has none yet", async () => {
    const org = await createOrg();
    await prisma.orgVapiConfig.update({
      where: { organizationId: org.id },
      data: {
        vapiPrivateKeyEnc: encryptSecret("priv_test_key"),
        vapiKeyLast4: "key0",
      },
    });
    // No Assistant rows yet — the poller must bootstrap from the Vapi account.
    expect(await prisma.assistant.count({ where: { organizationId: org.id } })).toBe(0);

    await reflectAllOrgsFromVapi();

    const ids = (
      await prisma.assistant.findMany({
        where: { organizationId: org.id },
        select: { providerAssistantId: true },
      })
    ).map((a) => a.providerAssistantId);
    // The fake account exposes asst_fake_1 / asst_fake_2 (Receptionist A / B).
    expect(ids).toContain("asst_fake_1");
    expect(ids).toContain("asst_fake_2");
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
