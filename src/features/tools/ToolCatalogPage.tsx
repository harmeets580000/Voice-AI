"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@shared/api/client";
import { useAuth } from "@features/auth/AuthProvider";
import { PageContainer, PageHeader, Card, Badge } from "@shared/ui/primitives";
import { DataTable, type Column } from "@shared/ui/DataTable";
import type { ToolCatalogResponse, ToolCatalogItem } from "@contracts/assistants";

const GROUP_LABELS: Record<string, string> = {
  booking: "Booking",
  customer: "Customer",
  service: "Service",
  staff: "Staff",
};

/**
 * The org-level action catalog — every tool an assistant can be given, as a single clean list.
 * Read-only here; each assistant selects its own subset on the Assistants page.
 */
export function ToolCatalogPage() {
  const { user, activeOrgId } = useAuth();
  const orgId = activeOrgId ?? user?.organizationId ?? null;

  const { data, isLoading } = useQuery({
    queryKey: ["tool-catalog", orgId],
    queryFn: () =>
      api.get<ToolCatalogResponse>(`/organizations/${orgId}/tools/catalog`),
    enabled: !!orgId,
  });

  type ToolRow = ToolCatalogItem & { id: string };
  const tools: ToolRow[] = [...(data?.tools ?? [])]
    .map((t) => ({ ...t, id: t.name }))
    .sort((a, b) => a.group.localeCompare(b.group) || a.name.localeCompare(b.name));

  const columns: Column<ToolRow>[] = [
    {
      key: "name",
      header: "Tool",
      render: (t) => <span className="font-mono text-xs text-text">{t.name}</span>,
    },
    {
      key: "group",
      header: "Group",
      render: (t) => (
        <span className="text-sm text-muted">{GROUP_LABELS[t.group] ?? t.group}</span>
      ),
    },
    {
      key: "access",
      header: "Access",
      render: (t) => (
        <Badge tone={t.access === "write" ? "warning" : "neutral"}>{t.access}</Badge>
      ),
    },
    {
      key: "description",
      header: "Description",
      className: "text-muted",
      render: (t) => <span className="text-sm">{t.description}</span>,
    },
  ];

  return (
    <PageContainer>
      <PageHeader
        title="Tools"
        subtitle="The actions your assistants can perform. Assign them per-assistant on the Assistants page."
      />
      {!orgId ? (
        <Card className="p-6 text-sm text-muted">
          Select an organization to view its tool catalog.
        </Card>
      ) : (
        <DataTable
          columns={columns}
          rows={isLoading ? [] : tools}
          pageSize={100}
          emptyMessage={isLoading ? "Loading…" : "No tools in the catalog."}
        />
      )}
    </PageContainer>
  );
}
