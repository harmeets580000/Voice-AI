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
import { Plus, Trash2 } from "lucide-react";
import type {
  SegmentsResponse,
  SegmentDTO,
  AudienceCountResponse,
  ContactFilterSchema,
} from "@contracts/outbound-segments";

export default function OutboundSegmentsRoute() {
  return (
    <AppShell>
      <SegmentsPage />
    </AppShell>
  );
}

const emptyForm = { name: "", search: "", tags: "", source: "" };

function toFilter(form: typeof emptyForm): ContactFilterSchema {
  return {
    search: form.search || undefined,
    source: form.source || undefined,
    tags: form.tags
      ? form.tags.split(/[;,]/).map((t) => t.trim()).filter(Boolean)
      : undefined,
  };
}

function summarize(f: ContactFilterSchema): string {
  const parts: string[] = [];
  if (f.search) parts.push(`search "${f.search}"`);
  if (f.tags?.length) parts.push(`tags: ${f.tags.join(", ")}`);
  if (f.source) parts.push(`source: ${f.source}`);
  return parts.length ? parts.join(" · ") : "all contacts";
}

function SegmentsPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["outbound-segments"],
    queryFn: () => api.get<SegmentsResponse>("/outbound/segments"),
  });

  // Live audience count for the segment being built (opt-out already excluded server-side).
  const { data: count } = useQuery({
    queryKey: ["outbound-audience", form.search, form.tags, form.source],
    queryFn: () =>
      api.post<AudienceCountResponse>("/outbound/segments/audience", {
        filter: toFilter(form),
      }),
    enabled: open,
  });

  async function save() {
    setSaving(true);
    try {
      await api.post("/outbound/segments", {
        name: form.name,
        filter: toFilter(form),
      });
      await qc.invalidateQueries({ queryKey: ["outbound-segments"] });
      setForm(emptyForm);
      setOpen(false);
      toast.success("Segment saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!window.confirm("Delete this segment?")) return;
    try {
      await api.del(`/outbound/segments/${id}`);
      await qc.invalidateQueries({ queryKey: ["outbound-segments"] });
      toast.success("Segment deleted");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  }

  const columns: Column<SegmentDTO>[] = [
    { key: "name", header: "Name", render: (s) => s.name },
    { key: "filter", header: "Filter", render: (s) => summarize(s.filter) },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (s) => (
        <Button
          size="sm"
          variant="dangerGhost"
          onClick={() => remove(s.id)}
          leftIcon={<Trash2 size={14} />}
        >
          Delete
        </Button>
      ),
    },
  ];

  return (
    <PageContainer>
      <PageHeader
        title="Segments"
        subtitle="Saved, reusable audiences. Opted-out contacts are always excluded."
        actions={
          <Button onClick={() => setOpen(true)} leftIcon={<Plus size={16} />}>
            New segment
          </Button>
        }
      />

      <DataTable
        columns={columns}
        rows={isLoading ? [] : (data?.segments ?? [])}
        emptyMessage={isLoading ? "Loading…" : "No segments yet"}
      />

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="New segment"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving || !form.name}>
              {saving ? "Saving…" : "Save segment"}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Segment name" required>
            <Input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </Field>
          <Field label="Search (name / phone / email)">
            <Input
              value={form.search}
              onChange={(e) =>
                setForm((f) => ({ ...f, search: e.target.value }))
              }
            />
          </Field>
          <Field label="Tags (comma-separated, match any)">
            <Input
              value={form.tags}
              onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))}
            />
          </Field>
          <Field label="Source">
            <Input
              value={form.source}
              onChange={(e) =>
                setForm((f) => ({ ...f, source: e.target.value }))
              }
            />
          </Field>
          <p className="text-sm text-muted">
            Live audience: <strong>{count?.count ?? "…"}</strong> contacts
          </p>
        </div>
      </Modal>
    </PageContainer>
  );
}
