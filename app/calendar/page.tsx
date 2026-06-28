"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@shared/ui/AppShell";
import { api } from "@shared/api/client";
import { CalendarClock } from "lucide-react";
import { PageContainer, Button, Card } from "@shared/ui/primitives";
import { useFormatDate } from "@features/settings/SettingsProvider";

interface BookingRow {
  id: string;
  startDatetime: string;
  status: string;
  customer: { name: string | null } | null;
  service: { name: string | null } | null;
}

export default function CalendarRoute() {
  return (
    <AppShell>
      <CalendarPage />
    </AppShell>
  );
}

function startOfMonthGrid(year: number, month: number) {
  const first = new Date(year, month, 1);
  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay());
  return start;
}

function CalendarPage() {
  const formatDate = useFormatDate();
  const [cursor, setCursor] = useState(() => {
    const n = new Date();
    return { year: n.getFullYear(), month: n.getMonth() };
  });

  const { data } = useQuery({
    queryKey: ["bookings"],
    queryFn: () => api.get<{ bookings: BookingRow[] }>("/bookings"),
  });

  const bookings = useMemo(() => data?.bookings ?? [], [data]);

  const byDay = useMemo(() => {
    const map = new Map<string, BookingRow[]>();
    for (const b of bookings) {
      const d = new Date(b.startDatetime);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      const arr = map.get(key) ?? [];
      arr.push(b);
      map.set(key, arr);
    }
    return map;
  }, [bookings]);

  const upcoming = useMemo(() => {
    // eslint-disable-next-line react-hooks/purity
    const now = Date.now();
    return bookings
      .filter(
        (b) => b.status === "booked" && new Date(b.startDatetime).getTime() >= now,
      )
      .sort(
        (a, b) =>
          new Date(a.startDatetime).getTime() -
          new Date(b.startDatetime).getTime(),
      )
      .slice(0, 8);
  }, [bookings]);

  const gridStart = startOfMonthGrid(cursor.year, cursor.month);
  const days = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    return d;
  });

  const monthName = new Date(cursor.year, cursor.month, 1).toLocaleString(
    undefined,
    { month: "long", year: "numeric" },
  );

  function shift(delta: number) {
    setCursor((c) => {
      const m = c.month + delta;
      return { year: c.year + Math.floor(m / 12), month: ((m % 12) + 12) % 12 };
    });
  }

  return (
    <PageContainer size="wide">
      <h1 className="mb-5 font-display text-2xl font-semibold tracking-tight text-text">
        Calendar
      </h1>

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <Card className="p-0">
          {/* Month header */}
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <span className="font-display font-semibold text-text">
              {monthName}
            </span>
            <div className="flex items-center gap-3">
              <div className="hidden items-center gap-3 text-xs text-muted sm:flex">
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-2.5 w-2.5 rounded-full bg-accent" />
                  Today
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-2.5 w-2.5 rounded-sm bg-accent-tint" />
                  Booking
                </span>
              </div>
              <div className="flex items-center gap-1">
                <Button size="sm" variant="secondary" onClick={() => shift(-1)}>
                  ‹
                </Button>
                <Button size="sm" variant="secondary" onClick={() => shift(1)}>
                  ›
                </Button>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-7 gap-1 p-3 text-xs">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
              <div key={d} className="p-1 text-center font-medium text-muted">
                {d}
              </div>
            ))}
            {days.map((d) => {
              const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
              const items = byDay.get(key) ?? [];
              const inMonth = d.getMonth() === cursor.month;
              const isToday = d.toDateString() === new Date().toDateString();
              return (
                <div
                  key={key}
                  className="min-h-24 rounded-lg border border-border bg-card p-1.5 transition-colors hover:bg-surface"
                  style={{ opacity: inMonth ? 1 : 0.45 }}
                >
                  <div
                    className={
                      isToday
                        ? "ml-auto flex h-5 w-5 items-center justify-center rounded-full bg-accent text-[10px] text-on-accent"
                        : "text-right text-faint"
                    }
                  >
                    {d.getDate()}
                  </div>
                  {items.slice(0, 3).map((b) => (
                    <div
                      key={b.id}
                      className="mt-0.5 truncate rounded px-1 py-0.5 text-[10px]"
                      style={{ background: "var(--accent-tint)", color: "var(--accent)" }}
                      title={`${b.service?.name ?? ""} ${b.customer?.name ?? ""}`}
                    >
                      {new Date(b.startDatetime).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}{" "}
                      {b.service?.name ?? ""}
                    </div>
                  ))}
                  {items.length > 3 && (
                    <div className="mt-0.5 text-[10px] text-faint">
                      +{items.length - 3} more
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Card>

        <Card className="p-0">
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <CalendarClock size={16} className="text-accent" />
            <span className="font-display font-semibold text-text">Upcoming</span>
          </div>
          <div className="p-4">
            {upcoming.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
                <CalendarClock size={28} className="text-faint" />
                <p className="text-sm text-muted">No upcoming bookings.</p>
              </div>
            ) : (
              <ul className="space-y-3">
                {upcoming.map((b) => (
                  <li
                    key={b.id}
                    className="rounded-lg border border-border bg-surface/50 p-2.5 text-sm"
                  >
                    <div className="font-medium text-text">
                      {b.service?.name ?? "Appointment"}
                    </div>
                    <div className="text-xs text-muted">
                      {formatDate(b.startDatetime)}
                    </div>
                    {b.customer?.name && (
                      <div className="text-xs text-faint">{b.customer.name}</div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
      </div>
    </PageContainer>
  );
}
