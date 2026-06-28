/**
 * Fake SimulatorLlm — a scriptable, in-memory implementation for tests and local dev with no
 * Anthropic key. A script is a list of steps: "tool" steps invoke the injected executeTool (the
 * real `runTool` dispatch, so bookings/etc. actually happen), and the last "reply" is returned.
 */

import type {
  RunConversationInput,
  SimulatorLlm,
  SimulatorResult,
  SimulatorToolInvocation,
} from "@server/ports/simulator-llm.port";

export type FakeSimStep =
  | { type: "tool"; name: string; args: Record<string, unknown> }
  | { type: "reply"; text: string };

export class FakeSimulatorLlm implements SimulatorLlm {
  readonly available = true;
  constructor(
    private readonly script: FakeSimStep[] = [
      { type: "reply", text: "Hello! How can I help you today?" },
    ],
  ) {}

  async runConversation(input: RunConversationInput): Promise<SimulatorResult> {
    const toolCalls: SimulatorToolInvocation[] = [];
    let reply = "";
    for (const step of this.script) {
      if (step.type === "tool") {
        const result = await input.executeTool(step.name, step.args);
        toolCalls.push({ name: step.name, args: step.args, result });
      } else {
        reply = step.text;
      }
    }
    return { reply, toolCalls };
  }
}
