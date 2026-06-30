"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@shared/ui/AppShell";
import { api } from "@shared/api/client";
import { PageContainer, PageHeader, Button } from "@shared/ui/primitives";
import { DataTable, type Column } from "@shared/ui/DataTable";
import { StaffModal, type StaffLike } from "@features/staff/StaffModal";
import { useToast } from "@shared/ui/Toast";
import { Plus, Pencil, Trash2 } from "lucide-react";

interface Staff {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  title: string | null;
  serviceIds: string[];
}

export default function StaffRoute() {
  return (
    <AppShell>
      <StaffPage />
    </AppShell>
  );
}

function StaffPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<StaffLike | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["staff"],
    queryFn: () => api.get<{ staff: Staff[] }>("/staff"),
  });

  function openAdd() {
    setEditing(null);
    setOpen(true);
  }
  function openEdit(s: Staff) {
    setEditing(s);
    setOpen(true);
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
      key: "services",
      header: "Services",
      render: (s) =>
        s.serviceIds.length === 0 ? "All" : `${s.serviceIds.length} selected`,
    },
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

      <StaffModal open={open} onClose={() => setOpen(false)} editing={editing} />
    </PageContainer>
  );
}
