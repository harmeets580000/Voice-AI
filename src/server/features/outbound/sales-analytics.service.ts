/**
 * Sales dashboard analytics (Product 2 §G) — read-only, org-scoped. KPIs (dials, leads created,
 * conversion, pipeline value), a leads/day trend, a 6-stage funnel, and campaign performance.
 * Connect rate is a runtime-only placeholder (not computed here).
 */

import { tenantDb } from "@server/platform/db/scoped";
import { LEAD_STAGES, OPEN_STAGES } from "./leads.service";

export type DashboardPeriod = "7d" | "30d" | "90d";

function periodDays(period: DashboardPeriod): number {
  return period === "7d" ? 7 : period === "90d" ? 90 : 30;
}

/** {date,value} for each of the last `days` days (UTC), counting occurrences. */
function bucketByDay(dates: Date[], days: number) {
  const buckets = new Map<string, number>();
  for (let i = days - 1; i >= 0; i--) {
    const key = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10);
    buckets.set(key, 0);
  }
  for (const d of dates) {
    const key = d.toISOString().slice(0, 10);
    if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }
  return [...buckets.entries()].map(([date, value]) => ({ date, value }));
}

export async function getSalesDashboard(
  orgId: string,
  period: DashboardPeriod,
) {
  const days = periodDays(period);
  const since = new Date(Date.now() - days * 86_400_000);
  const db = tenantDb(orgId);

  const [
    dials,
    leadsCreated,
    totalLeads,
    wonLeads,
    openAgg,
    stageGroups,
    trendLeads,
    campaigns,
  ] = await Promise.all([
    db.outboundCall.count({
      where: { status: "QUEUED", createdAt: { gte: since } },
    }),
    db.lead.count({ where: { createdAt: { gte: since } } }),
    db.lead.count(),
    db.lead.count({ where: { stage: "WON" } }),
    db.lead.aggregate({
      _sum: { value: true },
      where: { stage: { in: OPEN_STAGES } },
    }),
    db.lead.groupBy({ by: ["stage"], _count: { _all: true } }),
    db.lead.findMany({
      where: { createdAt: { gte: since } },
      select: { createdAt: true },
    }),
    db.campaign.findMany({ select: { name: true, statsJson: true } }),
  ]);

  const conversionPct = totalLeads > 0 ? (wonLeads / totalLeads) * 100 : 0;
  const pipelineValue = Number(openAgg._sum.value ?? 0);

  const funnel = LEAD_STAGES.map((stage) => ({
    key: stage,
    count: stageGroups.find((g) => g.stage === stage)?._count._all ?? 0,
  }));

  const trend = bucketByDay(
    trendLeads.map((l) => l.createdAt),
    days,
  );

  const campaignPerf = campaigns.map((c) => ({
    key: c.name,
    count: (c.statsJson as { queued?: number } | null)?.queued ?? 0,
  }));

  return {
    period,
    kpis: {
      dials,
      leadsCreated,
      conversionPct: Math.round(conversionPct * 10) / 10,
      pipelineValue,
    },
    trend,
    funnel,
    campaignPerf,
  };
}
