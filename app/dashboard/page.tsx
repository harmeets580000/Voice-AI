"use client";

import { useState } from "react";
import Link from "next/link";
import {
  CalendarCheck,
  CalendarDays,
  Users,
  Scissors,
  Phone,
  BookOpen,
  Building2,
  type LucideIcon,
} from "lucide-react";
import { AppShell } from "@shared/ui/AppShell";
import { useAuth } from "@features/auth/AuthProvider";
import { Role } from "@domain/enums";
import { PageContainer, PageHeader, Spinner, cx } from "@shared/ui/primitives";
import type { DashboardPeriod } from "@contracts/analytics";
import { useDashboard } from "@features/dashboard/useDashboard";
import { OrgDashboard } from "@features/dashboard/OrgDashboard";
import { PlatformDashboard } from "@features/dashboard/PlatformDashboard";

const QUICK_LINKS: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/bookings", label: "Bookings", icon: CalendarCheck },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/customers", label: "Customers", icon: Users },
  { href: "/services", label: "Services", icon: Scissors },
  { href: "/calls", label: "Calls", icon: Phone },
  { href: "/knowledge", label: "Knowledge", icon: BookOpen },
];

const PERIODS: DashboardPeriod[] = ["7d", "30d", "90d"];

export default function DashboardPage() {
  return (
    <AppShell>
      <Dashboard />
    </AppShell>
  );
}

function Dashboard() {
  const { user } = useAuth();
  const isSuper = user?.role === Role.SUPER_ADMIN;
  const [period, setPeriod] = useState<DashboardPeriod>("30d");
  const { data, isLoading, isError } = useDashboard(period);

  return (
    <PageContainer size="wide">
      <PageHeader
        title="Dashboard"
        subtitle={
          isSuper && data?.scope === "platform"
            ? "Platform overview — pick an organization from the switcher to drill in."
            : "Your AI receptionist at a glance."
        }
        actions={
          <div role="tablist" className="flex gap-1 text-sm">
            {PERIODS.map((p) => (
              <button
                key={p}
                role="tab"
                aria-selected={period === p}
                onClick={() => setPeriod(p)}
                className={cx(
                  "rounded-lg px-3 py-1.5 transition-colors",
                  period === p
                    ? "bg-accent text-on-accent"
                    : "border border-control text-text hover:bg-surface",
                )}
              >
                {p}
              </button>
            ))}
          </div>
        }
      />

      {isLoading ? (
        <div className="flex items-center gap-2 py-16 text-sm text-muted">
          <Spinner size={18} /> Loading analytics…
        </div>
      ) : isError || !data ? (
        <p className="py-16 text-center text-sm text-danger">
          Could not load analytics. Try again.
        </p>
      ) : data.scope === "platform" ? (
        <PlatformDashboard data={data} />
      ) : (
        <OrgDashboard data={data} />
      )}

      {/* Quick links */}
      <div className="mt-8">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-faint">
          Quick links
        </h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {(isSuper
            ? [{ href: "/organizations", label: "Organizations", icon: Building2 }, ...QUICK_LINKS]
            : QUICK_LINKS
          ).map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="group flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm shadow-sm transition-colors hover:border-accent/40 hover:bg-surface"
            >
              <l.icon size={16} className="text-accent" />
              <span className="text-text group-hover:text-accent">{l.label}</span>
            </Link>
          ))}
        </div>
      </div>
    </PageContainer>
  );
}
