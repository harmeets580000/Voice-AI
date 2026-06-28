import { describe, it, expect, beforeAll } from "vitest";
import crypto from "node:crypto";

// Ensure a valid 32-byte key is present before importing the module (env is read at use).
beforeAll(() => {
  if (!process.env.CREDENTIAL_ENCRYPTION_KEY) {
    process.env.CREDENTIAL_ENCRYPTION_KEY = crypto
      .randomBytes(32)
      .toString("base64");
  }
});

describe("secret encryption (U-SEC-01..03)", () => {
  it("U-SEC-01: encrypt then decrypt round-trips to the original", async () => {
    const { encryptSecret, decryptSecret } = await import(
      "@server/platform/crypto/secretBox"
    );
    const secret = "sk_live_abcdef123456";
    const enc = encryptSecret(secret);
    expect(decryptSecret(enc)).toBe(secret);
  });

  it("U-SEC-02: stored value is ciphertext, not plaintext", async () => {
    const { encryptSecret } = await import(
      "@server/platform/crypto/secretBox"
    );
    const secret = "sk_live_abcdef123456";
    const enc = encryptSecret(secret);
    expect(enc).not.toContain(secret);
    expect(enc.startsWith("v1:")).toBe(true);
    // Two encryptions of the same plaintext differ (random IV).
    expect(encryptSecret(secret)).not.toBe(enc);
  });

  it("U-SEC-03: only last-4 is exposed for display", async () => {
    const { last4 } = await import("@server/platform/crypto/secretBox");
    expect(last4("sk_live_abcdef123456")).toBe("3456");
  });

  it("tampered ciphertext fails authentication", async () => {
    const { encryptSecret, decryptSecret } = await import(
      "@server/platform/crypto/secretBox"
    );
    const enc = encryptSecret("secret");
    const tampered = enc.slice(0, -2) + (enc.endsWith("A") ? "BB" : "AA");
    expect(() => decryptSecret(tampered)).toThrow();
  });
});
