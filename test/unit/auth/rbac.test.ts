import { describe, it, expect } from "vitest";
import {
  hasRole,
  atLeast,
  assertRole,
  assertSuperAdmin,
  type Principal,
} from "@server/platform/auth/rbac";
import { Role } from "@domain/enums";
import { AppError } from "@server/platform/http/errors";

const principal = (role: Role): Principal => ({
  userId: "u",
  role,
  organizationId: role === Role.SUPER_ADMIN ? null : "orgA",
});

describe("RBAC role guard matrix (U-AUTH-06)", () => {
  it("hasRole allow/deny", () => {
    expect(hasRole(Role.SUPER_ADMIN, [Role.SUPER_ADMIN])).toBe(true);
    expect(hasRole(Role.ORG_ADMIN, [Role.SUPER_ADMIN])).toBe(false);
    expect(hasRole(Role.ORG_STAFF, [Role.ORG_ADMIN, Role.ORG_STAFF])).toBe(true);
  });

  it("atLeast respects rank super_admin > org_admin > org_staff", () => {
    expect(atLeast(Role.SUPER_ADMIN, Role.ORG_ADMIN)).toBe(true);
    expect(atLeast(Role.ORG_ADMIN, Role.ORG_ADMIN)).toBe(true);
    expect(atLeast(Role.ORG_STAFF, Role.ORG_ADMIN)).toBe(false);
  });

  it("assertRole throws 403 when role not allowed", () => {
    expect(() => assertRole(principal(Role.ORG_ADMIN), [Role.SUPER_ADMIN])).toThrow(
      AppError,
    );
    try {
      assertRole(principal(Role.ORG_STAFF), [Role.ORG_ADMIN]);
    } catch (e) {
      expect((e as AppError).status).toBe(403);
    }
  });

  it("assertRole passes when role allowed", () => {
    expect(() =>
      assertRole(principal(Role.ORG_ADMIN), [Role.ORG_ADMIN, Role.SUPER_ADMIN]),
    ).not.toThrow();
  });

  it("assertSuperAdmin only allows super_admin", () => {
    expect(() => assertSuperAdmin(principal(Role.SUPER_ADMIN))).not.toThrow();
    expect(() => assertSuperAdmin(principal(Role.ORG_ADMIN))).toThrow(AppError);
  });
});
