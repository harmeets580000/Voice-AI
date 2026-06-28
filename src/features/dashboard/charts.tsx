"use client";

import { useId } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { Card } from "@shared/ui/primitives";
import { dayLabel } from "./format";

// Theme-token colors so charts adapt to light/dark + per-org theme.
const PALETTE = [
  "var(--accent)",
  "var(--positive)",
  "var(--accent-soft)",
  "var(--muted)",
  "var(--danger)",
  "var(--faint)",
];
const axisTick = { fill: "var(--faint)", fontSize: 11 };
const tooltipStyle = {
  background: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  color: "var(--text)",
  fontSize: 12,
};

export function ChartCard({
  title,
  action,
  children,
  className,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={className}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium text-text">{title}</h3>
        {action}
      </div>
      {children}
    </Card>
  );
}

function NoData({ height }: { height: number }) {
  return (
    <div
      style={{ height }}
      className="flex items-center justify-center text-sm text-muted"
    >
      No data yet
    </div>
  );
}

export function AreaTrend({
  data,
  color = "var(--accent)",
  height = 200,
}: {
  data: { date: string; value: number }[];
  color?: string;
  height?: number;
}) {
  const id = "g" + useId().replace(/:/g, "");
  if (!data.some((d) => d.value > 0)) return <NoData height={height} />;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: -18 }}>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.28} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="var(--border)" vertical={false} />
        <XAxis
          dataKey="date"
          tickFormatter={dayLabel}
          tick={axisTick}
          axisLine={false}
          tickLine={false}
          minTickGap={28}
        />
        <YAxis
          tick={axisTick}
          axisLine={false}
          tickLine={false}
          width={36}
          allowDecimals={false}
        />
        <Tooltip
          contentStyle={tooltipStyle}
          labelFormatter={(l) => dayLabel(String(l))}
        />
        <Area
          type="monotone"
          dataKey="value"
          stroke={color}
          strokeWidth={2}
          fill={`url(#${id})`}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function Bars({
  data,
  color = "var(--accent)",
  height = 200,
  labelMap,
}: {
  data: { key: string; count: number }[];
  color?: string;
  height?: number;
  labelMap?: Record<string, string>;
}) {
  const rows = data.map((d) => ({ ...d, label: labelMap?.[d.key] ?? d.key }));
  if (!rows.some((r) => r.count > 0)) return <NoData height={height} />;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={rows} margin={{ top: 6, right: 8, bottom: 0, left: -18 }}>
        <CartesianGrid stroke="var(--border)" vertical={false} />
        <XAxis dataKey="label" tick={axisTick} axisLine={false} tickLine={false} />
        <YAxis
          tick={axisTick}
          axisLine={false}
          tickLine={false}
          width={36}
          allowDecimals={false}
        />
        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "var(--surface)" }} />
        <Bar dataKey="count" fill={color} radius={[4, 4, 0, 0]} maxBarSize={56} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function Donut({
  data,
  height = 200,
  labelMap,
}: {
  data: { key: string; count: number }[];
  height?: number;
  labelMap?: Record<string, string>;
}) {
  const rows = data
    .filter((d) => d.count > 0)
    .map((d) => ({ ...d, label: labelMap?.[d.key] ?? d.key }));
  if (rows.length === 0) return <NoData height={height} />;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie
          data={rows}
          dataKey="count"
          nameKey="label"
          innerRadius="55%"
          outerRadius="80%"
          paddingAngle={2}
          stroke="var(--card)"
        >
          {rows.map((_, i) => (
            <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
          ))}
        </Pie>
        <Tooltip contentStyle={tooltipStyle} />
        <Legend wrapperStyle={{ fontSize: 12, color: "var(--muted)" }} />
      </PieChart>
    </ResponsiveContainer>
  );
}
