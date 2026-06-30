"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@shared/ui/AppShell";
import { api } from "@shared/api/client";
import { PageContainer, PageHeader, Button, Badge } from "@shared/ui/primitives";
import { DataTable, type Column } from "@shared/ui/DataTable";
import { KnowledgeModal } from "@features/knowledge/KnowledgeModal";
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

  const { data, isLoading } = useQuery({
    queryKey: ["knowledge"],
    queryFn: () => api.get<DocumentListResponse>("/knowledge"),
  });

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

      <KnowledgeModal open={open} onClose={() => setOpen(false)} />
    </PageContainer>
  );
}
