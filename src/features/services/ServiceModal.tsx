"use client";

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@shared/api/client";
import { Modal } from "@shared/ui/Modal";
import { Button, Field, Input, Textarea } from "@shared/ui/primitives";
import { useToast } from "@shared/ui/Toast";

export interface ServiceLike {
  id: string;
  name: string;
  description?: string | null;
  durationMinutes: number;
  price?: string | null;
}

/** Shared add/edit service modal — used by the Services page and inline from Bookings. */
export function ServiceModal({
  open,
  onClose,
  editing,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  editing?: ServiceLike | null;
  onSaved?: (id: string) => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState({
    name: "",
    description: "",
    durationMinutes: "30",
    price: "",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setForm({
        name: editing?.name ?? "",
        description: editing?.description ?? "",
        durationMinutes: String(editing?.durationMinutes ?? 30),
        price: editing?.price ?? "",
      });
    }
  }, [open, editing]);

  async function save() {
    setSaving(true);
    try {
      const body = {
        name: form.name,
        description: form.description || undefined,
        durationMinutes: Number(form.durationMinutes),
        price: form.price ? Number(form.price) : undefined,
      };
      const res = editing
        ? await api.patch<{ service: { id: string } }>(
            `/services/${editing.id}`,
            body,
          )
        : await api.post<{ service: { id: string } }>("/services", body);
      await qc.invalidateQueries({ queryKey: ["services"] });
      onSaved?.(res.service.id);
      onClose();
      toast.success(editing ? "Service updated" : "Service added");
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
      title={editing ? "Edit service" : "Add service"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={save}
            disabled={saving || !form.name || !form.durationMinutes}
          >
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
        <Field label="Description">
          <Textarea
            rows={2}
            value={form.description}
            onChange={(e) =>
              setForm((f) => ({ ...f, description: e.target.value }))
            }
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Duration (minutes)" required>
            <Input
              type="number"
              value={form.durationMinutes}
              onChange={(e) =>
                setForm((f) => ({ ...f, durationMinutes: e.target.value }))
              }
            />
          </Field>
          <Field label="Price">
            <Input
              type="number"
              value={form.price}
              onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
            />
          </Field>
        </div>
      </div>
    </Modal>
  );
}
