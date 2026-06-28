import { describe, it, expect } from "vitest";
import {
  signToken,
  verifyToken,
  signTokenWithExp,
  TokenError,
} from "@server/platform/auth/jwt";
import { Role } from "@domain/enums";

const base = {
  sub: "user_1",
  role: Role.ORG_ADMIN,
  organizationId: "orgA",
} as const;

describe("JWT (U-AUTH-03, U-AUTH-04, U-AUTH-05)", () => {
  it("U-AUTH-03: issues + verifies a valid access token with correct claims", async () => {
    const token = await signToken(base, "access");
    const payload = await verifyToken(token, "access");
    expect(payload.sub).toBe("user_1");
    expect(payload.role).toBe(Role.ORG_ADMIN);
    expect(payload.organizationId).toBe("orgA");
    expect(payload.typ).toBe("access");
  });

  it("U-AUTH-04: rejects an expired token", async () => {
    const past = Math.floor(Date.now() / 1000) - 10;
    const token = await signTokenWithExp(base, "access", past);
    await expect(verifyToken(token, "access")).rejects.toMatchObject({
      reason: "expired",
    });
  });

  it("U-AUTH-05: rejects a tampered/garbage token", async () => {
    await expect(verifyToken("not.a.jwt", "access")).rejects.toBeInstanceOf(
      TokenError,
    );
    const token = await signToken(base, "access");
    const tampered = token.slice(0, -2) + "xx";
    await expect(verifyToken(tampered, "access")).rejects.toBeInstanceOf(
      TokenError,
    );
  });

  it("an access token cannot be used as a refresh token (typ mismatch)", async () => {
    const token = await signToken(base, "access");
    await expect(verifyToken(token, "refresh")).rejects.toBeInstanceOf(
      TokenError,
    );
  });

  it("a refresh token verifies as refresh", async () => {
    const token = await signToken(base, "refresh");
    const payload = await verifyToken(token, "refresh");
    expect(payload.typ).toBe("refresh");
  });
});
