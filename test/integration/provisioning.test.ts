import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { hasTestDb, truncateAll, disconnect, prisma } from "./helpers/db";
import { createOrg } from "./helpers/factories";
import { setVoiceProvider } from "@server/config/providers";
import { FakeVoiceProvider } from "@server/adapters/voice/fake/fake.provider";
import {
  provisionOrganization,
  updateVapiSettings,
  getVapiSettings,
} from "@server/features/organizations/organizations.service";

describe.skipIf(!hasTestDb)("provisioning + credentials (I-PROV, I-SEC)", () => {
  beforeEach(async () => {
    await truncateAll();
    setVoiceProvider(new FakeVoiceProvider()); // reset to a clean fake each test
  });
  afterAll(async () => {
    await disconnect();
  });

  it("I-PROV-01: provision persists Vapi ids + tools with syncStatus=synced", async () => {
    const org = await createOrg();
    const result = await provisionOrganization(org.id);
    expect(result.syncStatus).toBe("synced");

    // Per-assistant Vapi ids live on the default Assistant; OrgVapiConfig tracks org-level status.
    const assistant = await prisma.assistant.findFirst({
      where: { organizationId: org.id },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    });
    expect(assistant?.providerAssistantId).toBeTruthy();
    expect(assistant?.providerPhoneNumber).toBeTruthy();
    const cfg = await prisma.orgVapiConfig.findUnique({
      where: { organizationId: org.id },
    });
    expect(cfg?.syncStatus).toBe("synced");

    const tools = await prisma.vapiTool.findMany({ where: { organizationId: org.id } });
    expect(tools).toHaveLength(3);
    expect(tools.every((t) => t.vapiToolId && t.syncStatus === "synced")).toBe(true);
  });

  it("I-PROV-02: a provider failure records syncStatus=failed + error", async () => {
    const org = await createOrg();
    setVoiceProvider(new FakeVoiceProvider({ failOnProvision: true }));
    const result = await provisionOrganization(org.id);
    expect(result.syncStatus).toBe("failed");
    expect(result.syncError).toBeTruthy();
    const cfg = await prisma.orgVapiConfig.findUnique({
      where: { organizationId: org.id },
    });
    expect(cfg?.syncStatus).toBe("failed");
  });

  it("I-PROV-03: re-running provision reuses ids (idempotent, no duplicate tools)", async () => {
    const org = await createOrg();
    const defaultAssistant = () =>
      prisma.assistant.findFirst({
        where: { organizationId: org.id },
        orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
      });
    await provisionOrganization(org.id);
    const first = await defaultAssistant();
    await provisionOrganization(org.id);
    const second = await defaultAssistant();
    expect(second?.providerAssistantId).toBe(first?.providerAssistantId);
    const tools = await prisma.vapiTool.findMany({ where: { organizationId: org.id } });
    expect(tools).toHaveLength(3); // still 3, not 6
  });

  it("I-SEC-04/05: a per-customer key is stored encrypted; only last-4 is ever returned", async () => {
    const org = await createOrg();
    const key = "priv_live_supersecret_4242";
    await updateVapiSettings(org.id, { privateKey: key });

    const cfg = await prisma.orgVapiConfig.findUnique({
      where: { organizationId: org.id },
    });
    expect(cfg?.vapiPrivateKeyEnc).toBeTruthy();
    expect(cfg?.vapiPrivateKeyEnc).not.toContain(key); // ciphertext, not plaintext
    expect(cfg?.vapiKeyLast4).toBe("4242");

    const settings = await getVapiSettings(org.id);
    expect(settings.hasCustomKey).toBe(true);
    expect(settings.keyLast4).toBe("4242");
    // The settings DTO has no field that could carry the plaintext.
    expect(JSON.stringify(settings)).not.toContain(key);
  });
});
