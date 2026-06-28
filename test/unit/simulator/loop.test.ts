import { describe, it, expect } from "vitest";
import { FakeSimulatorLlm } from "@server/adapters/llm/fake/fake.simulator";
import type { SimulatorTool } from "@server/ports/simulator-llm.port";

/**
 * Simulator loop (port-level, no DB): the scripted fake should invoke tools through the
 * injected executeTool (the same seam that runs runTool in production) and surface a reply.
 */
describe("simulator tool loop (M-A6)", () => {
  const tools: SimulatorTool[] = [
    { name: "list_services", description: "", parameters: { type: "object", properties: {} } },
  ];

  it("executes scripted tool calls and returns the final reply", async () => {
    const executed: { name: string; args: unknown }[] = [];
    const llm = new FakeSimulatorLlm([
      { type: "tool", name: "list_services", args: {} },
      { type: "reply", text: "We offer haircuts and coloring." },
    ]);

    const result = await llm.runConversation({
      system: "you are a receptionist",
      messages: [{ role: "user", content: "what do you offer?" }],
      tools,
      executeTool: async (name, args) => {
        executed.push({ name, args });
        return { count: 2, services: ["haircut", "coloring"] };
      },
    });

    expect(executed).toEqual([{ name: "list_services", args: {} }]);
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0].name).toBe("list_services");
    expect(result.reply).toContain("haircuts");
  });

  it("a reply-only script makes no tool calls", async () => {
    const llm = new FakeSimulatorLlm([{ type: "reply", text: "Hi there!" }]);
    const result = await llm.runConversation({
      system: "s",
      messages: [{ role: "user", content: "hi" }],
      tools,
      executeTool: async () => ({}),
    });
    expect(result.toolCalls).toHaveLength(0);
    expect(result.reply).toBe("Hi there!");
  });
});
