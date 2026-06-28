import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the Vapi client so the real SDK is never loaded and no network calls happen.
const hc = vi.hoisted(() => {
  class VapiError extends Error {
    statusCode?: number;
    constructor(message: string, statusCode?: number) {
      super(message);
      this.name = "VapiError";
      this.statusCode = statusCode;
    }
  }
  return { getVapiClient: vi.fn(), VapiError };
});

vi.mock("@server/adapters/voice/vapi/vapi.client", () => ({
  getVapiClient: hc.getVapiClient,
  VapiError: hc.VapiError,
}));

import { runVapiTest } from "@server/adapters/voice/vapi/vapi.tester";

beforeEach(() => {
  hc.getVapiClient.mockReset();
});

describe("vapi.tester adapter dispatch", () => {
  it("listAssistants → calls assistants.list with the default limit and returns data", async () => {
    const list = vi.fn().mockResolvedValue([{ id: "a1" }]);
    hc.getVapiClient.mockReturnValue({ assistants: { list } });

    const res = await runVapiTest("k", "listAssistants", {});

    expect(list).toHaveBeenCalledWith({ limit: 100 });
    expect(res.ok).toBe(true);
    expect(res.statusCode).toBe(200);
    expect(res.data).toEqual([{ id: "a1" }]);
  });

  it("getAssistant → passes the id through", async () => {
    const get = vi.fn().mockResolvedValue({ id: "a1" });
    hc.getVapiClient.mockReturnValue({ assistants: { get } });

    const res = await runVapiTest("k", "getAssistant", { id: "a1" });

    expect(get).toHaveBeenCalledWith("a1");
    expect(res.ok).toBe(true);
  });

  it("getAssistant without an id → ok:false with a clear error", async () => {
    hc.getVapiClient.mockReturnValue({ assistants: { get: vi.fn() } });

    const res = await runVapiTest("k", "getAssistant", {});

    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/assistant id/i);
  });

  it("listCalls → adds the assistantId filter when provided", async () => {
    const callsList = vi.fn().mockResolvedValue([]);
    hc.getVapiClient.mockReturnValue({ calls: { list: callsList } });

    await runVapiTest("k", "listCalls", { assistantId: "a1", limit: 10 });

    expect(callsList).toHaveBeenCalledWith({ assistantId: "a1", limit: 10 });
  });

  it("captures a VapiError's status code into the result", async () => {
    const err = new hc.VapiError("unauthorized", 401);
    hc.getVapiClient.mockReturnValue({
      assistants: { list: vi.fn().mockRejectedValue(err) },
    });

    const res = await runVapiTest("k", "validateKey", {});

    expect(res.ok).toBe(false);
    expect(res.statusCode).toBe(401);
    expect(res.error).toMatch(/unauthorized/i);
  });
});
