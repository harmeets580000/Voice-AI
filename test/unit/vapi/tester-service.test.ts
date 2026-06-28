import { describe, it, expect, vi, beforeEach } from "vitest";
import type { VapiTestRequest } from "@contracts/vapi-tester";

// Shared mock fns (hoisted so vi.mock factories can reference them).
const h = vi.hoisted(() => ({
  findUnique: vi.fn(),
  decryptSecret: vi.fn(),
  adapterRun: vi.fn(),
  env: { VAPI_API_KEY: "" } as { VAPI_API_KEY: string },
}));

vi.mock("@server/platform/db/client", () => ({
  prisma: { orgVapiConfig: { findUnique: h.findUnique } },
}));
vi.mock("@server/platform/crypto/secretBox", () => ({
  decryptSecret: h.decryptSecret,
}));
vi.mock("@server/adapters/voice/vapi/vapi.tester", () => ({
  runVapiTest: h.adapterRun,
}));
vi.mock("@server/config/env", () => ({ env: h.env }));

import { runVapiTest } from "@server/features/vapi-tester/vapi-tester.service";

const rawResult = {
  ok: true,
  statusCode: 200,
  durationMs: 5,
  data: { hi: true },
  error: null,
};

beforeEach(() => {
  h.findUnique.mockReset();
  h.decryptSecret.mockReset();
  h.adapterRun.mockReset().mockResolvedValue(rawResult);
  h.env.VAPI_API_KEY = "";
});

describe("vapi-tester service key resolution", () => {
  it("pasted: forwards the (trimmed) pasted key to the adapter", async () => {
    const req: VapiTestRequest = {
      operation: "validateKey",
      keySource: "pasted",
      apiKey: "  sk-123  ",
    };
    await runVapiTest(req);
    expect(h.adapterRun).toHaveBeenCalledWith("sk-123", "validateKey", {});
  });

  it("pasted: throws when no key is given", async () => {
    const req: VapiTestRequest = { operation: "validateKey", keySource: "pasted" };
    await expect(runVapiTest(req)).rejects.toThrow(/key is required/i);
    expect(h.adapterRun).not.toHaveBeenCalled();
  });

  it("platform: uses env.VAPI_API_KEY", async () => {
    h.env.VAPI_API_KEY = "sk-platform";
    const req: VapiTestRequest = { operation: "listVoices", keySource: "platform" };
    await runVapiTest(req);
    expect(h.adapterRun).toHaveBeenCalledWith("sk-platform", "listVoices", {});
  });

  it("platform: throws when no platform key is configured", async () => {
    const req: VapiTestRequest = { operation: "listVoices", keySource: "platform" };
    await expect(runVapiTest(req)).rejects.toThrow(/platform Vapi key/i);
  });

  it("org: decrypts and uses the org's stored key", async () => {
    h.findUnique.mockResolvedValue({ vapiPrivateKeyEnc: "enc-blob" });
    h.decryptSecret.mockReturnValue("sk-org");
    const req: VapiTestRequest = {
      operation: "validateKey",
      keySource: "org",
      organizationId: "org1",
    };
    await runVapiTest(req);
    expect(h.decryptSecret).toHaveBeenCalledWith("enc-blob");
    expect(h.adapterRun).toHaveBeenCalledWith("sk-org", "validateKey", {});
  });

  it("org: falls back to the platform key when the org has none", async () => {
    h.findUnique.mockResolvedValue(null);
    h.env.VAPI_API_KEY = "sk-platform";
    const req: VapiTestRequest = {
      operation: "validateKey",
      keySource: "org",
      organizationId: "org1",
    };
    await runVapiTest(req);
    expect(h.decryptSecret).not.toHaveBeenCalled();
    expect(h.adapterRun).toHaveBeenCalledWith("sk-platform", "validateKey", {});
  });

  it("org: throws when neither org key nor platform key exist", async () => {
    h.findUnique.mockResolvedValue(null);
    const req: VapiTestRequest = {
      operation: "validateKey",
      keySource: "org",
      organizationId: "org1",
    };
    await expect(runVapiTest(req)).rejects.toThrow();
  });

  it("forwards params and shapes the adapter result into the response", async () => {
    h.adapterRun.mockResolvedValue({
      ok: false,
      statusCode: 401,
      durationMs: 3,
      data: null,
      error: "bad key",
    });
    const req: VapiTestRequest = {
      operation: "getCall",
      keySource: "pasted",
      apiKey: "k",
      params: { id: "call_1" },
    };
    const res = await runVapiTest(req);
    expect(h.adapterRun).toHaveBeenCalledWith("k", "getCall", { id: "call_1" });
    expect(res).toEqual({
      ok: false,
      statusCode: 401,
      durationMs: 3,
      data: null,
      error: "bad key",
    });
  });
});
