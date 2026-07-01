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
  HelpCircle,
  Building2,
  FlaskConical,
  ShieldCheck,
  ChevronDown,
  Filter,
  Megaphone,
  Target,
  Package,
  type LucideIcon,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@features/auth/AuthProvider";
import { api } from "@shared/api/client";
import type { ProductsResponse } from "@contracts/products";
import { Role } from "@domain/enums";
import {
  OrgSwitcher,
  ActingAsBanner,
} from "@features/organizations/OrgSwitcher";
import { Logo } from "./Logo";
import { ProfileMenu } from "./ProfileMenu";
import { Spinner, cx } from "./primitives";

type NavItem = { href: string; label: string; icon: LucideIcon };
type NavGroup = { heading?: string; items: NavItem[] };
type NavSection = {
  title?: string;
  icon?: LucideIcon;
  groups: NavGroup[];
  /** Shown (dimmed, non-clickable) when the section has no items yet. */
  placeholder?: string;
};

const LIBRARY: NavItem[] = [
  { href: "/services", label: "Services", icon: Scissors },
  { href: "/staff", label: "Staff", icon: Users },
  { href: "/schedules", label: "Schedules", icon: Clock },
  { href: "/knowledge", label: "Knowledge Base", icon: BookOpen },
  { href: "/tools", label: "Tools", icon: Wrench },
];
const OPERATIONS: NavItem[] = [
  { href: "/calls", label: "Calls", icon: Phone },
  { href: "/bookings", label: "Bookings", icon: CalendarCheck },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/customers", label: "Customers", icon: Contact },
];
// Outbound Sales (Product 2) — grouped like Inbound: an overview at the top, the reusable building
// blocks under "Library", the live sales activity under "Operations", then Help. Revealed only when
// OUTBOUND_SALES is enabled for the active org (see the product registry).
const OUTBOUND_LIBRARY: NavItem[] = [
  { href: "/outbound/contacts", label: "Contacts", icon: Contact },
  { href: "/outbound/segments", label: "Segments", icon: Filter },
  { href: "/outbound/agents", label: "Agents", icon: Bot },
];
const OUTBOUND_OPERATIONS: NavItem[] = [
  { href: "/outbound/campaigns", label: "Campaigns", icon: Megaphone },
  { href: "/outbound/leads", label: "Leads", icon: Target },
];

// The sidebar is role-aware. Org users live in Inbound (their own org): the Assistant is the hub, the
// Library group holds the shared building blocks it selects from, Operations is live data, and Help
// explains the inbound-call flow. Super-admins get a dedicated "Super admin" section first (platform
// dashboard + Vapi settings/tester) and use Inbound when acting as a specific org. The Outbound section
// is gated on the product registry (`outboundEnabled`); admins get a Products toggle to turn it on.
function buildNavSections(role: Role, outboundEnabled: boolean): NavSection[] {
  const isSuper = role === Role.SUPER_ADMIN;
  const isAdmin = isSuper || role === Role.ORG_ADMIN;

  const inboundGroups: NavGroup[] = [
    {
      items: [
        ...(isSuper
          ? []
          : [{ href: "/dashboard", label: "Dashboard", icon: LayoutDashboard }]),
        { href: "/assistants", label: "Assistants", icon: Bot },
      ],
    },
    { heading: "Library", items: LIBRARY },
    { heading: "Operations", items: OPERATIONS },
    { items: [{ href: "/help", label: "Help", icon: HelpCircle }] },
  ];
  // Org admins reach the Products toggle from a Settings group; super-admins from their section.
  if (isAdmin && !isSuper) {
    inboundGroups.push({
      heading: "Settings",
      items: [{ href: "/settings/products", label: "Products", icon: Package }],
    });
  }
  const inbound: NavSection = {
    title: "Inbound",
    icon: PhoneIncoming,
    groups: inboundGroups,
  };

  const outbound: NavSection = {
    title: "Outbound",
    icon: PhoneOutgoing,
    groups: [
      {
        items: [
          {
            href: "/outbound/dashboard",
            label: "Sales dashboard",
            icon: LayoutDashboard,
          },
        ],
      },
      { heading: "Library", items: OUTBOUND_LIBRARY },
      { heading: "Operations", items: OUTBOUND_OPERATIONS },
      { items: [{ href: "/outbound/help", label: "Help", icon: HelpCircle }] },
    ],
  };

  const sections: NavSection[] = [];
  if (isSuper) {
    sections.push({
      title: "Super admin",
      icon: ShieldCheck,
      groups: [
        {
          items: [
            { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
            { href: "/organizations", label: "Vapi Settings", icon: Building2 },
            { href: "/vapi-tester", label: "Vapi Tester", icon: FlaskConical },
            { href: "/settings/products", label: "Products", icon: Package },
          ],
        },
      ],
    });
  }
  sections.push(inbound);
  if (outboundEnabled) sections.push(outbound);
  return sections;
}

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

/** Authenticated shell: redirects to /login when not signed in; renders top bar + nav. */
const NAV_COLLAPSE_KEY = "navCollapsedSections";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, loading, activeOrgId } = useAuth();
  const router = useRouter();

  // Which products are enabled for the active org — drives the Outbound nav gate. Reactive to the
  // super-admin org switcher (activeOrgId). Skipped in the super-admin platform view (no active org).
  const isSuper = user?.role === Role.SUPER_ADMIN;
  const { data: productsData } = useQuery({
    queryKey: ["products", activeOrgId],
    queryFn: () => api.get<ProductsResponse>("/products"),
    enabled: !!user && (!isSuper || !!activeOrgId),
    staleTime: 60_000,
  });
  const outboundEnabled = (productsData?.products ?? []).some(
    (p) => p.product === "OUTBOUND_SALES" && p.status === "active",
  );

  // Collapsible nav sections, persisted across reloads. The nav only renders after the auth loading
  // gate (client-side), so reading localStorage in the lazy initializer is safe — no hydration mismatch.
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

  const sections = buildNavSections(user.role, outboundEnabled);

  return (
    <div className="min-h-screen bg-bg">
      <ActingAsBanner />
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-card/80 px-4 py-2.5 backdrop-blur">
        <div className="flex items-center gap-4">
          <Logo />
          <OrgSwitcher />
        </div>
        <ProfileMenu />
      </header>
      <div className="flex">
        <nav className="sticky top-[57px] flex h-[calc(100vh-57px)] w-56 shrink-0 flex-col border-r border-border">
          <ul className="themed-scrollbar flex-1 space-y-0.5 overflow-y-auto p-3">
            {sections.map((section, si) => {
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
        </nav>
        <main className="min-w-0 flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
