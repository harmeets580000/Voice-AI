"use client";

import Link from "next/link";
import {
  CalendarCheck,
  CalendarDays,
  Users,
  Scissors,
  Phone,
  BookOpen,
  Building2,
  Mic,
  type LucideIcon,
} from "lucide-react";
import { AppShell } from "@shared/ui/AppShell";
import { useAuth } from "@features/auth/AuthProvider";
import { Role } from "@domain/enums";
import { Logo } from "@shared/ui/Logo";
import { PageContainer } from "@shared/ui/primitives";

const QUICK_LINKS: { href: string; label: string; desc: string; icon: LucideIcon }[] = [
  { href: "/bookings", label: "Bookings", desc: "View and create appointments", icon: CalendarCheck },
  { href: "/calendar", label: "Calendar", desc: "See your week at a glance", icon: CalendarDays },
  { href: "/staff", label: "Staff", desc: "Manage your team", icon: Users },
  { href: "/services", label: "Services", desc: "What you offer", icon: Scissors },
  { href: "/calls", label: "Calls", desc: "Transcripts & recordings", icon: Phone },
  { href: "/knowledge", label: "Knowledge", desc: "Docs the assistant uses", icon: BookOpen },
];

const SUPER_LINKS: { href: string; label: string; desc: string; icon: LucideIcon }[] = [
  { href: "/organizations", label: "Organizations", desc: "Onboard & manage customers", icon: Building2 },
  { href: "/settings?tab=platform-voice", label: "Platform voice", desc: "Global Vapi defaults", icon: Mic },
];

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
  const links = isSuper ? [...SUPER_LINKS, ...QUICK_LINKS] : QUICK_LINKS;
  const name = user?.name || user?.email?.split("@")[0] || "there";

  return (
    <PageContainer>
      <div className="mb-8 flex flex-col items-center gap-4 py-6 text-center animate-[slide-up_0.4s_cubic-bezier(0.16,1,0.3,1)]">
        <Logo withWordmark={false} size={52} />
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-text">
            Welcome back, {name}
          </h1>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted">
            {isSuper
              ? "Manage every organization, onboard new customers, and keep their AI receptionists running smoothly."
              : "Your AI receptionist is answering calls and booking appointments. Here's everything you can manage."}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {links.map((l, i) => (
          <Link
            key={l.href}
            href={l.href}
            style={{ animationDelay: `${i * 40}ms` }}
            className="group flex items-start gap-3 rounded-xl border border-border bg-card p-4 shadow-sm transition-all duration-150 animate-[slide-up_0.4s_both] hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-md"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent-tint text-accent transition-colors group-hover:bg-accent group-hover:text-on-accent">
              <l.icon size={20} />
            </span>
            <span>
              <span className="block font-medium text-text transition-colors group-hover:text-accent">
                {l.label}
              </span>
              <span className="mt-0.5 block text-xs text-muted">{l.desc}</span>
            </span>
          </Link>
        ))}
      </div>
    </PageContainer>
  );
}
