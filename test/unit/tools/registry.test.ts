import { describe, it, expect } from "vitest";
import {
  TOOL_REGISTRY,
  builtinToolDefs,
  toolCatalog,
  runTool,
} from "@server/features/receptionist-tools/tools.registry";
import { ToolName } from "@domain/enums";

describe("tool registry (M-A3)", () => {
  it("every tool exposes a non-empty JSON-schema object for the LLM", () => {
    for (const def of toolCatalog()) {
      const p = def.parameters as { type?: string; properties?: object };
      expect(p.type).toBe("object");
      expect(p.properties).toBeTypeOf("object");
      expect(def.description.length).toBeGreaterThan(0);
    }
  });

  it("the catalog covers every ToolName and marks the 3 built-ins", () => {
    const names = toolCatalog().map((d) => d.name).sort();
    expect(names).toEqual(Object.values(ToolName).sort());

    const builtins = builtinToolDefs().map((d) => d.name).sort();
    expect(builtins).toEqual([
      ToolName.BOOK_APPOINTMENT,
      ToolName.CHECK_AVAILABILITY,
      ToolName.LOOKUP_CUSTOMER,
    ].sort());
    expect(builtinToolDefs().every((d) => d.builtin)).toBe(true);
  });

  it("runTool rejects an unknown tool", async () => {
    await expect(runTool("org_1", null, "no_such_tool", {})).rejects.toThrow(
      /Unknown tool/,
    );
  });

  it("every registry entry has a handler", () => {
    for (const entry of Object.values(TOOL_REGISTRY)) {
      expect(entry.handler).toBeTypeOf("function");
    }
  });
});
