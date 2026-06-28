/**
 * SimulatorLlm PORT — drives the per-assistant text-chat simulator (a tool-calling chat).
 * Vendor-neutral: business code depends on this interface; the concrete LLM SDK lives in an
 * adapter under `src/server/adapters/llm/<vendor>/` (only place allowed to import the SDK).
 *
 * `runConversation` runs the full tool-use loop for one turn: the model may call tools (which
 * we execute via `executeTool` — the same `runTool` dispatch the real provider uses) and then
 * produce a final reply. The loop is the adapter's concern; tool execution stays ours.
 */

export interface SimulatorTool {
  name: string;
  description: string;
  /** JSON-schema object describing the tool's arguments. */
  parameters: unknown;
}

export interface SimulatorMessage {
  role: "user" | "assistant";
  content: string;
}

/** A tool the model invoked during the turn, with the result we returned — for the UI. */
export interface SimulatorToolInvocation {
  name: string;
  args: unknown;
  result: unknown;
}

export interface SimulatorResult {
  reply: string;
  toolCalls: SimulatorToolInvocation[];
}

export interface RunConversationInput {
  system: string;
  messages: SimulatorMessage[];
  tools: SimulatorTool[];
  executeTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  /** Safety cap on tool-call rounds (default 8). */
  maxSteps?: number;
}

export interface SimulatorLlm {
  /** Whether the simulator is configured (e.g. an API key is present). */
  readonly available: boolean;
  runConversation(input: RunConversationInput): Promise<SimulatorResult>;
}
