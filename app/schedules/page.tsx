"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@shared/ui/AppShell";
import { api } from "@shared/api/client";
import {
  PageContainer,
  PageHeader,
  Button,
  Field,
  Select,
  Input,
} from "@shared/ui/primitives";
import { DataTable, type Column } from "@shared/ui/DataTable";
import { Modal } from "@shared/ui/Modal";
import { useToast } from "@shared/ui/Toast";
import { Plus, Trash2 } from "lucide-react";

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
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    staffId: "",
    dayOfWeek: "1",
    startTime: "09:00",
    endTime: "17:00",
  });
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

  // Days already scheduled for the staff member selected in the form (only one per day).
  const takenDays = new Set(
    (schedules?.schedules ?? [])
      .filter((s) => s.staffId === form.staffId)
      .map((s) => s.dayOfWeek),
  );
  const dayTaken = takenDays.has(Number(form.dayOfWeek));

  async function save() {
    setSaving(true);
    try {
      await api.post("/schedules", {
        staffId: form.staffId,
        dayOfWeek: Number(form.dayOfWeek),
        startTime: form.startTime,
        endTime: form.endTime,
      });
      await qc.invalidateQueries({ queryKey: ["schedules"] });
      setOpen(false);
      toast.success("Schedule added");
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
        subtitle="Each staff member's recurring working hours."
        actions={
          <Button
            onClick={() => setOpen(true)}
            disabled={!staff?.staff.length}
            leftIcon={<Plus size={16} />}
          >
            Add schedule
          </Button>
        }
      />
      <DataTable
        columns={columns}
        rows={isLoading ? [] : (schedules?.schedules ?? [])}
        emptyMessage={
          isLoading
            ? "Loading…"
            : staff?.staff.length
              ? "No schedules found"
              : "Add staff first, then set their schedules"
        }
      />

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Add schedule"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving || !form.staffId || dayTaken}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Staff" required>
            <Select
              value={form.staffId}
              onChange={(e) =>
                setForm((f) => ({ ...f, staffId: e.target.value }))
              }
            >
              <option value="">Select…</option>
              {staff?.staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Day of week">
            <Select
              value={form.dayOfWeek}
              onChange={(e) =>
                setForm((f) => ({ ...f, dayOfWeek: e.target.value }))
              }
            >
              {DAYS.map((d, i) => (
                <option key={d} value={i} disabled={takenDays.has(i)}>
                  {d}
                  {takenDays.has(i) ? " (already scheduled)" : ""}
                </option>
              ))}
            </Select>
          </Field>
          {dayTaken && (
            <p className="text-sm text-danger">
              {staffName(form.staffId)} already has a schedule for{" "}
              {DAYS[Number(form.dayOfWeek)]}. Pick another day or delete the
              existing one.
            </p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Start">
              <Input
                type="time"
                value={form.startTime}
                onChange={(e) =>
                  setForm((f) => ({ ...f, startTime: e.target.value }))
                }
              />
            </Field>
            <Field label="End">
              <Input
                type="time"
                value={form.endTime}
                onChange={(e) =>
                  setForm((f) => ({ ...f, endTime: e.target.value }))
                }
              />
            </Field>
          </div>
        </div>
      </Modal>
    </PageContainer>
  );
}
