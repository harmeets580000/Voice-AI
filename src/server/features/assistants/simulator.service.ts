/**
 * Assistant simulator — runs a text-chat turn against an assistant's brain: its prompt + its
 * SELECTED tools, driven by the SimulatorLlm port (Claude tool loop). Tool calls execute through
 * the same `runTool` dispatch the real voice provider uses, so bookings/cancellations are real.
 *
 * Provider-neutral: it demos a Vapi / Retell / Azure / AWS assistant identically.
 */

import { DateTime } from "luxon";
import { prisma } from "@server/platform/db/client";
import { tenantDb } from "@server/platform/db/scoped";
import { AppError } from "@server/platform/http/errors";
import { getSimulatorLlm } from "@server/config/providers";
import {
  TOOL_REGISTRY,
  builtinToolDefs,
  runTool,
} from "@server/features/receptionist-tools/tools.registry";
import { getAssistantScope } from "./assistants.service";
import type {
  SimulatorMessage,
  SimulatorResult,
  SimulatorTool,
} from "@server/ports/simulator-llm.port";

export async function simulateAssistantTurn(
  orgId: string,
  assistantId: string,
  messages: SimulatorMessage[],
): Promise<SimulatorResult> {
  const llm = getSimulatorLlm();
  if (!llm.available) {
    throw AppError.badRequest(
      "Simulator is not configured. Set ANTHROPIC_API_KEY to use the chat tester (or place a real Vapi web call).",
    );
  }

  const db = tenantDb(orgId);
  const assistant = await db.assistant.findFirst({
    where: { id: assistantId },
    include: { tools: { include: { tool: { select: { name: true } } } } },
  });
  if (!assistant) throw AppError.notFound("Assistant not found");

  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { name: true, timezone: true },
  });
  const tz = org?.timezone ?? "UTC";

  // Build the tool set from the assistant's selected registry tools (fall back to the
  // built-ins so a not-yet-configured assistant still demos usefully).
  const selectedNames = assistant.tools
    .map((s) => s.tool.name)
    .filter((n) => TOOL_REGISTRY[n]);
  const names = selectedNames.length
    ? selectedNames
    : builtinToolDefs().map((d) => d.name);
  const tools: SimulatorTool[] = names.map((n) => {
    const e = TOOL_REGISTRY[n];
    return { name: e.name, description: e.description, parameters: e.parameters };
  });

  // Scope tool execution to this assistant's selected services/staff (matches a live call).
  const scope = await getAssistantScope(orgId, assistantId);

  const today = DateTime.now().setZone(tz).toISODate();
  const persona =
    assistant.prompt?.trim() ||
    `You are ${assistant.name}, a friendly phone receptionist for ${org?.name ?? "the business"}.`;
  const system = [
    persona,
    "",
    `Today is ${today} (timezone ${tz}).`,
    "Before checking availability or booking, call list_services to find the right service.",
    "Collect the caller's name and phone number. Confirm the details out loud before calling any write tool (book_appointment, cancel_booking, reschedule_booking).",
    "Pass ISO-8601 datetimes in the business timezone. Keep replies short and conversational, as if speaking on a phone call.",
  ].join("\n");

  return llm.runConversation({
    system,
    messages,
    tools,
    executeTool: (name, args) => runTool(orgId, scope, name, args),
  });
}
