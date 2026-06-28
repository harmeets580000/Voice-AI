"use client";

import { useEffect, useState, Fragment } from "react";
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
  PhoneIncoming,
  PhoneOutgoing,
  BookOpen,
  Wrench,
  Bot,
  Settings,
  HelpCircle,
  Building2,
  FlaskConical,
  ChevronDown,
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

type NavItem = { href: string; label: string; icon: LucideIcon };
type NavGroup = { heading?: string; items: NavItem[] };
type NavSection = {
  title?: string;
  icon?: LucideIcon;
  groups: NavGroup[];
  /** Shown (dimmed, non-clickable) when the section has no items yet. */
  placeholder?: string;
};

// Two top-level sections — Inbound (the live AI receptionist) and Outbound (coming soon).
// Within Inbound, ordered by the real setup dependency chain: build the bottom-up (services →
// staff → schedules → knowledge → tools) before an assistant can answer, then day-to-day ops.
// Dashboard / Account / Super-admin are cross-cutting and sit outside the two sections.
const NAV_SECTIONS: NavSection[] = [
  { groups: [{ items: [{ href: "/dashboard", label: "Dashboard", icon: LayoutDashboard }] }] },
  {
    title: "Inbound",
    icon: PhoneIncoming,
    groups: [
      {
        heading: "Setup",
        items: [
          { href: "/services", label: "Services", icon: Scissors },
          { href: "/staff", label: "Staff", icon: Users },
          { href: "/schedules", label: "Schedules", icon: Clock },
          { href: "/knowledge", label: "Knowledge Base", icon: BookOpen },
          { href: "/tools", label: "Tools", icon: Wrench },
          { href: "/assistants", label: "Assistants", icon: Bot },
        ],
      },
      {
        heading: "Operations",
        items: [
          { href: "/calls", label: "Calls", icon: Phone },
          { href: "/bookings", label: "Bookings", icon: CalendarCheck },
          { href: "/calendar", label: "Calendar", icon: CalendarDays },
          { href: "/customers", label: "Customers", icon: Contact },
        ],
      },
    ],
  },
  {
    title: "Outbound",
    icon: PhoneOutgoing,
    groups: [],
    placeholder: "Coming soon",
  },
];

// Pinned to the bottom of the sidebar (utility nav), separated from the feature sections above.
const ACCOUNT_NAV: NavItem[] = [
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/help", label: "Help", icon: HelpCircle },
];

const SUPER_NAV: NavItem[] = [
  { href: "/organizations", label: "Organizations", icon: Building2 },
  { href: "/vapi-tester", label: "Vapi Tester", icon: FlaskConical },
];

function NavHeading({ children }: { children: React.ReactNode }) {
  return (
    <li className="mb-1 mt-4 px-3 text-[11px] font-semibold uppercase tracking-wider text-faint">
      {children}
    </li>
  );
}

function NavSectionHeader({
  icon: Icon,
  collapsed,
  onToggle,
  children,
}: {
  icon?: LucideIcon;
  collapsed: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <li className="mb-1 mt-5 first:mt-0">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!collapsed}
        className="flex w-full items-center gap-1.5 rounded-md border-t border-border px-3 pb-1 pt-4 text-[11px] font-bold uppercase tracking-wider text-ink2 transition-colors hover:text-text"
      >
        {Icon && <Icon size={13} className="text-muted" />}
        <span className="flex-1 text-left">{children}</span>
        <ChevronDown
          size={14}
          className={cx(
            "text-muted transition-transform",
            collapsed && "-rotate-90",
          )}
        />
      </button>
    </li>
  );
}

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
const NAV_COLLAPSE_KEY = "navCollapsedSections";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();

  // Collapsible nav sections (Inbound/Outbound), persisted across reloads. The nav only renders
  // after the auth loading gate (client-side), so reading localStorage in the lazy initializer is
  // safe — no SSR/hydration mismatch.
  const [collapsed, setCollapsed] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const raw = window.localStorage.getItem(NAV_COLLAPSE_KEY);
      return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
    } catch {
      return new Set();
    }
  });
  function toggleSection(title: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(title)) next.delete(title);
      else next.add(title);
      try {
        localStorage.setItem(NAV_COLLAPSE_KEY, JSON.stringify([...next]));
      } catch {
        /* ignore */
      }
      return next;
    });
  }

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
          <ul className="themed-scrollbar flex-1 space-y-0.5 overflow-y-auto p-3">
            {NAV_SECTIONS.map((section, si) => {
              const isCollapsed = !!section.title && collapsed.has(section.title);
              return (
                <Fragment key={section.title ?? `s${si}`}>
                  {section.title && (
                    <NavSectionHeader
                      icon={section.icon}
                      collapsed={isCollapsed}
                      onToggle={() => toggleSection(section.title!)}
                    >
                      {section.title}
                    </NavSectionHeader>
                  )}
                  {!isCollapsed &&
                    section.groups.map((group, gi) => (
                      <li key={group.heading ?? `g${si}-${gi}`}>
                        {group.heading && <NavHeading>{group.heading}</NavHeading>}
                        <ul className="space-y-0.5">
                          {group.items.map((n) => (
                            <li key={n.href}>
                              <NavLink {...n} />
                            </li>
                          ))}
                        </ul>
                      </li>
                    ))}
                  {!isCollapsed && section.placeholder && (
                    <li className="px-3 py-2 text-xs italic text-faint">
                      {section.placeholder}
                    </li>
                  )}
                </Fragment>
              );
            })}
          </ul>

          {/* Utility nav (Account + Super-admin) pinned to the bottom, above the profile. */}
          <ul className="space-y-0.5 border-t border-border p-3">
            {ACCOUNT_NAV.map((n) => (
              <li key={n.href}>
                <NavLink {...n} />
              </li>
            ))}
            {user.role === Role.SUPER_ADMIN && (
              <>
                <NavHeading>Super-admin</NavHeading>
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
