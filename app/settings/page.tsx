"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { SlidersHorizontal, Palette } from "lucide-react";
import { AppShell } from "@shared/ui/AppShell";
import { api } from "@shared/api/client";
import {
  PageContainer,
  PageHeader,
  Card,
  Button,
  Field,
  Select,
  cx,
} from "@shared/ui/primitives";
import { useToast } from "@shared/ui/Toast";
import { ThemeConfigPage } from "@features/theme-config/ThemeConfigPage";
import {
  DATE_FORMAT_PRESETS,
  DEFAULT_DATE_FORMAT,
  type SettingsResponse,
  type DateFormat,
} from "@contracts/settings";
import { formatDateTime } from "@shared/format";

type Tab = "general" | "appearance";

export default function SettingsRoute() {
  return (
    <AppShell>
      <Suspense fallback={null}>
        <SettingsPage />
      </Suspense>
    </AppShell>
  );
}

function SettingsPage() {
  const params = useSearchParams();
  const initial: Tab =
    params.get("tab") === "appearance" ? "appearance" : "general";
  const [tab, setTab] = useState<Tab>(initial);

  const tabs: { id: Tab; label: string; icon: typeof Palette }[] = [
    { id: "general", label: "General", icon: SlidersHorizontal },
    { id: "appearance", label: "Appearance", icon: Palette },
  ];

  return (
    <PageContainer>
      <PageHeader title="Settings" subtitle="Preferences for your organization." />

      <div className="mb-5 flex gap-1 border-b border-border">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cx(
              "flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm transition-colors",
              tab === t.id
                ? "border-accent font-medium text-accent"
                : "border-transparent text-muted hover:text-text",
            )}
          >
            <t.icon size={16} />
            {t.label}
          </button>
        ))}
      </div>

      {tab === "general" && <GeneralSettings />}
      {tab === "appearance" && <ThemeConfigPage />}
    </PageContainer>
  );
}

function GeneralSettings() {
  const qc = useQueryClient();
  const toast = useToast();
  const [dateFormat, setDateFormat] = useState<DateFormat>(
    DEFAULT_DATE_FORMAT as DateFormat,
  );
  const [saving, setSaving] = useState(false);

  const { data } = useQuery({
    queryKey: ["settings"],
    queryFn: () => api.get<SettingsResponse>("/settings"),
  });

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (data?.dateFormat) setDateFormat(data.dateFormat);
  }, [data]);

  async function save() {
    setSaving(true);
    try {
      await api.put("/settings", { dateFormat });
      await qc.invalidateQueries({ queryKey: ["settings"] });
      toast.success("Settings saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="max-w-xl space-y-4">
      <Field label="Date & time format">
        <Select
          value={dateFormat}
          onChange={(e) => setDateFormat(e.target.value as DateFormat)}
        >
          {DATE_FORMAT_PRESETS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label} — {p.sample}
            </option>
          ))}
        </Select>
      </Field>
      <p className="text-sm text-muted">
        Preview:{" "}
        <strong className="text-text">
          {formatDateTime(new Date(), dateFormat)}
        </strong>
        . Applies across bookings, calls, and the calendar.
      </p>
      <div>
        <Button onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
    </Card>
  );
}
