/**
 * Request-scoped auth + tenant context for Route Handlers. Reads the access JWT from the
 * httpOnly cookie, then resolves the active organization (org users → own org; super-admin
 * → X-Org-Id header or platform view). This is the single entry point guards use.
 */

import { AppError } from "@server/platform/http/errors";
import { readAccessToken } from "./cookies";
import { verifyToken } from "./jwt";
import { assertRole, type Principal } from "./rbac";
import {
  requireActiveOrganizationId,
  resolveActiveOrganizationId,
} from "@server/platform/tenant/resolve";
import type { Role } from "@domain/enums";

/** The X-Org-Id header set by the super-admin org switcher. */
export function getRequestedOrgId(req: Request): string | null {
  return req.headers.get("x-org-id");
}

/** Returns the authenticated principal, or null if not logged in / token invalid. */
export async function getPrincipal(): Promise<Principal | null> {
  const token = await readAccessToken();
  if (!token) return null;
  try {
    const p = await verifyToken(token, "access");
    return { userId: p.sub, role: p.role, organizationId: p.organizationId };
  } catch {
    return null;
  }
}

/** Throws 401 if not authenticated. */
export async function requireAuth(): Promise<Principal> {
  const principal = await getPrincipal();
  if (!principal) throw AppError.unauthorized();
  return principal;
}

/** Authenticated + role-restricted. */
export async function requireRole(allowed: Role[]): Promise<Principal> {
  const principal = await requireAuth();
  assertRole(principal, allowed);
  return principal;
}

export interface AuthedContext {
  principal: Principal;
  /** The active org for this request (null only for super-admin platform view). */
  organizationId: string | null;
}

/** Authenticated; active org resolved (may be null for super-admin platform view). */
export async function withActiveOrg(req: Request): Promise<AuthedContext> {
  const principal = await requireAuth();
  const organizationId = resolveActiveOrganizationId(
    { role: principal.role, userOrgId: principal.organizationId },
    getRequestedOrgId(req),
  );
  return { principal, organizationId };
}

/** Authenticated; an active org is REQUIRED (most customer-data routes). */
export async function withRequiredOrg(
  req: Request,
): Promise<{ principal: Principal; organizationId: string }> {
  const principal = await requireAuth();
  const organizationId = requireActiveOrganizationId(
    { role: principal.role, userOrgId: principal.organizationId },
    getRequestedOrgId(req),
  );
  return { principal, organizationId };
}
