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
  Input,
} from "@shared/ui/primitives";
import { DataTable, type Column } from "@shared/ui/DataTable";
import { Modal } from "@shared/ui/Modal";
import { useToast } from "@shared/ui/Toast";
import { Plus, Pencil, Trash2 } from "lucide-react";

interface Staff {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  title: string | null;
}

export default function StaffRoute() {
  return (
    <AppShell>
      <StaffPage />
    </AppShell>
  );
}

const empty = { name: "", email: "", phone: "", title: "" };

function StaffPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Staff | null>(null);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["staff"],
    queryFn: () => api.get<{ staff: Staff[] }>("/staff"),
  });

  function openAdd() {
    setEditing(null);
    setForm(empty);
    setOpen(true);
  }
  function openEdit(s: Staff) {
    setEditing(s);
    setForm({
      name: s.name,
      email: s.email ?? "",
      phone: s.phone ?? "",
      title: s.title ?? "",
    });
    setOpen(true);
  }

  async function save() {
    setSaving(true);
    try {
      const body = {
        name: form.name,
        email: form.email || undefined,
        phone: form.phone || undefined,
        title: form.title || undefined,
      };
      if (editing) await api.patch(`/staff/${editing.id}`, body);
      else await api.post("/staff", body);
      await qc.invalidateQueries({ queryKey: ["staff"] });
      setOpen(false);
      toast.success(editing ? "Staff updated" : "Staff added");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }
  async function remove(id: string) {
    try {
      await api.del(`/staff/${id}`);
      await qc.invalidateQueries({ queryKey: ["staff"] });
      toast.success("Staff removed");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  }

  const columns: Column<Staff>[] = [
    { key: "name", header: "Name" },
    { key: "title", header: "Title", render: (s) => s.title ?? "—" },
    { key: "email", header: "Email", render: (s) => s.email ?? "—" },
    { key: "phone", header: "Phone", render: (s) => s.phone ?? "—" },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (s) => (
        <div className="flex justify-end gap-2">
          <Button
            size="sm"
            variant="ghost"
            leftIcon={<Pencil size={14} />}
            onClick={() => openEdit(s)}
          >
            Edit
          </Button>
          <Button
            size="sm"
            variant="dangerGhost"
            leftIcon={<Trash2 size={14} />}
            onClick={() => remove(s.id)}
          >
            Delete
          </Button>
        </div>
      ),
    },
  ];

  return (
    <PageContainer>
      <PageHeader
        title="Staff"
        subtitle="The people who take appointments."
        actions={
          <Button onClick={openAdd} leftIcon={<Plus size={16} />}>
            Add staff
          </Button>
        }
      />
      <DataTable
        columns={columns}
        rows={isLoading ? [] : (data?.staff ?? [])}
        emptyMessage={isLoading ? "Loading…" : "No staff found"}
        emptyAction={
          !isLoading && (
            <Button size="sm" onClick={openAdd} leftIcon={<Plus size={14} />}>
              Add your first staff member
            </Button>
          )
        }
      />

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? "Edit staff" : "Add staff"}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
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
        </div>
      </Modal>
    </PageContainer>
  );
}
