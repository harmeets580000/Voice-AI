import { describe, it, expect } from "vitest";
import { verifyWebhookSecret } from "@server/channels/voiceWebhook";

/** Build a Request carrying (or omitting) the x-vapi-secret header. */
function reqWith(secret?: string): Request {
  return new Request("http://localhost/api/webhook/voice/tools", {
    method: "POST",
    headers: secret ? { "x-vapi-secret": secret } : {},
  });
}

describe("verifyWebhookSecret (webhook auth)", () => {
  it("accepts a request whose header matches the configured secret", () => {
    expect(() => verifyWebhookSecret(reqWith("shh"), "shh")).not.toThrow();
  });

  it("rejects a missing or mismatched secret with 401", () => {
    expect(() => verifyWebhookSecret(reqWith(), "shh")).toThrow();
    expect(() => verifyWebhookSecret(reqWith("wrong"), "shh")).toThrow();
    try {
      verifyWebhookSecret(reqWith("wrong"), "shh");
    } catch (e) {
      expect((e as { code?: string }).code).toBe("unauthorized");
    }
  });

  it("skips verification when no secret is configured (local dev)", () => {
    expect(() => verifyWebhookSecret(reqWith(), "")).not.toThrow();
    expect(() => verifyWebhookSecret(reqWith(), undefined)).not.toThrow();
  });
});
