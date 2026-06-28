import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "@server/platform/auth/password";

describe("password hashing (U-AUTH-01, U-AUTH-02)", () => {
  it("U-AUTH-01: hashes then verifies the correct password", async () => {
    const hash = await hashPassword("s3cret-pass");
    expect(hash).not.toBe("s3cret-pass");
    expect(await verifyPassword("s3cret-pass", hash)).toBe(true);
  });

  it("U-AUTH-02: verifying a wrong password returns false", async () => {
    const hash = await hashPassword("s3cret-pass");
    expect(await verifyPassword("wrong-pass", hash)).toBe(false);
  });
});
