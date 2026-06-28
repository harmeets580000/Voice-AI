"use client";

import { useMemo, useState } from "react";
import { cx, Button } from "./primitives";

export interface Column<T> {
  key: string;
  header: string;
  /** Cell renderer; defaults to String(row[key]). */
  render?: (row: T) => React.ReactNode;
  className?: string;
  align?: "left" | "right" | "center";
}

/** Pure pagination math — exported for unit testing. */
export function paginate<T>(
  rows: T[],
  page: number,
  pageSize: number,
): { items: T[]; pageCount: number; page: number } {
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(Math.max(1, page), pageCount);
  const start = (safePage - 1) * pageSize;
  return { items: rows.slice(start, start + pageSize), pageCount, page: safePage };
}

/**
 * Reusable table: header row, separated bordered rows, hover highlight, an empty state,
 * and built-in client-side pagination. Theme-token colored (works in light/dark).
 */
export function DataTable<T extends { id?: string }>({
  columns,
  rows,
  pageSize = 10,
  emptyMessage = "No records found",
  emptyAction,
  getRowKey,
}: {
  columns: Column<T>[];
  rows: T[];
  pageSize?: number;
  emptyMessage?: string;
  emptyAction?: React.ReactNode;
  getRowKey?: (row: T, i: number) => string;
}) {
  const [page, setPage] = useState(1);
  const { items, pageCount, page: cur } = useMemo(
    () => paginate(rows, page, pageSize),
    [rows, page, pageSize],
  );

  const alignClass = (a?: string) =>
    a === "right" ? "text-right" : a === "center" ? "text-center" : "text-left";

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-surface/60 text-muted">
            {columns.map((c) => (
              <th
                key={c.key}
                className={cx(
                  "px-4 py-2.5 text-xs font-semibold uppercase tracking-wide",
                  alignClass(c.align),
                )}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-12 text-center">
                <div className="flex flex-col items-center gap-3 text-muted">
                  <EmptyGlyph />
                  <span className="text-sm">{emptyMessage}</span>
                  {emptyAction}
                </div>
              </td>
            </tr>
          ) : (
            items.map((row, i) => (
              <tr
                key={getRowKey?.(row, i) ?? row.id ?? i}
                className="border-b border-border/60 text-text transition-colors last:border-0 hover:bg-surface"
              >
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={cx("px-4 py-3", alignClass(c.align), c.className)}
                  >
                    {c.render
                      ? c.render(row)
                      : String((row as Record<string, unknown>)[c.key] ?? "—")}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>

      {rows.length > pageSize && (
        <div className="flex items-center justify-between border-t border-border px-4 py-2.5 text-xs text-muted">
          <span>
            Page {cur} of {pageCount} · {rows.length} total
          </span>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              disabled={cur <= 1}
              onClick={() => setPage(cur - 1)}
            >
              Previous
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={cur >= pageCount}
              onClick={() => setPage(cur + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function EmptyGlyph() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="opacity-50">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 9h18M8 14h8" />
    </svg>
  );
}

/** Standalone empty state for non-table views. */
export function EmptyState({
  message,
  action,
}: {
  message: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-card py-12 text-muted">
      <EmptyGlyph />
      <span className="text-sm">{message}</span>
      {action}
    </div>
  );
}
