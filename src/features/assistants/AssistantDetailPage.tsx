"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@shared/api/client";
import { useAuth } from "@features/auth/AuthProvider";
import {
  PageContainer,
  Card,
  Button,
  Badge,
  Spinner,
  cx,
} from "@shared/ui/primitives";
import { useToast } from "@shared/ui/Toast";
import { ArrowLeft, Star, Cloud, Trash2 } from "lucide-react";
import type { AssistantResponse } from "@contracts/assistants";
import type { VapiSettingsResponse } from "@contracts/vapi";
import {
  AssistantConfig,
  AssistantServices,
  AssistantStaff,
  AssistantKnowledge,
  AssistantTools,
} from "./tabs";
import { AssistantReadiness } from "./AssistantReadiness";
import { Simulator } from "./Simulator";

type Tab = "config" | "services" | "staff" | "knowledge" | "tools" | "simulator";
const TABS: Tab[] = ["config", "services", "staff", "knowledge", "tools", "simulator"];

const syncTone = (s: string) =>
  s === "synced"
    ? "success"
    : s === "failed"
      ? "danger"
      : s === "stale"
        ? "warning"
        : "neutral";

export function AssistantDetailPage({ assistantId }: { assistantId: string }) {
  const { user, activeOrgId } = useAuth();
  const orgId = activeOrgId ?? user?.organizationId ?? null;
  const toast = useToast();
  const qc = useQueryClient();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("config");

  const { data, isLoading, isError } = useQuery({
    queryKey: ["assistant", orgId, assistantId],
    queryFn: () =>
      api.get<AssistantResponse>(`/organizations/${orgId}/assistants/${assistantId}`),
    enabled: !!orgId,
  });
  const vapi = useQuery({
    queryKey: ["vapi", orgId],
    queryFn: () => api.get<VapiSettingsResponse>(`/organizations/${orgId}/vapi`),
    enabled: !!orgId,
  });

  const assistant = data?.assistant ?? null;
  function refresh() {
    return qc.invalidateQueries({ queryKey: ["assistant", orgId, assistantId] });
  }

  async function provision() {
    try {
      await api.post(`/organizations/${orgId}/assistants/${assistantId}/provision`);
      await refresh();
      toast.success("Provisioning complete");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Provision failed");
    }
  }
  async function makeDefault() {
    try {
      await api.post(`/organizations/${orgId}/assistants/${assistantId}/set-default`);
      await refresh();
      toast.success("Set as default");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  }
  async function remove() {
    if (!window.confirm("Delete this assistant? This also tears down its Vapi resources.")) return;
    try {
      await api.del(`/organizations/${orgId}/assistants/${assistantId}`);
      await qc.invalidateQueries({ queryKey: ["assistants", orgId] });
      toast.success("Assistant deleted");
      router.push("/assistants");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  }

  const back = (
    <Link
      href="/assistants"
      className="inline-flex items-center gap-1 text-sm text-muted hover:text-text"
    >
      <ArrowLeft size={15} /> Assistants
    </Link>
  );

  if (!orgId) {
    return (
      <PageContainer>
        <div className="mb-3">{back}</div>
        <Card className="p-6 text-sm text-muted">
          Select an organization (top-left switcher) to manage its assistants.
        </Card>
      </PageContainer>
    );
  }
  if (isLoading) {
    return (
      <PageContainer>
        <div className="mb-3">{back}</div>
        <Card className="flex items-center gap-3 p-6 text-sm text-muted">
          <Spinner /> Loading…
        </Card>
      </PageContainer>
    );
  }
  if (isError || !assistant) {
    return (
      <PageContainer>
        <div className="mb-3">{back}</div>
        <Card className="space-y-2 p-6 text-sm">
          <p className="text-danger">Could not load this assistant.</p>
          <Button size="sm" variant="secondary" onClick={() => refresh()}>
            Retry
          </Button>
        </Card>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <div className="mb-3">{back}</div>
      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold text-text">{assistant.name}</h1>
              {assistant.isDefault && <Badge tone="accent">default</Badge>}
              <Badge tone={syncTone(assistant.syncStatus)}>{assistant.syncStatus}</Badge>
            </div>
            <p className="mt-0.5 text-xs text-muted">
              {assistant.providerPhoneNumber
                ? `📞 ${assistant.providerPhoneNumber}`
                : "Not provisioned yet"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {!assistant.isDefault && (
              <Button
                size="sm"
                variant="ghost"
                leftIcon={<Star size={14} />}
                onClick={makeDefault}
              >
                Make default
              </Button>
            )}
            <Button
              size="sm"
              variant="dangerGhost"
              leftIcon={<Trash2 size={14} />}
              onClick={remove}
            >
              Delete
            </Button>
            <Button size="sm" leftIcon={<Cloud size={14} />} onClick={provision}>
              Provision
            </Button>
          </div>
        </div>
        {assistant.syncError && (
          <p className="mt-2 text-xs text-danger">{assistant.syncError}</p>
        )}
      </Card>

      <div className="mt-4">
        <AssistantReadiness orgId={orgId} assistant={assistant} />
      </div>

      <div className="mt-4 flex flex-wrap gap-1 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cx(
              "px-3 py-2 text-sm capitalize transition-colors",
              tab === t
                ? "border-b-2 border-accent font-medium text-accent"
                : "text-muted hover:text-text",
            )}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {tab === "config" && (
          <AssistantConfig orgId={orgId} assistant={assistant} onSaved={refresh} />
        )}
        {tab === "services" && (
          <AssistantServices orgId={orgId} assistant={assistant} onSaved={refresh} />
        )}
        {tab === "staff" && (
          <AssistantStaff orgId={orgId} assistant={assistant} onSaved={refresh} />
        )}
        {tab === "knowledge" && (
          <AssistantKnowledge orgId={orgId} assistant={assistant} onSaved={refresh} />
        )}
        {tab === "tools" && (
          <AssistantTools orgId={orgId} assistant={assistant} onSaved={refresh} />
        )}
        {tab === "simulator" && (
          <Simulator
            orgId={orgId}
            assistant={assistant}
            vapiPublicKey={vapi.data?.settings.vapiPublicKey ?? null}
          />
        )}
      </div>
    </PageContainer>
  );
}
