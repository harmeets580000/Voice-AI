"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@shared/ui/AppShell";
import { useAuth } from "@features/auth/AuthProvider";
import { api } from "@shared/api/client";
import {
  PageContainer,
  PageHeader,
  Button,
  Badge,
  Field,
  Input,
  Select,
} from "@shared/ui/primitives";
import { DataTable, type Column } from "@shared/ui/DataTable";
import { Modal } from "@shared/ui/Modal";
import { useToast } from "@shared/ui/Toast";
import { Plus, Upload } from "lucide-react";
import { Role } from "@domain/enums";
import { CsvImportModal } from "@features/outbound/CsvImportModal";
import type {
  ContactsResponse,
  OutboundContactDTO,
  ImportSummaryDTO,
} from "@contracts/outbound-contacts";

export default function OutboundContactsRoute() {
  return (
    <AppShell>
      <ContactsPage />
    </AppShell>
  );
}

const emptyForm = { name: "", phone: "", email: "", notes: "" };

function ContactsPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const { user } = useAuth();
  const isAdmin =
    user?.role === Role.ORG_ADMIN || user?.role === Role.SUPER_ADMIN;

  const [q, setQ] = useState("");
  const [optOutFilter, setOptOutFilter] = useState<"" | "true" | "false">("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const params = new URLSearchParams();
  if (q) params.set("search", q);
  if (optOutFilter) params.set("optOut", optOutFilter);
  const qs = params.toString();

  const { data, isLoading } = useQuery({
    queryKey: ["outbound-contacts", qs],
    queryFn: () =>
      api.get<ContactsResponse>(`/outbound/contacts${qs ? `?${qs}` : ""}`),
  });

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function saveContact() {
    setSaving(true);
    try {
      await api.post("/outbound/contacts", {
        name: form.name || undefined,
        phone: form.phone || undefined,
        email: form.email || undefined,
        notes: form.notes || undefined,
      });
      await qc.invalidateQueries({ queryKey: ["outbound-contacts"] });
      setForm(emptyForm);
      setAddOpen(false);
      toast.success("Contact added");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function bulk(
    action: "opt_out" | "opt_in" | "add_tag" | "delete" | "promote",
  ) {
    let tag: string | undefined;
    if (action === "add_tag") {
      tag = window.prompt("Tag to add to selected contacts?") ?? undefined;
      if (!tag) return;
    }
    if (action === "delete" && !window.confirm(`Delete ${selected.size} contacts?`))
      return;
    try {
      const res = await api.post<{
        promoted?: number;
        skippedOptOut?: number;
        skippedExisting?: number;
      }>("/outbound/contacts/bulk", { ids: [...selected], action, tag });
      await qc.invalidateQueries({ queryKey: ["outbound-contacts"] });
      setSelected(new Set());
      if (action === "promote") {
        toast.success(
          `Promoted ${res.promoted ?? 0} · skipped ${
            (res.skippedOptOut ?? 0) + (res.skippedExisting ?? 0)
          }`,
        );
      } else {
        toast.success("Done");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed");
    }
  }

  const columns: Column<OutboundContactDTO>[] = [
    {
      key: "select",
      header: "",
      render: (c) => (
        <input
          type="checkbox"
          aria-label={`Select ${c.name ?? c.phone ?? c.id}`}
          checked={selected.has(c.id)}
          onChange={() => toggle(c.id)}
        />
      ),
    },
    { key: "name", header: "Name", render: (c) => c.name ?? "—" },
    { key: "phone", header: "Phone", render: (c) => c.phone ?? "—" },
    { key: "email", header: "Email", render: (c) => c.email ?? "—" },
    {
      key: "tags",
      header: "Tags",
      render: (c) => (c.tags.length ? c.tags.join(", ") : "—"),
    },
    {
      key: "status",
      header: "Status",
      render: (c) =>
        c.optOut ? (
          <Badge tone="danger">Opted out</Badge>
        ) : (
          <Badge tone="success">Active</Badge>
        ),
    },
  ];

  return (
    <PageContainer>
      <PageHeader
        title="Contacts"
        subtitle="Your sales audience. Import, tag, segment, and promote to leads."
        actions={
          <>
            <Button
              variant="secondary"
              onClick={() => setImportOpen(true)}
              leftIcon={<Upload size={16} />}
            >
              Import CSV
            </Button>
            <Button onClick={() => setAddOpen(true)} leftIcon={<Plus size={16} />}>
              Add contact
            </Button>
          </>
        }
      />

      <div className="mb-3 flex gap-2">
        <Input
          placeholder="Search name / phone / email"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <Select
          value={optOutFilter}
          onChange={(e) =>
            setOptOutFilter(e.target.value as "" | "true" | "false")
          }
          className="max-w-48"
        >
          <option value="">All contacts</option>
          <option value="false">Active only</option>
          <option value="true">Opted out only</option>
        </Select>
      </div>

      {selected.size > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm">
          <span className="text-muted">{selected.size} selected</span>
          <Button size="sm" onClick={() => bulk("promote")}>
            Promote to leads
          </Button>
          <Button size="sm" variant="secondary" onClick={() => bulk("add_tag")}>
            Add tag
          </Button>
          <Button size="sm" variant="secondary" onClick={() => bulk("opt_out")}>
            Opt out
          </Button>
          <Button size="sm" variant="secondary" onClick={() => bulk("opt_in")}>
            Opt in
          </Button>
          {isAdmin && (
            <Button
              size="sm"
              variant="dangerGhost"
              onClick={() => bulk("delete")}
            >
              Delete
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setSelected(new Set())}
          >
            Clear
          </Button>
        </div>
      )}

      <DataTable
        columns={columns}
        rows={isLoading ? [] : (data?.contacts ?? [])}
        emptyMessage={isLoading ? "Loading…" : "No contacts yet"}
        emptyAction={
          !isLoading && (
            <Button size="sm" onClick={() => setImportOpen(true)}>
              Import a CSV
            </Button>
          )
        }
      />

      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Add contact"
        footer={
          <>
            <Button variant="secondary" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={saveContact}
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
          <Field label="Notes">
            <Input
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            />
          </Field>
        </div>
      </Modal>

      <CsvImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="Import contacts"
        fields={[
          { key: "name", label: "Name" },
          { key: "phone", label: "Phone" },
          { key: "email", label: "Email" },
          { key: "notes", label: "Notes" },
          { key: "tags", label: "Tags (comma-separated)" },
          { key: "source", label: "Source" },
        ]}
        onImport={async ({ filename, mapping, parsedRows }) => {
          const mapped = new Set(Object.values(mapping));
          const rows = parsedRows.map((pr) => {
            const get = (f: string) =>
              mapping[f] ? pr[mapping[f]]?.trim() || undefined : undefined;
            const customFields: Record<string, string> = {};
            for (const [h, v] of Object.entries(pr)) {
              if (!mapped.has(h) && v) customFields[h] = v;
            }
            const tags = get("tags");
            return {
              name: get("name"),
              phone: get("phone"),
              email: get("email"),
              notes: get("notes"),
              source: get("source"),
              tags: tags
                ? tags.split(/[;,]/).map((t) => t.trim()).filter(Boolean)
                : undefined,
              customFields: Object.keys(customFields).length
                ? customFields
                : undefined,
            };
          });
          const res = await api.post<{ summary: ImportSummaryDTO }>(
            "/outbound/contacts/import",
            { filename, mapping, rows },
          );
          await qc.invalidateQueries({ queryKey: ["outbound-contacts"] });
          return res.summary;
        }}
      />
    </PageContainer>
  );
}
