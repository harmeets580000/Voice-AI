/**
 * Dashboard analytics. Org metrics are computed via `tenantDb(orgId)` (auto-scoped); the platform
 * view uses the raw `prisma` client for cross-org aggregates (super-admin only, like
 * organizations.service). Daily trends are bucketed in the org timezone (UTC for the platform view).
 *
 * Activity timestamp convention: both calls and bookings are counted by `createdAt` (always present;
 * for calls ≈ when the call happened). `startDatetime` is used only for the "upcoming" list.
 */

import { DateTime } from "luxon";
import { prisma } from "@server/platform/db/client";
import { tenantDb } from "@server/platform/db/scoped";
import type { DashboardPeriod, OrgDashboard, PlatformDashboard } from "@contracts/analytics";

// ---------------- pure helpers (unit-tested) ----------------

export function periodToRange(
  period: DashboardPeriod,
  now: Date = new Date(),
): { days: number; from: Date; to: Date; prevFrom: Date; prevTo: Date } {
  const days = period === "7d" ? 7 : period === "90d" ? 90 : 30;
  const ms = days * 86_400_000;
  const to = now;
  const from = new Date(now.getTime() - ms);
  return { days, from, to, prevFrom: new Date(from.getTime() - ms), prevTo: from };
}

/** % change vs previous window; null when there's no prior baseline (avoids divide-by-zero). */
export function deltaPct(curr: number, prev: number): number | null {
  if (prev === 0) return null;
  return Math.round(((curr - prev) / prev) * 1000) / 10;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;

function dayKeys(from: Date, to: Date, tz: string): string[] {
  const keys: string[] = [];
  let d = DateTime.fromJSDate(from, { zone: tz }).startOf("day");
  const end = DateTime.fromJSDate(to, { zone: tz }).startOf("day");
  while (d <= end) {
    const iso = d.toISODate();
    if (iso) keys.push(iso);
    d = d.plus({ days: 1 });
  }
  return keys;
}

export function bucketByDay<T>(
  items: T[],
  getDate: (t: T) => Date,
  getValue: (t: T) => number,
  tz: string,
  from: Date,
  to: Date,
): { date: string; value: number }[] {
  const map = new Map<string, number>();
  for (const k of dayKeys(from, to, tz)) map.set(k, 0);
  for (const it of items) {
    const key = DateTime.fromJSDate(getDate(it), { zone: tz }).toISODate();
    if (key && map.has(key)) map.set(key, (map.get(key) ?? 0) + getValue(it));
  }
  return [...map.entries()].map(([date, value]) => ({ date, value }));
}

function countBy<T>(
  items: T[],
  getKey: (t: T) => string,
  keys: string[],
): { key: string; count: number }[] {
  return keys.map((k) => ({
    key: k,
    count: items.filter((i) => getKey(i) === k).length,
  }));
}

function countByDynamic<T>(
  items: T[],
  getKey: (t: T) => string,
): { key: string; count: number }[] {
  const map = new Map<string, number>();
  for (const it of items) {
    const k = getKey(it);
    map.set(k, (map.get(k) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count);
}

async function getOrgTimezone(orgId: string): Promise<string> {
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { timezone: true },
  });
  return org?.timezone || "UTC";
}

type RevRow = { status: string; service: { price: unknown } | null };
const revenueOf = (rows: RevRow[]): number =>
  rows
    .filter((b) => b.status === "booked" || b.status === "completed")
    .reduce((s, b) => s + Number(b.service?.price ?? 0), 0);

// ---------------- org dashboard ----------------

export async function getOrgDashboard(
  orgId: string,
  period: DashboardPeriod,
): Promise<OrgDashboard> {
  const db = tenantDb(orgId);
  const now = new Date();
  const { from, to, prevFrom, prevTo } = periodToRange(period, now);
  const tz = await getOrgTimezone(orgId);

  const [
    bookings,
    prevBookings,
    calls,
    prevCallCount,
    newCustomers,
    prevNewCustomers,
    upcomingRows,
    recentCallRows,
    cfg,
  ] = await Promise.all([
    db.booking.findMany({
      where: { createdAt: { gte: from, lt: to } },
      select: {
        id: true,
        createdAt: true,
        startDatetime: true,
        endDatetime: true,
        status: true,
        source: true,
        service: { select: { id: true, name: true, price: true } },
        staff: { select: { id: true, name: true } },
      },
    }),
    db.booking.findMany({
      where: { createdAt: { gte: prevFrom, lt: prevTo } },
      select: { status: true, service: { select: { price: true } } },
    }),
    db.call.findMany({
      where: { createdAt: { gte: from, lt: to } },
      select: { createdAt: true, endedReason: true, durationSeconds: true, cost: true },
    }),
    db.call.count({ where: { createdAt: { gte: prevFrom, lt: prevTo } } }),
    db.customer.count({ where: { createdAt: { gte: from, lt: to } } }),
    db.customer.count({ where: { createdAt: { gte: prevFrom, lt: prevTo } } }),
    db.booking.findMany({
      where: { startDatetime: { gt: now }, status: "booked" },
      orderBy: { startDatetime: "asc" },
      take: 6,
      select: {
        id: true,
        startDatetime: true,
        status: true,
        customer: { select: { name: true } },
        service: { select: { name: true } },
        staff: { select: { name: true } },
      },
    }),
    db.call.findMany({
      orderBy: { createdAt: "desc" },
      take: 6,
      select: {
        id: true,
        createdAt: true,
        fromNumber: true,
        durationSeconds: true,
        summary: true,
      },
    }),
    prisma.orgVapiConfig.findUnique({ where: { organizationId: orgId } }),
  ]);

  const callsCount = calls.length;
  const bookingsCount = bookings.length;
  const revenue = revenueOf(bookings);
  const prevRevenue = revenueOf(prevBookings);

  const phoneBookings = bookings.filter((b) => b.source === "phone").length;
  const conversionPct =
    callsCount > 0 ? round1((phoneBookings / callsCount) * 100) : 0;
  const lostBookings = bookings.filter(
    (b) => b.status === "cancelled" || b.status === "no_show",
  ).length;
  const cancellationRatePct =
    bookingsCount > 0 ? round1((lostBookings / bookingsCount) * 100) : 0;
  const durations = calls
    .map((c) => c.durationSeconds)
    .filter((d): d is number => d != null);
  const avgCallDurationSeconds = durations.length
    ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
    : null;
  const totalCallCost = round2(
    calls.reduce((s, c) => s + Number(c.cost ?? 0), 0),
  );

  // Top services
  const svc = new Map<string, { id: string; name: string; bookings: number; revenue: number }>();
  for (const b of bookings) {
    if (!b.service) continue;
    const e = svc.get(b.service.id) ?? {
      id: b.service.id,
      name: b.service.name,
      bookings: 0,
      revenue: 0,
    };
    e.bookings++;
    if (b.status === "booked" || b.status === "completed") {
      e.revenue += Number(b.service.price ?? 0);
    }
    svc.set(b.service.id, e);
  }
  const topServices = [...svc.values()]
    .sort((a, b) => b.bookings - a.bookings)
    .slice(0, 6)
    .map((s) => ({ ...s, revenue: round2(s.revenue) }));

  // Staff workload
  const stf = new Map<string, { id: string; name: string; bookings: number; bookedMinutes: number }>();
  for (const b of bookings) {
    if (!b.staff) continue;
    const e = stf.get(b.staff.id) ?? {
      id: b.staff.id,
      name: b.staff.name,
      bookings: 0,
      bookedMinutes: 0,
    };
    e.bookings++;
    e.bookedMinutes += Math.max(
      0,
      Math.round((b.endDatetime.getTime() - b.startDatetime.getTime()) / 60_000),
    );
    stf.set(b.staff.id, e);
  }
  const staff = [...stf.values()]
    .sort((a, b) => b.bookings - a.bookings)
    .slice(0, 6);

  return {
    scope: "org",
    period,
    kpis: {
      calls: { value: callsCount, deltaPct: deltaPct(callsCount, prevCallCount) },
      bookings: {
        value: bookingsCount,
        deltaPct: deltaPct(bookingsCount, prevBookings.length),
      },
      revenue: { value: round2(revenue), deltaPct: deltaPct(revenue, prevRevenue) },
      newCustomers: {
        value: newCustomers,
        deltaPct: deltaPct(newCustomers, prevNewCustomers),
      },
      conversionPct,
      cancellationRatePct,
      avgCallDurationSeconds,
      totalCallCost,
    },
    trends: {
      calls: bucketByDay(calls, (c) => c.createdAt, () => 1, tz, from, to),
      bookings: bucketByDay(bookings, (b) => b.createdAt, () => 1, tz, from, to),
      revenue: bucketByDay(
        bookings.filter((b) => b.status === "booked" || b.status === "completed"),
        (b) => b.createdAt,
        (b) => Number(b.service?.price ?? 0),
        tz,
        from,
        to,
      ).map((p) => ({ date: p.date, value: round2(p.value) })),
    },
    byStatus: countBy(bookings, (b) => b.status, [
      "booked",
      "completed",
      "cancelled",
      "no_show",
    ]),
    bySource: countBy(bookings, (b) => b.source, [
      "phone",
      "web",
      "whatsapp",
      "admin",
    ]),
    topServices,
    staff,
    callEndedReasons: countByDynamic(calls, (c) => c.endedReason ?? "unknown"),
    upcoming: upcomingRows.map((u) => ({
      id: u.id,
      startDatetime: u.startDatetime.toISOString(),
      status: u.status,
      customer: u.customer?.name ?? null,
      service: u.service?.name ?? null,
      staff: u.staff?.name ?? null,
    })),
    recentCalls: recentCallRows.map((c) => ({
      id: c.id,
      createdAt: c.createdAt.toISOString(),
      from: c.fromNumber ?? null,
      durationSeconds: c.durationSeconds ?? null,
      summary: c.summary ?? null,
    })),
    vapiHealth: {
      provisioned: !!cfg?.vapiAssistantId,
      phoneNumber: cfg?.vapiPhoneNumber ?? null,
      assistantId: cfg?.vapiAssistantId ?? null,
      syncStatus: cfg?.syncStatus ?? null,
      lastSyncedAt: cfg?.lastSyncedAt?.toISOString() ?? null,
      syncError: cfg?.syncError ?? null,
    },
  };
}

// ---------------- platform dashboard (super-admin) ----------------

export async function getPlatformDashboard(
  period: DashboardPeriod,
): Promise<PlatformDashboard> {
  const now = new Date();
  const { from, to, prevFrom, prevTo } = periodToRange(period, now);

  const [orgs, bookings, prevBookings, calls, prevCallCount, customers, prevCustomers, cfgs] =
    await Promise.all([
      prisma.organization.findMany({
        select: { id: true, name: true, status: true },
      }),
      prisma.booking.findMany({
        where: { createdAt: { gte: from, lt: to } },
        select: {
          organizationId: true,
          createdAt: true,
          status: true,
          service: { select: { price: true } },
        },
      }),
      prisma.booking.findMany({
        where: { createdAt: { gte: prevFrom, lt: prevTo } },
        select: { status: true, service: { select: { price: true } } },
      }),
      prisma.call.findMany({
        where: { createdAt: { gte: from, lt: to } },
        select: { organizationId: true, createdAt: true },
      }),
      prisma.call.count({ where: { createdAt: { gte: prevFrom, lt: prevTo } } }),
      prisma.customer.count({ where: { createdAt: { gte: from, lt: to } } }),
      prisma.customer.count({ where: { createdAt: { gte: prevFrom, lt: prevTo } } }),
      prisma.orgVapiConfig.findMany({
        select: { organizationId: true, syncStatus: true },
      }),
    ]);

  const revenue = revenueOf(bookings);
  const prevRevenue = revenueOf(prevBookings);

  // Per-org rollups.
  const callByOrg = new Map<string, number>();
  const lastByOrg = new Map<string, number>();
  for (const c of calls) {
    callByOrg.set(c.organizationId, (callByOrg.get(c.organizationId) ?? 0) + 1);
    lastByOrg.set(
      c.organizationId,
      Math.max(lastByOrg.get(c.organizationId) ?? 0, c.createdAt.getTime()),
    );
  }
  const bookByOrg = new Map<string, { count: number; revenue: number }>();
  for (const b of bookings) {
    const e = bookByOrg.get(b.organizationId) ?? { count: 0, revenue: 0 };
    e.count++;
    if (b.status === "booked" || b.status === "completed") {
      e.revenue += Number(b.service?.price ?? 0);
    }
    bookByOrg.set(b.organizationId, e);
    lastByOrg.set(
      b.organizationId,
      Math.max(lastByOrg.get(b.organizationId) ?? 0, b.createdAt.getTime()),
    );
  }
  const syncByOrg = new Map(cfgs.map((c) => [c.organizationId, c.syncStatus]));

  const orgRows = orgs
    .map((o) => {
      const last = lastByOrg.get(o.id);
      return {
        id: o.id,
        name: o.name,
        status: o.status,
        calls: callByOrg.get(o.id) ?? 0,
        bookings: bookByOrg.get(o.id)?.count ?? 0,
        revenue: round2(bookByOrg.get(o.id)?.revenue ?? 0),
        lastActivity: last ? new Date(last).toISOString() : null,
        syncStatus: syncByOrg.get(o.id) ?? null,
      };
    })
    .sort((a, b) => b.calls + b.bookings - (a.calls + a.bookings));

  return {
    scope: "platform",
    period,
    kpis: {
      orgs: orgs.length,
      calls: { value: calls.length, deltaPct: deltaPct(calls.length, prevCallCount) },
      bookings: {
        value: bookings.length,
        deltaPct: deltaPct(bookings.length, prevBookings.length),
      },
      revenue: { value: round2(revenue), deltaPct: deltaPct(revenue, prevRevenue) },
      customers: { value: customers, deltaPct: deltaPct(customers, prevCustomers) },
    },
    orgsByStatus: countBy(orgs, (o) => o.status, ["trial", "active", "suspended"]),
    trends: {
      calls: bucketByDay(calls, (c) => c.createdAt, () => 1, "UTC", from, to),
      bookings: bucketByDay(bookings, (b) => b.createdAt, () => 1, "UTC", from, to),
    },
    orgs: orgRows,
  };
}
