/**
 * Secrets-at-rest: AES-256-GCM encryption for per-customer Vapi private keys.
 * Uses CREDENTIAL_ENCRYPTION_KEY (32-byte base64). Ciphertext is stored; plaintext is
 * never returned to the browser — only `last4` is ever displayed (tests U-SEC-01..03).
 *
 * Serialized form: "v1:<ivB64>:<tagB64>:<cipherB64>".
 */

import crypto from "node:crypto";
import { env } from "@server/config/env";

const ALGO = "aes-256-gcm";
const IV_BYTES = 12;
const VERSION = "v1";

function getKey(): Buffer {
  const b64 = env.CREDENTIAL_ENCRYPTION_KEY;
  if (!b64) {
    throw new Error(
      "CREDENTIAL_ENCRYPTION_KEY is not set (required to encrypt/decrypt secrets)",
    );
  }
  const key = Buffer.from(b64, "base64");
  if (key.length !== 32) {
    throw new Error(
      `CREDENTIAL_ENCRYPTION_KEY must decode to 32 bytes (got ${key.length})`,
    );
  }
  return key;
}

export function encryptSecret(plaintext: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    VERSION,
    iv.toString("base64"),
    tag.toString("base64"),
    enc.toString("base64"),
  ].join(":");
}

export function decryptSecret(serialized: string): string {
  const key = getKey();
  const parts = serialized.split(":");
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error("Malformed ciphertext");
  }
  const [, ivB64, tagB64, ctB64] = parts;
  const decipher = crypto.createDecipheriv(
    ALGO,
    key,
    Buffer.from(ivB64, "base64"),
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(ctB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

/** Last 4 chars of a secret, for display ("…aB3c"). Never expose more. */
export function last4(secret: string): string {
  return secret.slice(-4);
}
