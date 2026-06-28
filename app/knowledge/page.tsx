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
  Badge,
} from "@shared/ui/primitives";
import { DataTable, type Column } from "@shared/ui/DataTable";
import { Modal } from "@shared/ui/Modal";
import { useToast } from "@shared/ui/Toast";
import { Upload, Trash2 } from "lucide-react";
import type { DocumentListResponse, DocumentDTO } from "@contracts/knowledge";

export default function KnowledgeRoute() {
  return (
    <AppShell>
      <Knowledge />
    </AppShell>
  );
}

function Knowledge() {
  const qc = useQueryClient();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["knowledge"],
    queryFn: () => api.get<DocumentListResponse>("/knowledge"),
  });

  async function upload() {
    setErr(null);
    if (!file) return;
    setBusy(true);
    try {
      const buf = await file.arrayBuffer();
      const contentBase64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
      await api.post("/knowledge", {
        title: title || file.name,
        fileName: file.name,
        mimeType: file.type || "text/plain",
        contentBase64,
      });
      await qc.invalidateQueries({ queryKey: ["knowledge"] });
      setTitle("");
      setFile(null);
      setOpen(false);
      toast.success("Document uploaded");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Upload failed");
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }
  async function onDelete(id: string) {
    try {
      await api.del(`/knowledge/${id}`);
      await qc.invalidateQueries({ queryKey: ["knowledge"] });
      toast.success("Document deleted");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  }

  const columns: Column<DocumentDTO>[] = [
    { key: "title", header: "Title" },
    {
      key: "sizeBytes",
      header: "Size",
      render: (d) => (d.sizeBytes ? `${(d.sizeBytes / 1024).toFixed(1)} KB` : "—"),
    },
    {
      key: "syncStatus",
      header: "Sync",
      render: (d) => (
        <Badge tone={d.syncStatus === "synced" ? "success" : "neutral"}>
          {d.syncStatus ?? "—"}
        </Badge>
      ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (d) => (
        <Button
          size="sm"
          variant="dangerGhost"
          leftIcon={<Trash2 size={14} />}
          onClick={() => onDelete(d.id)}
        >
          Delete
        </Button>
      ),
    },
  ];

  return (
    <PageContainer>
      <PageHeader
        title="Knowledge base"
        subtitle="Documents your AI receptionist can answer questions from."
        actions={
          <Button onClick={() => setOpen(true)} leftIcon={<Upload size={16} />}>
            Upload document
          </Button>
        }
      />

      <DataTable
        columns={columns}
        rows={isLoading ? [] : (data?.documents ?? [])}
        emptyMessage={isLoading ? "Loading…" : "No documents yet"}
        emptyAction={
          !isLoading && (
            <Button size="sm" onClick={() => setOpen(true)}>
              + Upload your first document
            </Button>
          )
        }
      />

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Upload document"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={upload} disabled={busy || !file}>
              {busy ? "Uploading…" : "Upload"}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Title (optional)">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Defaults to file name"
            />
          </Field>
          <div>
            <span className="mb-1.5 block text-sm font-medium text-ink2">File</span>
            <input
              type="file"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-accent file:px-3 file:py-1.5 file:text-on-accent hover:file:brightness-110"
            />
          </div>
          {err && <p className="text-sm text-danger">{err}</p>}
        </div>
      </Modal>
    </PageContainer>
  );
}
