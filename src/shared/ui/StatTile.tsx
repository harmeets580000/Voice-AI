"use client";

import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { cx } from "./primitives";

/** A KPI tile: label + big value + optional % delta (green up / red down) + optional hint/icon. */
export function StatTile({
  label,
  value,
  deltaPct,
  hint,
  icon,
}: {
  label: string;
  value: string;
  deltaPct?: number | null;
  hint?: string;
  icon?: React.ReactNode;
}) {
  const up = (deltaPct ?? 0) >= 0;
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted">
          {label}
        </span>
        {icon && <span className="text-faint">{icon}</span>}
      </div>
      <div className="mt-1.5 text-2xl font-semibold tracking-tight text-text">
        {value}
      </div>
      {(deltaPct != null || hint) && (
        <div className="mt-1 flex items-center gap-2 text-xs">
          {deltaPct != null && (
            <span
              className={cx(
                "inline-flex items-center gap-0.5 font-medium",
                up ? "text-positive" : "text-danger",
              )}
            >
              {up ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
              {Math.abs(deltaPct)}%
            </span>
          )}
          {hint && <span className="text-faint">{hint}</span>}
        </div>
      )}
    </div>
  );
}
