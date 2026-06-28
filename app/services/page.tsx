"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@shared/ui/AppShell";
import { api } from "@shared/api/client";
import { PageContainer, PageHeader, Button } from "@shared/ui/primitives";
import { DataTable, type Column } from "@shared/ui/DataTable";
import { ServiceModal, type ServiceLike } from "@features/services/ServiceModal";
import { useToast } from "@shared/ui/Toast";
import { Plus, Pencil, Trash2 } from "lucide-react";

interface Service extends ServiceLike {
  durationMinutes: number;
}

export default function ServicesRoute() {
  return (
    <AppShell>
      <ServicesPage />
    </AppShell>
  );
}

function ServicesPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Service | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["services"],
    queryFn: () => api.get<{ services: Service[] }>("/services"),
  });

  async function remove(id: string) {
    try {
      await api.del(`/services/${id}`);
      await qc.invalidateQueries({ queryKey: ["services"] });
      toast.success("Service removed");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  }

  const columns: Column<Service>[] = [
    { key: "name", header: "Name" },
    {
      key: "durationMinutes",
      header: "Duration",
      render: (s) => `${s.durationMinutes} min`,
    },
    { key: "price", header: "Price", render: (s) => (s.price ? `$${s.price}` : "—") },
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
            onClick={() => {
              setEditing(s);
              setOpen(true);
            }}
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
        title="Services"
        subtitle="What you offer and how long each takes."
        actions={
          <Button
            leftIcon={<Plus size={16} />}
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
          >
            Add service
          </Button>
        }
      />
      <DataTable
        columns={columns}
        rows={isLoading ? [] : (data?.services ?? [])}
        emptyMessage={isLoading ? "Loading…" : "No services found"}
        emptyAction={
          !isLoading && (
            <Button
              size="sm"
              onClick={() => {
                setEditing(null);
                setOpen(true);
              }}
            >
              + Add your first service
            </Button>
          )
        }
      />
      <ServiceModal open={open} onClose={() => setOpen(false)} editing={editing} />
    </PageContainer>
  );
}
