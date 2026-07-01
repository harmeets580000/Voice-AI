"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@shared/ui/AppShell";
import { api } from "@shared/api/client";
import { PageContainer, PageHeader, cx } from "@shared/ui/primitives";
import { StatTile } from "@shared/ui/StatTile";
import { PhoneOutgoing, Target, TrendingUp, DollarSign } from "lucide-react";
import { AreaTrend, Bars, ChartCard } from "@features/dashboard/charts";
import type {
  SalesDashboardResponse,
  SalesDashboardPeriod,
} from "@contracts/outbound-dashboard";

const STAGE_LABELS: Record<string, string> = {
  NEW: "New",
  CONTACTED: "Contacted",
  QUALIFIED: "Qualified",
  PROPOSAL: "Proposal",
  WON: "Won",
  LOST: "Lost",
};

const PERIODS: SalesDashboardPeriod[] = ["7d", "30d", "90d"];

export default function OutboundDashboardRoute() {
  return (
    <AppShell>
      <SalesDashboard />
    </AppShell>
  );
}

function SalesDashboard() {
  const [period, setPeriod] = useState<SalesDashboardPeriod>("30d");

  const { data, isLoading } = useQuery({
    queryKey: ["outbound-dashboard", period],
    queryFn: () =>
      api.get<SalesDashboardResponse>(`/outbound/dashboard?period=${period}`),
    staleTime: 60_000,
  });

  return (
    <PageContainer size="wide">
      <PageHeader
        title="Sales dashboard"
        subtitle="Outbound performance + pipeline health."
        actions={
          <div
            role="tablist"
            className="flex gap-1 rounded-lg border border-border p-0.5"
          >
            {PERIODS.map((p) => (
              <button
                key={p}
                role="tab"
                aria-selected={period === p}
                onClick={() => setPeriod(p)}
                className={cx(
                  "rounded-md px-3 py-1 text-xs font-medium transition-colors",
                  period === p
                    ? "bg-accent text-on-accent"
                    : "text-muted hover:text-text",
                )}
              >
                {p}
              </button>
            ))}
          </div>
        }
      />

      {isLoading || !data ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <StatTile
              label="Dials"
              value={data.kpis.dials.toLocaleString()}
              icon={<PhoneOutgoing size={16} />}
            />
            <StatTile
              label="Leads created"
              value={data.kpis.leadsCreated.toLocaleString()}
              icon={<Target size={16} />}
            />
            <StatTile
              label="Conversion"
              value={`${data.kpis.conversionPct}%`}
              icon={<TrendingUp size={16} />}
            />
            <StatTile
              label="Pipeline value"
              value={`$${data.kpis.pipelineValue.toLocaleString()}`}
              icon={<DollarSign size={16} />}
            />
            <StatTile
              label="Connect rate"
              value="—"
              hint="available at runtime"
            />
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <ChartCard title="Leads over time">
              <AreaTrend data={data.trend} />
            </ChartCard>
            <ChartCard title="Pipeline by stage">
              <Bars data={data.funnel} labelMap={STAGE_LABELS} />
            </ChartCard>
          </div>

          <ChartCard title="Campaign performance (queued)">
            <Bars data={data.campaignPerf} color="var(--positive)" />
          </ChartCard>
        </div>
      )}
    </PageContainer>
  );
}
