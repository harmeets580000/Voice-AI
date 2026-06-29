"use client";

import ReactMarkdown from "react-markdown";
import {
  PhoneIncoming,
  Bot,
  Wrench,
  CalendarCheck,
  FileText,
  ChevronRight,
  type LucideIcon,
} from "lucide-react";
import { AppShell } from "@shared/ui/AppShell";
import { useAuth } from "@features/auth/AuthProvider";
import { Role } from "@domain/enums";
import { PageContainer, PageHeader, Card } from "@shared/ui/primitives";
import {
  SUPER_ADMIN_GUIDE,
  ORG_ADMIN_GUIDE,
} from "@features/help/helpContent";

const CALL_FLOW: { icon: LucideIcon; title: string; desc: string }[] = [
  { icon: PhoneIncoming, title: "Caller dials", desc: "An assistant's number" },
  { icon: Bot, title: "Assistant answers", desc: "Its greeting + voice" },
  { icon: Wrench, title: "Tools run", desc: "Check · Book · Lookup" },
  { icon: CalendarCheck, title: "Booking saved", desc: "Free staff auto-assigned" },
  { icon: FileText, title: "Call logged", desc: "Transcript + summary" },
];

const ORG_STEPS = [
  { title: "Add services & staff", desc: "What you offer and who delivers it." },
  { title: "Set schedules", desc: "Weekly hours + any time off." },
  { title: "Create an assistant", desc: "Greeting, prompt, voice, model." },
  { title: "Scope it", desc: "Pick its services, staff, knowledge, tools." },
];

const SUPER_STEPS = [
  { title: "Create organization", desc: "Onboard a customer (Vapi Settings)." },
  { title: "Add Vapi key", desc: "Per-customer private key (optional)." },
  { title: "Add an assistant", desc: "Created in Vapi: assistant, number, tools." },
  { title: "Configure it", desc: "Services, staff, knowledge, tools." },
  { title: "Upload knowledge", desc: "So the assistant can answer." },
];

export default function HelpRoute() {
  return (
    <AppShell>
      <HelpPage />
    </AppShell>
  );
}

function HelpPage() {
  const { user } = useAuth();
  const isSuper = user?.role === Role.SUPER_ADMIN;
  const steps = isSuper ? SUPER_STEPS : ORG_STEPS;
  const content = isSuper ? SUPER_ADMIN_GUIDE : ORG_ADMIN_GUIDE;

  return (
    <PageContainer>
      <PageHeader
        title="How inbound calls work"
        subtitle="A quick visual guide to the call flow, then step-by-step setup."
      />

      <Card className="mb-5">
        <h2 className="mb-4 font-display font-semibold text-text">
          How an inbound call works
        </h2>
        <div className="flex flex-wrap items-stretch gap-2">
          {CALL_FLOW.map((s, i) => (
            <div key={s.title} className="flex items-center gap-2">
              <div className="w-32 rounded-xl border border-border bg-surface p-3 text-center">
                <span className="mx-auto flex h-9 w-9 items-center justify-center rounded-lg bg-accent-tint text-accent">
                  <s.icon size={18} />
                </span>
                <div className="mt-2 text-sm font-medium text-text">
                  {s.title}
                </div>
                <div className="text-xs text-muted">{s.desc}</div>
              </div>
              {i < CALL_FLOW.length - 1 && (
                <ChevronRight size={18} className="text-accent" />
              )}
            </div>
          ))}
        </div>
      </Card>

      <Card className="mb-5">
        <h2 className="mb-4 font-display font-semibold text-text">
          {isSuper ? "Onboard a customer" : "Get set up"}
        </h2>
        <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {steps.map((s, i) => (
            <li
              key={s.title}
              className="flex gap-3 rounded-xl border border-border p-3"
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-semibold text-on-accent">
                {i + 1}
              </span>
              <span>
                <span className="block font-medium text-text">{s.title}</span>
                <span className="text-xs text-muted">{s.desc}</span>
              </span>
            </li>
          ))}
        </ol>
      </Card>

      <Card>
        <article className="prose prose-sm max-w-none prose-headings:font-display prose-headings:tracking-tight">
          <ReactMarkdown>{content}</ReactMarkdown>
        </article>
      </Card>
    </PageContainer>
  );
}
