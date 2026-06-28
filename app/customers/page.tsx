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
import { Plus } from "lucide-react";

interface Customer {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
}

export default function CustomersRoute() {
  return (
    <AppShell>
      <CustomersPage />
    </AppShell>
  );
}

const empty = { name: "", phone: "", email: "" };

function CustomersPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["customers", q],
    queryFn: () =>
      api.get<{ customers: Customer[] }>(
        `/customers${q ? `?q=${encodeURIComponent(q)}` : ""}`,
      ),
  });

  async function save() {
    setSaving(true);
    try {
      await api.post("/customers", {
        name: form.name || undefined,
        phone: form.phone || undefined,
        email: form.email || undefined,
      });
      await qc.invalidateQueries({ queryKey: ["customers"] });
      setForm(empty);
      setOpen(false);
      toast.success("Customer added");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const columns: Column<Customer>[] = [
    { key: "name", header: "Name", render: (c) => c.name ?? "—" },
    { key: "phone", header: "Phone", render: (c) => c.phone ?? "—" },
    { key: "email", header: "Email", render: (c) => c.email ?? "—" },
  ];

  return (
    <PageContainer>
      <PageHeader
        title="Customers"
        subtitle="End-callers and their details."
        actions={
          <Button onClick={() => setOpen(true)} leftIcon={<Plus size={16} />}>
            Add customer
          </Button>
        }
      />

      <div className="mb-3">
        <Input
          placeholder="Search name / phone / email"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      <DataTable
        columns={columns}
        rows={isLoading ? [] : (data?.customers ?? [])}
        emptyMessage={isLoading ? "Loading…" : "No customers found"}
        emptyAction={
          !isLoading && (
            <Button size="sm" onClick={() => setOpen(true)}>
              + Add a customer
            </Button>
          )
        }
      />

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Add customer"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={save}
              disabled={saving || (!form.name && !form.phone && !form.email)}
            >
              {saving ? "Saving…" : "Save"}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Name">
            <Input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </Field>
          <Field label="Phone">
            <Input
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            />
          </Field>
          <Field label="Email">
            <Input
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            />
          </Field>
        </div>
      </Modal>
    </PageContainer>
  );
}
