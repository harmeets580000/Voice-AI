"use client";

import { Building2, Phone, CalendarCheck, DollarSign, Users } from "lucide-react";
import { Badge, Button, Card } from "@shared/ui/primitives";
import { StatTile } from "@shared/ui/StatTile";
import { DataTable, type Column } from "@shared/ui/DataTable";
import { useAuth } from "@features/auth/AuthProvider";
import { useFormatDate } from "@features/settings/SettingsProvider";
import type { PlatformDashboard as PlatformDashboardData } from "@contracts/analytics";
import { AreaTrend, ChartCard } from "./charts";
import { nfmt, cfmt } from "./format";

type OrgRow = PlatformDashboardData["orgs"][number];

export function PlatformDashboard({ data }: { data: PlatformDashboardData }) {
  const { setActiveOrg } = useAuth();
  const formatDate = useFormatDate();
  const k = data.kpis;

  const statusTone = (s: string) =>
    s === "synced" ? "success" : s === "failed" ? "danger" : "neutral";

  const columns: Column<OrgRow>[] = [
    {
      key: "name",
      header: "Organization",
      render: (o) => (
        <div className="flex items-center gap-2">
          <span className="font-medium text-text">{o.name}</span>
          <Badge tone={o.status === "active" ? "success" : "neutral"}>
            {o.status}
          </Badge>
        </div>
      ),
    },
    { key: "calls", header: "Calls", align: "right", render: (o) => nfmt(o.calls) },
    { key: "bookings", header: "Bookings", align: "right", render: (o) => nfmt(o.bookings) },
    { key: "revenue", header: "Revenue", align: "right", render: (o) => cfmt(o.revenue) },
    {
      key: "lastActivity",
      header: "Last activity",
      render: (o) => (o.lastActivity ? formatDate(o.lastActivity) : "—"),
    },
    {
      key: "syncStatus",
      header: "Vapi",
      render: (o) =>
        o.syncStatus ? (
          <Badge tone={statusTone(o.syncStatus)}>{o.syncStatus}</Badge>
        ) : (
          <span className="text-faint">—</span>
        ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (o) => (
        <Button size="sm" variant="ghost" onClick={() => setActiveOrg(o.id)}>
          Open →
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatTile label="Organizations" value={nfmt(k.orgs)} icon={<Building2 size={16} />} />
        <StatTile label="Calls" value={nfmt(k.calls.value)} deltaPct={k.calls.deltaPct} icon={<Phone size={16} />} />
        <StatTile label="Bookings" value={nfmt(k.bookings.value)} deltaPct={k.bookings.deltaPct} icon={<CalendarCheck size={16} />} />
        <StatTile label="Revenue" value={cfmt(k.revenue.value)} deltaPct={k.revenue.deltaPct} icon={<DollarSign size={16} />} />
        <StatTile label="New customers" value={nfmt(k.customers.value)} deltaPct={k.customers.deltaPct} icon={<Users size={16} />} />
      </div>

      <Card className="flex flex-wrap items-center gap-3 text-sm">
        <span className="text-muted">Orgs by status:</span>
        {data.orgsByStatus.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1.5">
            <Badge tone={s.key === "active" ? "success" : s.key === "suspended" ? "danger" : "neutral"}>
              {s.key}
            </Badge>
            <span className="font-medium text-text">{s.count}</span>
          </span>
        ))}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Calls / day (all orgs)">
          <AreaTrend data={data.trends.calls} />
        </ChartCard>
        <ChartCard title="Bookings / day (all orgs)">
          <AreaTrend data={data.trends.bookings} color="var(--positive)" />
        </ChartCard>
      </div>

      <ChartCard title="Organizations">
        <DataTable
          columns={columns}
          rows={data.orgs}
          emptyMessage="No organizations yet"
        />
      </ChartCard>
    </div>
  );
}
