import { describe, it, expect } from "vitest";
import { VapiTestRequest } from "@contracts/vapi-tester";

describe("VapiTestRequest contract", () => {
  it("rejects keySource 'pasted' without an apiKey", () => {
    const r = VapiTestRequest.safeParse({
      operation: "validateKey",
      keySource: "pasted",
    });
    expect(r.success).toBe(false);
  });

  it("rejects keySource 'org' without an organizationId", () => {
    const r = VapiTestRequest.safeParse({
      operation: "listAssistants",
      keySource: "org",
    });
    expect(r.success).toBe(false);
  });

  it("accepts a valid pasted request", () => {
    const r = VapiTestRequest.safeParse({
      operation: "validateKey",
      keySource: "pasted",
      apiKey: "sk-123",
    });
    expect(r.success).toBe(true);
  });

  it("accepts a platform request without any key fields", () => {
    const r = VapiTestRequest.safeParse({
      operation: "listVoices",
      keySource: "platform",
    });
    expect(r.success).toBe(true);
  });

  it("rejects an unknown operation", () => {
    const r = VapiTestRequest.safeParse({
      operation: "deleteAssistant",
      keySource: "platform",
    });
    expect(r.success).toBe(false);
  });
});
