"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@shared/api/client";
import { useAuth } from "@features/auth/AuthProvider";
import { PageContainer, PageHeader, Card, Badge } from "@shared/ui/primitives";
import type { ToolCatalogResponse, ToolCatalogItem } from "@contracts/assistants";

const GROUP_LABELS: Record<string, string> = {
  booking: "Booking",
  customer: "Customer",
  service: "Service",
  staff: "Staff",
};

/**
 * The org-level action catalog — every tool an assistant can be given. Read-only here; each
 * assistant selects its own subset on the Assistants page.
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

  const byGroup = new Map<string, ToolCatalogItem[]>();
  for (const t of data?.tools ?? []) {
    const arr = byGroup.get(t.group) ?? [];
    arr.push(t);
    byGroup.set(t.group, arr);
  }

  return (
    <PageContainer>
      <PageHeader
        title="Tools"
        subtitle="The actions your assistants can perform. Assign them per-assistant on the Assistants page."
      />
      {!orgId && (
        <Card className="p-6 text-sm text-muted">
          Select an organization to view its tool catalog.
        </Card>
      )}
      {orgId && isLoading && <Card className="p-6 text-sm text-muted">Loading…</Card>}
      <div className="space-y-5">
        {[...byGroup.entries()].map(([group, tools]) => (
          <div key={group}>
            <h3 className="mb-2 text-sm font-semibold text-text">
              {GROUP_LABELS[group] ?? group}
            </h3>
            <Card className="divide-y divide-border">
              {tools.map((t) => (
                <div key={t.name} className="flex items-center gap-3 p-3">
                  <span className="font-mono text-xs text-text">{t.name}</span>
                  <Badge tone={t.access === "write" ? "warning" : "neutral"}>
                    {t.access}
                  </Badge>
                  <span className="min-w-0 flex-1 truncate text-xs text-muted">
                    {t.description}
                  </span>
                </div>
              ))}
            </Card>
          </div>
        ))}
      </div>
    </PageContainer>
  );
}
