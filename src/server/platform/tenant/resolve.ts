/**
 * Pure tenant resolution — given the authenticated user and the per-request org signal
 * (the super-admin org switcher's X-Org-Id), decide the ACTIVE organization for this
 * request. No I/O here so it's trivially unit-testable (tests U-ISO-11..14).
 *
 * Rules (doc 03 §1.1.2):
 *   - org_admin / org_staff: active org = their own org; passing a different org → 403.
 *   - super_admin: active org = requested org (X-Org-Id), or null = platform view.
 */

import { Role } from "@domain/enums";
import { AppError } from "@server/platform/http/errors";

export interface TenantPrincipal {
  role: Role;
  /** The user's own org id (null for super_admin). */
  userOrgId: string | null;
}

/**
 * @returns the active organization id, or null for a super-admin platform (all-orgs) view.
 * @throws AppError(forbidden) if an org user requests a different org.
 */
export function resolveActiveOrganizationId(
  principal: TenantPrincipal,
  requestedOrgId: string | null | undefined,
): string | null {
  const requested = requestedOrgId || null;

  if (principal.role === Role.SUPER_ADMIN) {
    // Super-admin chooses via X-Org-Id; none selected => platform view.
    return requested;
  }

  // Org users are locked to their own org.
  if (!principal.userOrgId) {
    throw AppError.forbidden("Organization user has no organization");
  }
  if (requested && requested !== principal.userOrgId) {
    throw AppError.forbidden("Cannot act on another organization");
  }
  return principal.userOrgId;
}

/**
 * Like the above, but for routes that REQUIRE an active org (most customer-data routes).
 * Super-admin must have selected an org. Throws if there is no active org.
 */
export function requireActiveOrganizationId(
  principal: TenantPrincipal,
  requestedOrgId: string | null | undefined,
): string {
  const orgId = resolveActiveOrganizationId(principal, requestedOrgId);
  if (!orgId) {
    throw AppError.badRequest(
      "No active organization selected. Super-admin must select an organization for this action.",
    );
  }
  return orgId;
}
