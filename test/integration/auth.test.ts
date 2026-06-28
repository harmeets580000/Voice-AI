import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { hasTestDb, truncateAll, disconnect } from "./helpers/db";
import { createOrg, createUser } from "./helpers/factories";
import {
  authenticate,
  getUserById,
} from "@server/features/auth/auth.service";
import { AppError } from "@server/platform/http/errors";

describe.skipIf(!hasTestDb)("auth against the DB (I-AUTH-07/08)", () => {
  beforeEach(async () => {
    await truncateAll();
  });
  afterAll(async () => {
    await disconnect();
  });

  it("I-AUTH-07: valid credentials authenticate", async () => {
    const org = await createOrg();
    const user = await createUser(org.id, "org_admin", "admin@x.example.com");
    const authed = await authenticate("admin@x.example.com", "Password123!");
    expect(authed.id).toBe(user.id);
    expect(authed.role).toBe("org_admin");
  });

  it("I-AUTH-08: invalid credentials are rejected (401)", async () => {
    const org = await createOrg();
    await createUser(org.id, "org_admin", "admin2@x.example.com");
    await expect(
      authenticate("admin2@x.example.com", "wrong"),
    ).rejects.toBeInstanceOf(AppError);
    await expect(
      authenticate("missing@x.example.com", "Password123!"),
    ).rejects.toBeInstanceOf(AppError);
  });

  it("getUserById returns the active user", async () => {
    const org = await createOrg();
    const user = await createUser(org.id, "org_staff");
    const found = await getUserById(user.id);
    expect(found.role).toBe("org_staff");
  });
});
