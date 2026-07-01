import { handleRoute, ok } from "@server/platform/http/responses";
import { withOutboundOrg } from "@server/features/outbound/guard";
import { getSalesDashboard } from "@server/features/outbound/sales-analytics.service";
import { SalesDashboardPeriod } from "@contracts/outbound-dashboard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handleRoute(async (req) => {
  const { organizationId } = await withOutboundOrg(req);
  const period = SalesDashboardPeriod.catch("30d").parse(
    new URL(req.url).searchParams.get("period") ?? "30d",
  );
  return ok(await getSalesDashboard(organizationId, period));
});
