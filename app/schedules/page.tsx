"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@shared/ui/AppShell";
import { api } from "@shared/api/client";
import {
  PageContainer,
  PageHeader,
  Button,
  Card,
  Field,
  Select,
  Input,
} from "@shared/ui/primitives";
import { DataTable, type Column } from "@shared/ui/DataTable";
import { useToast } from "@shared/ui/Toast";
import { Save, Trash2 } from "lucide-react";

interface Staff {
  id: string;
  name: string;
}
interface Schedule {
  id: string;
  staffId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
// Display order Mon→Sun (more natural than Sun-first) while keeping 0=Sun..6=Sat indices.
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const WEEKDAYS = [1, 2, 3, 4, 5];

type Row = { enabled: boolean; startTime: string; endTime: string };
const emptyRow = (): Row => ({ enabled: false, startTime: "09:00", endTime: "17:00" });
const emptyGrid = (): Record<number, Row> =>
  Object.fromEntries(DAY_ORDER.map((d) => [d, emptyRow()]));

export default function SchedulesRoute() {
  return (
    <AppShell>
      <SchedulesPage />
    </AppShell>
  );
}

function SchedulesPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const [staffId, setStaffId] = useState("");
  const [grid, setGrid] = useState<Record<number, Row>>(emptyGrid());
  const [tmpl, setTmpl] = useState({ startTime: "09:00", endTime: "17:00" });
  const [saving, setSaving] = useState(false);

  const { data: staff } = useQuery({
    queryKey: ["staff"],
    queryFn: () => api.get<{ staff: Staff[] }>("/staff"),
  });
  const { data: schedules, isLoading } = useQuery({
    queryKey: ["schedules"],
    queryFn: () => api.get<{ schedules: Schedule[] }>("/schedules"),
  });

  const staffName = (id: string) =>
    staff?.staff.find((s) => s.id === id)?.name ?? id;

  // Load the selected staff member's current week into the grid.
  useEffect(() => {
    const next = emptyGrid();
    if (staffId) {
      for (const s of schedules?.schedules ?? []) {
        if (s.staffId === staffId) {
          next[s.dayOfWeek] = {
            enabled: true,
            startTime: s.startTime,
            endTime: s.endTime,
          };
        }
      }
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setGrid(next);
  }, [staffId, schedules]);

  function setDay(day: number, patch: Partial<Row>) {
    setGrid((g) => ({ ...g, [day]: { ...g[day], ...patch } }));
  }
  function applyTemplate(days: number[]) {
    setGrid((g) => {
      const next = { ...g };
      for (const d of days) {
        next[d] = { enabled: true, startTime: tmpl.startTime, endTime: tmpl.endTime };
      }
      return next;
    });
  }

  async function saveWeek() {
    setSaving(true);
    try {
      const days = DAY_ORDER.filter((d) => grid[d].enabled).map((d) => ({
        dayOfWeek: d,
        startTime: grid[d].startTime,
        endTime: grid[d].endTime,
      }));
      await api.put(`/schedules/bulk`, { staffId, days });
      await qc.invalidateQueries({ queryKey: ["schedules"] });
      toast.success("Weekly schedule saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }
  async function remove(id: string) {
    try {
      await api.del(`/schedules/${id}`);
      await qc.invalidateQueries({ queryKey: ["schedules"] });
      toast.success("Schedule removed");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  }

  const columns: Column<Schedule>[] = [
    { key: "staff", header: "Staff", render: (s) => staffName(s.staffId) },
    { key: "day", header: "Day", render: (s) => DAYS[s.dayOfWeek] },
    {
      key: "hours",
      header: "Hours",
      render: (s) => `${s.startTime} – ${s.endTime}`,
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (s) => (
        <Button
          size="sm"
          variant="dangerGhost"
          leftIcon={<Trash2 size={14} />}
          onClick={() => remove(s.id)}
        >
          Delete
        </Button>
      ),
    },
  ];

  return (
    <PageContainer>
      <PageHeader
        title="Weekly schedules"
        subtitle="Set each staff member's recurring working hours for the whole week at once."
      />

      <Card className="mb-5 space-y-4">
        <Field label="Staff" required>
          <Select value={staffId} onChange={(e) => setStaffId(e.target.value)} className="w-64">
            <option value="">Select a staff member…</option>
            {staff?.staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>

        {staffId && (
          <>
            <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-surface p-3">
              <Field label="Quick fill — start">
                <Input
                  type="time"
                  value={tmpl.startTime}
                  onChange={(e) => setTmpl((t) => ({ ...t, startTime: e.target.value }))}
                  className="w-32"
                />
              </Field>
              <Field label="End">
                <Input
                  type="time"
                  value={tmpl.endTime}
                  onChange={(e) => setTmpl((t) => ({ ...t, endTime: e.target.value }))}
                  className="w-32"
                />
              </Field>
              <Button size="sm" variant="secondary" onClick={() => applyTemplate(WEEKDAYS)}>
                Apply to weekdays
              </Button>
              <Button size="sm" variant="secondary" onClick={() => applyTemplate(DAY_ORDER)}>
                Apply to every day
              </Button>
            </div>

            <ul className="space-y-1">
              {DAY_ORDER.map((d) => {
                const row = grid[d];
                return (
                  <li
                    key={d}
                    className="flex flex-wrap items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-surface"
                  >
                    <label className="flex w-28 cursor-pointer items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={row.enabled}
                        onChange={(e) => setDay(d, { enabled: e.target.checked })}
                      />
                      <span className="font-medium text-text">{DAYS[d]}</span>
                    </label>
                    <Input
                      type="time"
                      value={row.startTime}
                      disabled={!row.enabled}
                      onChange={(e) => setDay(d, { startTime: e.target.value })}
                      className="w-32"
                    />
                    <span className="text-muted">–</span>
                    <Input
                      type="time"
                      value={row.endTime}
                      disabled={!row.enabled}
                      onChange={(e) => setDay(d, { endTime: e.target.value })}
                      className="w-32"
                    />
                  </li>
                );
              })}
            </ul>

            <Button leftIcon={<Save size={16} />} onClick={saveWeek} disabled={saving}>
              {saving ? "Saving…" : "Save week"}
            </Button>
          </>
        )}
      </Card>

      <DataTable
        columns={columns}
        rows={isLoading ? [] : (schedules?.schedules ?? [])}
        emptyMessage={
          isLoading
            ? "Loading…"
            : staff?.staff.length
              ? "No schedules yet — pick a staff member above to set their week."
              : "Add staff first, then set their schedules"
        }
      />
    </PageContainer>
  );
}
