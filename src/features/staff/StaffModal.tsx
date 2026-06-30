"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@shared/api/client";
import { Modal } from "@shared/ui/Modal";
import { Button, Field, Input } from "@shared/ui/primitives";
import { useToast } from "@shared/ui/Toast";

export interface StaffLike {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  title?: string | null;
  serviceIds?: string[];
}

interface ServiceOption {
  id: string;
  name: string;
}

/** Shared add/edit staff modal — used by the Staff page and inline from the Assistant Staff tab. */
export function StaffModal({
  open,
  onClose,
  editing,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  editing?: StaffLike | null;
  onSaved?: (id: string) => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState({ name: "", title: "", email: "", phone: "" });
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const { data: services } = useQuery({
    queryKey: ["services"],
    queryFn: () => api.get<{ services: ServiceOption[] }>("/services"),
  });

  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setForm({
        name: editing?.name ?? "",
        title: editing?.title ?? "",
        email: editing?.email ?? "",
        phone: editing?.phone ?? "",
      });
      setServiceIds(editing?.serviceIds ?? []);
    }
  }, [open, editing]);

  function toggleService(id: string) {
    setServiceIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  async function save() {
    setSaving(true);
    try {
      const body = {
        name: form.name,
        title: form.title || undefined,
        email: form.email || undefined,
        phone: form.phone || undefined,
        serviceIds,
      };
      const res = editing
        ? await api.patch<{ staff: { id: string } }>(`/staff/${editing.id}`, body)
        : await api.post<{ staff: { id: string } }>("/staff", body);
      await qc.invalidateQueries({ queryKey: ["staff"] });
      onSaved?.(res.staff.id);
      onClose();
      toast.success(editing ? "Staff updated" : "Staff added");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? "Edit staff" : "Add staff"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving || !form.name}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Name" required>
          <Input
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
        </Field>
        <Field label="Title">
          <Input
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          />
        </Field>
        <Field label="Email">
          <Input
            type="email"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
          />
        </Field>
        <Field label="Phone">
          <Input
            value={form.phone}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
          />
        </Field>
        <Field label="Services they can deliver">
          <p className="mb-1.5 text-xs text-muted">
            Leave all unchecked = can deliver every service.
          </p>
          {(services?.services.length ?? 0) === 0 ? (
            <p className="text-sm text-muted">No services yet.</p>
          ) : (
            <ul className="max-h-40 space-y-1 overflow-auto">
              {services?.services.map((s) => (
                <li key={s.id}>
                  <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 text-sm hover:bg-surface">
                    <input
                      type="checkbox"
                      checked={serviceIds.includes(s.id)}
                      onChange={() => toggleService(s.id)}
                    />
                    <span className="text-text">{s.name}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </Field>
      </div>
    </Modal>
  );
}
