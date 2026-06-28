import { describe, it, expect } from "vitest";
import { Role } from "@domain/enums";
import {
  resolveActiveOrganizationId,
  requireActiveOrganizationId,
} from "@server/platform/tenant/resolve";
import { AppError } from "@server/platform/http/errors";

describe("tenant resolution (U-ISO-11..14)", () => {
  it("U-ISO-11: org_admin resolves active org = own org", () => {
    const orgId = resolveActiveOrganizationId(
      { role: Role.ORG_ADMIN, userOrgId: "orgA" },
      undefined,
    );
    expect(orgId).toBe("orgA");
  });

  it("U-ISO-11b: org_admin passing its OWN org id is allowed", () => {
    const orgId = resolveActiveOrganizationId(
      { role: Role.ORG_ADMIN, userOrgId: "orgA" },
      "orgA",
    );
    expect(orgId).toBe("orgA");
  });

  it("U-ISO-12: org_admin passing a DIFFERENT org id is rejected (403)", () => {
    expect(() =>
      resolveActiveOrganizationId(
        { role: Role.ORG_ADMIN, userOrgId: "orgA" },
        "orgB",
      ),
    ).toThrow(AppError);
    try {
      resolveActiveOrganizationId(
        { role: Role.ORG_STAFF, userOrgId: "orgA" },
        "orgB",
      );
    } catch (e) {
      expect((e as AppError).status).toBe(403);
    }
  });

  it("U-ISO-13: super_admin with X-Org-Id=A resolves active org = A", () => {
    const orgId = resolveActiveOrganizationId(
      { role: Role.SUPER_ADMIN, userOrgId: null },
      "orgA",
    );
    expect(orgId).toBe("orgA");
  });

  it("U-ISO-14: super_admin with no X-Org-Id resolves to platform view (null)", () => {
    const orgId = resolveActiveOrganizationId(
      { role: Role.SUPER_ADMIN, userOrgId: null },
      undefined,
    );
    expect(orgId).toBeNull();
  });

  it("requireActiveOrganizationId throws for super-admin with no org selected", () => {
    expect(() =>
      requireActiveOrganizationId(
        { role: Role.SUPER_ADMIN, userOrgId: null },
        null,
      ),
    ).toThrow(AppError);
  });

  it("requireActiveOrganizationId returns the org for an org user", () => {
    expect(
      requireActiveOrganizationId(
        { role: Role.ORG_ADMIN, userOrgId: "orgA" },
        null,
      ),
    ).toBe("orgA");
  });
});
