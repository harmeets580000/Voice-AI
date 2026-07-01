"use client";

import {
  Upload,
  Filter,
  Bot,
  Megaphone,
  Target,
  CalendarCheck,
  ChevronRight,
  type LucideIcon,
} from "lucide-react";
import { AppShell } from "@shared/ui/AppShell";
import { PageContainer, PageHeader, Card } from "@shared/ui/primitives";

const FLOW: { icon: LucideIcon; title: string; desc: string }[] = [
  { icon: Upload, title: "Import contacts", desc: "CSV or add manually" },
  { icon: Filter, title: "Build a segment", desc: "Save an audience" },
  { icon: Bot, title: "Script an agent", desc: "Persona + goals" },
  { icon: Megaphone, title: "Launch a campaign", desc: "Queues calls (stub)" },
  { icon: Target, title: "Work the pipeline", desc: "6-stage leads board" },
  { icon: CalendarCheck, title: "Book a meeting", desc: "Convert a hot lead" },
];

const STEPS = [
  {
    title: "Add contacts",
    desc: "Import a CSV (map columns → preview → confirm) or add one by hand.",
  },
  {
    title: "Save a segment",
    desc: "Filter contacts (tags / source) into a reusable audience. Opted-out contacts are always excluded.",
  },
  {
    title: "Create an outbound agent",
    desc: "A sales script/persona with goals and actions (config only this phase).",
  },
  {
    title: "Add a from-number",
    desc: "Under Phone numbers — required to place calls or launch a campaign.",
  },
  {
    title: "Build & launch a campaign",
    desc: "Pick a segment + agent, review the audience count, then Launch to queue calls.",
  },
  {
    title: "Work leads → book meetings",
    desc: "Promote contacts to leads, drag them across the pipeline, then Convert → Meeting.",
  },
];

const NOTES = [
  "Nothing actually dials yet — calls and campaign launches create QUEUED stub calls only.",
  "Opt-out / DNC is honored everywhere: opted-out contacts never enter an audience and can't be called.",
  "A lead is always backed by a contact; adding a lead upserts its contact first.",
  "Campaign launch is capped (default 1,000) and batched; over-cap audiences are rejected at review.",
  "Reps can import, work leads, promote, and place calls; creating agents/campaigns is admin-only.",
];

export default function OutboundHelpRoute() {
  return (
    <AppShell>
      <OutboundHelpPage />
    </AppShell>
  );
}

function OutboundHelpPage() {
  return (
    <PageContainer>
      <PageHeader
        title="How outbound sales works"
        subtitle="A quick visual guide to the outbound flow, then step-by-step setup."
      />

      <Card className="mb-5">
        <h2 className="mb-4 font-display font-semibold text-text">
          The outbound loop
        </h2>
        <div className="flex flex-wrap items-stretch gap-2">
          {FLOW.map((s, i) => (
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
              {i < FLOW.length - 1 && (
                <ChevronRight size={18} className="text-accent" />
              )}
            </div>
          ))}
        </div>
      </Card>

      <Card className="mb-5">
        <h2 className="mb-4 font-display font-semibold text-text">Get set up</h2>
        <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {STEPS.map((s, i) => (
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
        <h2 className="mb-3 font-display font-semibold text-text">
          Good to know
        </h2>
        <ul className="space-y-2">
          {NOTES.map((n) => (
            <li key={n} className="flex gap-2 text-sm text-muted">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
              {n}
            </li>
          ))}
        </ul>
      </Card>
    </PageContainer>
  );
}
