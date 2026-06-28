import { describe, it, expect } from "vitest";
import { CreateToolRequest, UpdateToolRequest } from "@contracts/vapi";

describe("CreateToolRequest", () => {
  it("accepts a valid custom tool", () => {
    const r = CreateToolRequest.safeParse({
      name: "get_order_status",
      serverUrl: "https://api.example.com/tool",
      description: "Look up an order",
      parameters: { type: "object", properties: {} },
    });
    expect(r.success).toBe(true);
  });

  it("rejects a name with spaces or symbols", () => {
    expect(
      CreateToolRequest.safeParse({
        name: "bad name!",
        serverUrl: "https://api.example.com/tool",
      }).success,
    ).toBe(false);
  });

  it("rejects a non-URL server URL", () => {
    expect(
      CreateToolRequest.safeParse({ name: "ok_tool", serverUrl: "not-a-url" })
        .success,
    ).toBe(false);
  });

  it("requires a server URL", () => {
    expect(CreateToolRequest.safeParse({ name: "ok_tool" }).success).toBe(false);
  });
});

describe("UpdateToolRequest", () => {
  it("allows partial updates (incl. empty)", () => {
    expect(UpdateToolRequest.safeParse({ enabled: false }).success).toBe(true);
    expect(UpdateToolRequest.safeParse({}).success).toBe(true);
  });

  it("rejects a non-URL server URL", () => {
    expect(UpdateToolRequest.safeParse({ serverUrl: "nope" }).success).toBe(false);
  });
});
