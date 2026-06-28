/**
 * Pure role-based access checks. Kept I/O-free so the allow/deny matrix is unit-testable
 * (test U-AUTH-06). Route guards (guards.ts) build on these.
 */

import { Role } from "@domain/enums";
import { AppError } from "@server/platform/http/errors";

export interface Principal {
  userId: string;
  role: Role;
  organizationId: string | null;
}

/** True if `role` is one of the allowed roles. */
export function hasRole(role: Role, allowed: Role[]): boolean {
  return allowed.includes(role);
}

/** Super-admin can do anything an org_admin can; org_admin outranks org_staff. */
const RANK: Record<Role, number> = {
  [Role.SUPER_ADMIN]: 3,
  [Role.ORG_ADMIN]: 2,
  [Role.ORG_STAFF]: 1,
};

export function atLeast(role: Role, minimum: Role): boolean {
  return RANK[role] >= RANK[minimum];
}

export function assertRole(principal: Principal, allowed: Role[]): void {
  if (!hasRole(principal.role, allowed)) {
    throw AppError.forbidden(
      `Requires one of: ${allowed.join(", ")} (have: ${principal.role})`,
    );
  }
}

export function assertSuperAdmin(principal: Principal): void {
  assertRole(principal, [Role.SUPER_ADMIN]);
}
