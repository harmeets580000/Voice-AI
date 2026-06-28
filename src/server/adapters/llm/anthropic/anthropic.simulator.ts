/**
 * Anthropic adapter for the SimulatorLlm port — the ONLY place allowed to import
 * `@anthropic-ai/sdk`. Runs a manual tool-use loop (per the Claude API tool-use guide):
 * send messages + tools, execute any tool_use blocks via the injected `executeTool`, feed the
 * tool_result back, and repeat until the model stops calling tools. Returns the final reply
 * plus the tool invocations (for the simulator UI).
 */

import Anthropic from "@anthropic-ai/sdk";
import { env } from "@server/config/env";
import type {
  RunConversationInput,
  SimulatorLlm,
  SimulatorResult,
  SimulatorToolInvocation,
} from "@server/ports/simulator-llm.port";

export class AnthropicSimulatorLlm implements SimulatorLlm {
  readonly available = !!env.ANTHROPIC_API_KEY;
  private client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

  async runConversation(input: RunConversationInput): Promise<SimulatorResult> {
    const model = env.SIMULATOR_MODEL;
    const tools: Anthropic.Tool[] = input.tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters as Anthropic.Tool["input_schema"],
    }));
    const messages: Anthropic.MessageParam[] = input.messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    const toolCalls: SimulatorToolInvocation[] = [];
    let reply = "";
    const maxSteps = input.maxSteps ?? 8;

    for (let step = 0; step < maxSteps; step++) {
      const resp = await this.client.messages.create({
        model,
        max_tokens: 4096,
        system: input.system,
        tools,
        messages,
      });

      const text = resp.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
      if (text) reply = text;

      const toolUses = resp.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
      );
      messages.push({ role: "assistant", content: resp.content });

      if (resp.stop_reason !== "tool_use" || toolUses.length === 0) break;

      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const tu of toolUses) {
        const args = (tu.input ?? {}) as Record<string, unknown>;
        let result: unknown;
        try {
          result = await input.executeTool(tu.name, args);
        } catch (e) {
          result = { error: e instanceof Error ? e.message : String(e) };
        }
        toolCalls.push({ name: tu.name, args, result });
        results.push({
          type: "tool_result",
          tool_use_id: tu.id,
          content: typeof result === "string" ? result : JSON.stringify(result),
        });
      }
      messages.push({ role: "user", content: results });
    }

    return { reply, toolCalls };
  }
}
