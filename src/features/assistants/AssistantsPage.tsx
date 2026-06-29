"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@shared/api/client";
import { useAuth } from "@features/auth/AuthProvider";
import {
  PageContainer,
  PageHeader,
  Card,
  Button,
  Badge,
} from "@shared/ui/primitives";
import { useToast } from "@shared/ui/Toast";
import { Plus, Bot, Star, RefreshCw, ChevronRight } from "lucide-react";
import type { AssistantsResponse } from "@contracts/assistants";
import type { SyncResponse } from "@contracts/vapi";
import { AssistantModal } from "./AssistantModal";

const syncTone = (s: string) =>
  s === "synced"
    ? "success"
    : s === "failed"
      ? "danger"
      : s === "stale"
        ? "warning"
        : "neutral";

export function AssistantsPage() {
  const { user, activeOrgId } = useAuth();
  const orgId = activeOrgId ?? user?.organizationId ?? null;
  const toast = useToast();
  const qc = useQueryClient();
  const router = useRouter();

  const [modalOpen, setModalOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["assistants", orgId],
    queryFn: () => api.get<AssistantsResponse>(`/organizations/${orgId}/assistants`),
    enabled: !!orgId,
  });
  const assistants = data?.assistants ?? [];

  function refresh() {
    return qc.invalidateQueries({ queryKey: ["assistants", orgId] });
  }

  // Pull all assistants from the org's Vapi account now (otherwise the 60s poller does it).
  async function syncFromVapi() {
    if (!orgId) return;
    setSyncing(true);
    try {
      const res = await api.post<SyncResponse>(`/organizations/${orgId}/resync`);
      await refresh();
      if (res.syncStatus === "synced") toast.success("Synced from Vapi");
      else toast.error(`Sync ${res.syncStatus}: ${res.syncError ?? "unknown error"}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  }

  if (!orgId) {
    return (
      <PageContainer>
        <PageHeader title="Assistants" subtitle="Your organization's voice agents." />
        <Card className="p-6 text-sm text-muted">
          Select an organization (top-left switcher) to manage its assistants.
        </Card>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title="Assistants"
        subtitle="Voice agents for this organization — open one to configure its services, staff, knowledge, tools, prompt, and voice."
      />

      <Card className="mb-4 flex flex-wrap items-center gap-2 p-3">
        <Button
          variant="secondary"
          leftIcon={<RefreshCw size={16} />}
          onClick={syncFromVapi}
          disabled={syncing}
          title="Pull all assistants from this org's Vapi account into the portal."
        >
          {syncing ? "Syncing…" : "Sync from Vapi"}
        </Button>
        <Button
          className="ml-auto"
          leftIcon={<Plus size={16} />}
          onClick={() => setModalOpen(true)}
        >
          Add assistant
        </Button>
      </Card>

      <AssistantModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        orgId={orgId}
        onCreated={(id) => {
          setModalOpen(false);
          router.push(`/assistants/${id}`);
        }}
      />

      {isLoading && <Card className="p-6 text-sm text-muted">Loading…</Card>}

      {isError && (
        <Card className="space-y-2 p-6 text-sm">
          <p className="text-danger">Could not load assistants.</p>
          <Button size="sm" variant="secondary" onClick={() => refresh()}>
            Retry
          </Button>
        </Card>
      )}

      {!isLoading && !isError && assistants.length === 0 && (
        <Card className="p-6 text-sm text-muted">
          No assistants yet. Click <span className="font-medium text-text">Sync from Vapi</span> to
          pull this org&apos;s Vapi assistants (it also auto-syncs every minute), or{" "}
          <span className="font-medium text-text">Add</span> one to create and provision it.
        </Card>
      )}

      {!isError && assistants.length > 0 && (
        <div className="space-y-2">
          {assistants.map((a) => (
            <Link
              key={a.id}
              href={`/assistants/${a.id}`}
              className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:border-accent hover:bg-surface"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-tint text-accent">
                <Bot size={18} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium text-text">{a.name}</span>
                  {a.isDefault && <Star size={13} className="shrink-0 text-accent" />}
                </div>
                <div className="mt-0.5 truncate text-xs text-muted">
                  {a.providerPhoneNumber ? `📞 ${a.providerPhoneNumber}` : "Not provisioned yet"}
                </div>
              </div>
              <Badge tone={syncTone(a.syncStatus)}>{a.syncStatus}</Badge>
              <ChevronRight size={16} className="shrink-0 text-muted" />
            </Link>
          ))}
        </div>
      )}
    </PageContainer>
  );
}
