import { z } from "zod";

/**
 * Dashboard analytics contract. One endpoint (`GET /api/dashboard?period=`) returns a discriminated
 * union: an org dashboard (org users, or super-admin acting-as an org) or a platform dashboard
 * (super-admin with no active org).
 */

export const DashboardPeriod = z.enum(["7d", "30d", "90d"]);
export type DashboardPeriod = z.infer<typeof DashboardPeriod>;

/** A metric value with its % change vs the previous equal-length window (null when not comparable). */
const Kpi = z.object({ value: z.number(), deltaPct: z.number().nullable() });
const TrendPoint = z.object({ date: z.string(), value: z.number() });
const KeyCount = z.object({ key: z.string(), count: z.number() });

const TopService = z.object({
  id: z.string(),
  name: z.string(),
  bookings: z.number(),
  revenue: z.number(),
});
const StaffWorkload = z.object({
  id: z.string(),
  name: z.string(),
  bookings: z.number(),
  bookedMinutes: z.number(),
});
const UpcomingBooking = z.object({
  id: z.string(),
  startDatetime: z.string(),
  status: z.string(),
  customer: z.string().nullable(),
  service: z.string().nullable(),
  staff: z.string().nullable(),
});
const RecentCall = z.object({
  id: z.string(),
  createdAt: z.string(),
  from: z.string().nullable(),
  durationSeconds: z.number().nullable(),
  summary: z.string().nullable(),
});
const VapiHealth = z.object({
  provisioned: z.boolean(),
  phoneNumber: z.string().nullable(),
  assistantId: z.string().nullable(),
  syncStatus: z.string().nullable(),
  lastSyncedAt: z.string().nullable(),
  syncError: z.string().nullable(),
});

export const OrgDashboard = z.object({
  scope: z.literal("org"),
  period: DashboardPeriod,
  kpis: z.object({
    calls: Kpi,
    bookings: Kpi,
    revenue: Kpi,
    newCustomers: Kpi,
    conversionPct: z.number(),
    cancellationRatePct: z.number(),
    avgCallDurationSeconds: z.number().nullable(),
    totalCallCost: z.number(),
  }),
  trends: z.object({
    calls: z.array(TrendPoint),
    bookings: z.array(TrendPoint),
    revenue: z.array(TrendPoint),
  }),
  byStatus: z.array(KeyCount),
  bySource: z.array(KeyCount),
  topServices: z.array(TopService),
  staff: z.array(StaffWorkload),
  callEndedReasons: z.array(KeyCount),
  upcoming: z.array(UpcomingBooking),
  recentCalls: z.array(RecentCall),
  vapiHealth: VapiHealth,
});
export type OrgDashboard = z.infer<typeof OrgDashboard>;

const PlatformOrgRow = z.object({
  id: z.string(),
  name: z.string(),
  status: z.string(),
  calls: z.number(),
  bookings: z.number(),
  revenue: z.number(),
  lastActivity: z.string().nullable(),
  syncStatus: z.string().nullable(),
});

export const PlatformDashboard = z.object({
  scope: z.literal("platform"),
  period: DashboardPeriod,
  kpis: z.object({
    orgs: z.number(),
    calls: Kpi,
    bookings: Kpi,
    revenue: Kpi,
    customers: Kpi,
  }),
  orgsByStatus: z.array(KeyCount),
  trends: z.object({
    calls: z.array(TrendPoint),
    bookings: z.array(TrendPoint),
  }),
  orgs: z.array(PlatformOrgRow),
});
export type PlatformDashboard = z.infer<typeof PlatformDashboard>;

export const DashboardResponse = z.discriminatedUnion("scope", [
  OrgDashboard,
  PlatformDashboard,
]);
export type DashboardResponse = z.infer<typeof DashboardResponse>;
