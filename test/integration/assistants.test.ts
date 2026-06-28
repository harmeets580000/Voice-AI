import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { hasTestDb, truncateAll, disconnect } from "./helpers/db";
import { createOrg, createReadyOrg } from "./helpers/factories";
import { setVoiceProvider, setSimulatorLlm } from "@server/config/providers";
import { FakeVoiceProvider } from "@server/adapters/voice/fake/fake.provider";
import { FakeSimulatorLlm } from "@server/adapters/llm/fake/fake.simulator";
import {
  createAssistant,
  provisionAssistant,
  setAssistantTools,
  getAssistant,
} from "@server/features/assistants/assistants.service";
import { listTools } from "@server/features/tools/tools.service";
import { simulateAssistantTurn } from "@server/features/assistants/simulator.service";

describe.skipIf(!hasTestDb)("multi-assistant (M-A2/A6)", () => {
  beforeEach(async () => {
    await truncateAll();
    setVoiceProvider(new FakeVoiceProvider());
  });
  afterAll(async () => {
    await disconnect();
  });

  it("provisions two assistants in one org with distinct provider ids + phone numbers", async () => {
    const org = await createOrg();
    const a1 = await createAssistant(org.id, { name: "Front desk" });
    const a2 = await createAssistant(org.id, { name: "After hours" });
    await provisionAssistant(org.id, a1.id);
    await provisionAssistant(org.id, a2.id);

    const p1 = await getAssistant(org.id, a1.id);
    const p2 = await getAssistant(org.id, a2.id);
    expect(p1.providerAssistantId).toBeTruthy();
    expect(p2.providerAssistantId).toBeTruthy();
    expect(p1.providerAssistantId).not.toBe(p2.providerAssistantId);
    expect(p1.providerPhoneNumber).not.toBe(p2.providerPhoneNumber);
    expect(p1.isDefault).toBe(true); // first one
  });

  it("per-assistant tool selection is isolated", async () => {
    const org = await createOrg();
    const a = await createAssistant(org.id, { name: "A" });
    const tools = await listTools(org.id); // seeds the org catalog library
    const pick = tools
      .filter((t) => ["check_availability", "list_services"].includes(t.name))
      .map((t) => t.id);
    const updated = await setAssistantTools(org.id, a.id, pick);
    expect(updated.selectedToolIds.slice().sort()).toEqual(pick.slice().sort());
  });

  it("the simulator runs the assistant's tools against real data", async () => {
    const { org, service } = await createReadyOrg();
    const a = await createAssistant(org.id, { name: "Sim" });
    setSimulatorLlm(
      new FakeSimulatorLlm([
        { type: "tool", name: "list_services", args: {} },
        { type: "reply", text: `We offer ${service.name}.` },
      ]),
    );

    const res = await simulateAssistantTurn(org.id, a.id, [
      { role: "user", content: "what do you offer?" },
    ]);

    expect(res.toolCalls.map((t) => t.name)).toContain("list_services");
    const result = res.toolCalls[0].result as { services: { name: string }[] };
    expect(result.services.some((s) => s.name === service.name)).toBe(true);
    expect(res.reply).toContain(service.name);
  });
});
