import { handleRoute, ok } from "@server/platform/http/responses";
import { DashboardPeriod, type DashboardResponse } from "@contracts/analytics";
import { withActiveOrg } from "@server/platform/auth/context";
import { AppError } from "@server/platform/http/errors";
import { Role } from "@domain/enums";
import {
  getOrgDashboard,
  getPlatformDashboard,
} from "@server/features/analytics/analytics.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Dashboard analytics. Org users (and super-admin acting-as an org) get their org's dashboard;
 * a super-admin with no active org gets the platform-wide dashboard.
 */
export const GET = handleRoute(async (req) => {
  const { principal, organizationId } = await withActiveOrg(req);
  const periodParam = new URL(req.url).searchParams.get("period");
  const period = DashboardPeriod.catch("30d").parse(periodParam ?? "30d");

  if (organizationId) {
    const res: DashboardResponse = await getOrgDashboard(organizationId, period);
    return ok(res);
  }
  if (principal.role !== Role.SUPER_ADMIN) throw AppError.forbidden();
  const res: DashboardResponse = await getPlatformDashboard(period);
  return ok(res);
});
