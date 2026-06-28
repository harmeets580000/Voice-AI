"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  CalendarCheck,
  CalendarDays,
  Users,
  Scissors,
  Clock,
  Contact,
  Phone,
  BookOpen,
  Settings,
  HelpCircle,
  Building2,
  FlaskConical,
  LogOut,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "@features/auth/AuthProvider";
import { Role } from "@domain/enums";
import {
  OrgSwitcher,
  ActingAsBanner,
} from "@features/organizations/OrgSwitcher";
import { Logo } from "./Logo";
import { Spinner, Badge, cx } from "./primitives";

// Ordered to match the "Get set up → Day to day" flow on the Help page.
const NAV: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  // Setup
  { href: "/staff", label: "Staff", icon: Users },
  { href: "/services", label: "Services", icon: Scissors },
  { href: "/schedules", label: "Schedules", icon: Clock },
  { href: "/knowledge", label: "Knowledge", icon: BookOpen },
  // Day to day
  { href: "/bookings", label: "Bookings", icon: CalendarCheck },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/customers", label: "Customers", icon: Contact },
  { href: "/calls", label: "Calls", icon: Phone },
  // App
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/help", label: "Help", icon: HelpCircle },
];

const SUPER_NAV: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/organizations", label: "Organizations", icon: Building2 },
  { href: "/vapi-tester", label: "Vapi Tester", icon: FlaskConical },
];

function NavLink({
  href,
  label,
  icon: Icon,
}: {
  href: string;
  label: string;
  icon: LucideIcon;
}) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(href + "/");
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cx(
        "relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors",
        active
          ? "bg-accent-tint font-medium text-accent"
          : "text-ink2 hover:bg-surface hover:text-text",
      )}
    >
      {active && (
        <span className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-accent" />
      )}
      <Icon size={17} className="shrink-0" />
      {label}
    </Link>
  );
}

function initials(nameOrEmail: string) {
  const base = nameOrEmail.split("@")[0];
  const parts = base.split(/[.\s_-]+/).filter(Boolean);
  return (parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "");
}

/** Authenticated shell: redirects to /login when not signed in; renders top bar + nav. */
export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-bg">
        <Logo withWordmark={false} size={44} />
        <Spinner />
        <span className="text-sm text-muted">Loading…</span>
      </div>
    );
  }
  if (!user) return null;

  return (
    <div className="min-h-screen bg-bg">
      <ActingAsBanner />
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-card/80 px-4 py-2.5 backdrop-blur">
        <div className="flex items-center gap-4">
          <Logo />
          <OrgSwitcher />
        </div>
      </header>
      <div className="flex">
        <nav className="sticky top-[57px] flex h-[calc(100vh-57px)] w-56 shrink-0 flex-col border-r border-border">
          <ul className="flex-1 space-y-0.5 overflow-y-auto p-3">
            {NAV.map((n) => (
              <li key={n.href}>
                <NavLink {...n} />
              </li>
            ))}
            {user.role === Role.SUPER_ADMIN && (
              <>
                <li className="mb-1 mt-4 px-3 text-[11px] font-semibold uppercase tracking-wider text-faint">
                  Super-admin
                </li>
                {SUPER_NAV.map((n) => (
                  <li key={n.href}>
                    <NavLink {...n} />
                  </li>
                ))}
              </>
            )}
          </ul>

          {/* Profile block pinned to the sidebar bottom */}
          <div className="border-t border-border p-3">
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-semibold uppercase text-on-accent">
                {initials(user.name || user.email)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-text">
                  {user.name || user.email.split("@")[0]}
                </div>
                <div className="mt-0.5">
                  <Badge tone="accent">{user.role.replace("_", " ")}</Badge>
                </div>
              </div>
              <button
                onClick={() => void logout().then(() => router.replace("/login"))}
                aria-label="Log out"
                title="Log out"
                className="shrink-0 rounded-lg p-2 text-muted transition-colors hover:bg-surface hover:text-danger"
              >
                <LogOut size={17} />
              </button>
            </div>
            <div className="mt-1 truncate px-0.5 text-xs text-faint">
              {user.email}
            </div>
          </div>
        </nav>
        <main className="min-w-0 flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
