"use client";

import { Phone, CalendarCheck, DollarSign, UserPlus } from "lucide-react";
import { Card, Badge } from "@shared/ui/primitives";
import { StatTile } from "@shared/ui/StatTile";
import { useFormatDate } from "@features/settings/SettingsProvider";
import type { OrgDashboard as OrgDashboardData } from "@contracts/analytics";
import { AreaTrend, Bars, Donut, ChartCard } from "./charts";
import { nfmt, cfmt, dur, STATUS_LABELS, SOURCE_LABELS } from "./format";

export function OrgDashboard({ data }: { data: OrgDashboardData }) {
  const formatDate = useFormatDate();
  const k = data.kpis;

  return (
    <div className="space-y-5">
      {/* KPI tiles */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Calls" value={nfmt(k.calls.value)} deltaPct={k.calls.deltaPct} icon={<Phone size={16} />} />
        <StatTile label="Bookings" value={nfmt(k.bookings.value)} deltaPct={k.bookings.deltaPct} icon={<CalendarCheck size={16} />} />
        <StatTile label="Revenue" value={cfmt(k.revenue.value)} deltaPct={k.revenue.deltaPct} icon={<DollarSign size={16} />} />
        <StatTile label="New customers" value={nfmt(k.newCustomers.value)} deltaPct={k.newCustomers.deltaPct} icon={<UserPlus size={16} />} />
        <StatTile label="AI conversion" value={`${k.conversionPct}%`} hint="phone bookings ÷ calls" />
        <StatTile label="Cancel / no-show" value={`${k.cancellationRatePct}%`} hint="of bookings" />
        <StatTile label="Avg call" value={dur(k.avgCallDurationSeconds)} />
        <StatTile label="Call cost" value={cfmt(k.totalCallCost)} hint="AI spend" />
      </div>

      {/* Trends */}
      <div className="grid gap-4 lg:grid-cols-3">
        <ChartCard title="Calls / day">
          <AreaTrend data={data.trends.calls} />
        </ChartCard>
        <ChartCard title="Bookings / day">
          <AreaTrend data={data.trends.bookings} color="var(--positive)" />
        </ChartCard>
        <ChartCard title="Revenue / day">
          <AreaTrend data={data.trends.revenue} color="var(--accent-soft)" />
        </ChartCard>
      </div>

      {/* Breakdowns */}
      <div className="grid gap-4 lg:grid-cols-3">
        <ChartCard title="Bookings by status">
          <Donut data={data.byStatus} labelMap={STATUS_LABELS} />
        </ChartCard>
        <ChartCard title="Bookings by source">
          <Bars data={data.bySource} labelMap={SOURCE_LABELS} />
        </ChartCard>
        <ChartCard title="Call outcomes">
          <Bars data={data.callEndedReasons} color="var(--muted)" />
        </ChartCard>
      </div>

      {/* Lists */}
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Top services">
          <MiniTable
            head={["Service", "Bookings", "Revenue"]}
            rows={data.topServices.map((s) => [s.name, nfmt(s.bookings), cfmt(s.revenue)])}
            empty="No bookings in this period"
          />
        </ChartCard>
        <ChartCard title="Staff workload">
          <MiniTable
            head={["Staff", "Bookings", "Booked hrs"]}
            rows={data.staff.map((s) => [
              s.name,
              nfmt(s.bookings),
              (s.bookedMinutes / 60).toFixed(1),
            ])}
            empty="No bookings in this period"
          />
        </ChartCard>
        <ChartCard title="Upcoming appointments">
          <MiniTable
            head={["When", "Customer", "Service", "Staff"]}
            rows={data.upcoming.map((u) => [
              formatDate(u.startDatetime),
              u.customer ?? "—",
              u.service ?? "—",
              u.staff ?? "—",
            ])}
            empty="Nothing scheduled"
          />
        </ChartCard>
        <ChartCard title="Recent calls">
          <MiniTable
            head={["When", "From", "Duration", "Summary"]}
            rows={data.recentCalls.map((c) => [
              formatDate(c.createdAt),
              c.from ?? "—",
              dur(c.durationSeconds),
              c.summary ?? "—",
            ])}
            empty="No calls yet"
          />
        </ChartCard>
      </div>

      {/* Vapi health */}
      <Card className="space-y-2 text-sm">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium text-text">Vapi health</h3>
          <Badge tone={data.vapiHealth.provisioned ? "success" : "warning"}>
            {data.vapiHealth.provisioned ? "Provisioned" : "Not provisioned"}
          </Badge>
          {data.vapiHealth.syncStatus && (
            <Badge tone={data.vapiHealth.syncStatus === "synced" ? "success" : "neutral"}>
              {data.vapiHealth.syncStatus}
            </Badge>
          )}
        </div>
        <div className="grid gap-x-8 gap-y-1 sm:grid-cols-2">
          <HealthRow label="Phone number" value={data.vapiHealth.phoneNumber} mono />
          <HealthRow label="Assistant id" value={data.vapiHealth.assistantId} mono />
          <HealthRow label="Last synced" value={data.vapiHealth.lastSyncedAt} />
          <HealthRow label="Sync error" value={data.vapiHealth.syncError} />
        </div>
      </Card>
    </div>
  );
}

function MiniTable({
  head,
  rows,
  empty,
}: {
  head: string[];
  rows: (string | number)[][];
  empty: string;
}) {
  if (rows.length === 0)
    return <p className="py-6 text-center text-sm text-muted">{empty}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase text-muted">
            {head.map((h) => (
              <th key={h} className="px-2 py-1.5 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-border/60 last:border-0">
              {r.map((c, j) => (
                <td
                  key={j}
                  className={
                    j === 0
                      ? "px-2 py-1.5 text-text"
                      : "px-2 py-1.5 text-muted"
                  }
                >
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function HealthRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string | null;
  mono?: boolean;
}) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted">{label}</span>
      <span className={mono ? "truncate font-mono text-xs text-text" : "text-text"}>
        {value ?? "—"}
      </span>
    </div>
  );
}
