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
import { Plus, Rocket } from "lucide-react";
import { Role } from "@domain/enums";
import type {
  CampaignsResponse,
  CampaignDTO,
  CampaignDetailDTO,
  CampaignStatusDTO,
  LaunchResultResponse,
} from "@contracts/outbound-campaigns";
import type { SegmentsResponse } from "@contracts/outbound-segments";
import type { AgentsResponse } from "@contracts/outbound-agents";
import type { AudienceCountResponse } from "@contracts/outbound-segments";

const LAUNCH_CAP = 1000;

const STATUS_TONE: Record<CampaignStatusDTO, "neutral" | "success" | "warning" | "danger"> =
  {
    DRAFT: "warning",
    SCHEDULED: "warning",
    RUNNING: "success",
    PAUSED: "neutral",
    COMPLETED: "success",
    CANCELLED: "danger",
  };

export default function OutboundCampaignsRoute() {
  return (
    <AppShell>
      <CampaignsPage />
    </AppShell>
  );
}

function CampaignsPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const { user } = useAuth();
  const isAdmin =
    user?.role === Role.ORG_ADMIN || user?.role === Role.SUPER_ADMIN;

  const [createOpen, setCreateOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["outbound-campaigns"],
    queryFn: () => api.get<CampaignsResponse>("/outbound/campaigns"),
  });

  async function launch(id: string) {
    try {
      const res = await api.post<LaunchResultResponse>(
        `/outbound/campaigns/${id}/launch`,
      );
      await qc.invalidateQueries({ queryKey: ["outbound-campaigns"] });
      toast.success(
        `Queued ${res.queued} call${res.queued === 1 ? "" : "s"} · skipped ${res.skipped}`,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Launch failed");
    }
  }

  async function remove(id: string) {
    if (!window.confirm("Delete this campaign?")) return;
    try {
      await api.del(`/outbound/campaigns/${id}`);
      await qc.invalidateQueries({ queryKey: ["outbound-campaigns"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  }

  const columns: Column<CampaignDTO>[] = [
    { key: "name", header: "Name", render: (c) => c.name },
    {
      key: "status",
      header: "Status",
      render: (c) => <Badge tone={STATUS_TONE[c.status]}>{c.status}</Badge>,
    },
    {
      key: "queued",
      header: "Queued",
      render: (c) => (c.stats ? `${c.stats.queued}` : "—"),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (c) => (
        <div className="flex justify-end gap-2">
          {isAdmin &&
            (c.status === "DRAFT" || c.status === "SCHEDULED") && (
              <Button
                size="sm"
                onClick={() => launch(c.id)}
                leftIcon={<Rocket size={14} />}
              >
                Launch
              </Button>
            )}
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setDetailId(c.id)}
          >
            Open
          </Button>
          {isAdmin && (
            <Button
              size="sm"
              variant="dangerGhost"
              onClick={() => remove(c.id)}
            >
              Delete
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <PageContainer size="wide">
      <PageHeader
        title="Campaigns"
        subtitle="Voice campaigns over a segment. Launch (stub) queues calls — nothing dials yet."
        actions={
          isAdmin && (
            <Button
              onClick={() => setCreateOpen(true)}
              leftIcon={<Plus size={16} />}
            >
              New campaign
            </Button>
          )
        }
      />

      <DataTable
        columns={columns}
        rows={isLoading ? [] : (data?.campaigns ?? [])}
        emptyMessage={isLoading ? "Loading…" : "No campaigns yet"}
      />

      {createOpen && (
        <CreateCampaign
          onClose={() => setCreateOpen(false)}
          onCreated={() => {
            void qc.invalidateQueries({ queryKey: ["outbound-campaigns"] });
            setCreateOpen(false);
          }}
        />
      )}

      {detailId && (
        <CampaignDetail
          campaignId={detailId}
          isAdmin={isAdmin}
          onClose={() => setDetailId(null)}
          onChanged={() =>
            qc.invalidateQueries({ queryKey: ["outbound-campaigns"] })
          }
        />
      )}
    </PageContainer>
  );
}

function CreateCampaign({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const toast = useToast();
  const [form, setForm] = useState({
    name: "",
    segmentId: "",
    agentId: "",
    pacing: 60,
  });
  const [saving, setSaving] = useState(false);

  const { data: segs } = useQuery({
    queryKey: ["outbound-segments"],
    queryFn: () => api.get<SegmentsResponse>("/outbound/segments"),
  });
  const { data: agents } = useQuery({
    queryKey: ["outbound-agents"],
    queryFn: () => api.get<AgentsResponse>("/outbound/agents"),
  });

  const selectedSegment = segs?.segments.find((s) => s.id === form.segmentId);
  const filter = form.segmentId ? (selectedSegment?.filter ?? {}) : {};

  const { data: count } = useQuery({
    queryKey: ["outbound-audience", "campaign", form.segmentId],
    queryFn: () =>
      api.post<AudienceCountResponse>("/outbound/segments/audience", {
        filter,
      }),
  });
  const audience = count?.count ?? 0;
  const overCap = audience > LAUNCH_CAP;

  async function create() {
    setSaving(true);
    try {
      await api.post("/outbound/campaigns", {
        name: form.name,
        channel: "VOICE",
        outboundAgentId: form.agentId || undefined,
        segmentId: form.segmentId || undefined,
        audience: form.segmentId ? undefined : {},
        pacingPerHour: form.pacing,
      });
      toast.success("Campaign created");
      onCreated();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Create failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="New voice campaign"
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={create} disabled={saving || !form.name || overCap}>
            {saving ? "Creating…" : "Create draft"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Name" required>
          <Input
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
        </Field>

        <div>
          <p className="mb-1.5 text-sm font-medium text-ink2">Channel</p>
          <div className="flex gap-2">
            <Badge tone="accent">Voice</Badge>
            <span className="text-xs italic text-faint">
              SMS · WhatsApp · Email — coming later
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Audience">
            <Select
              value={form.segmentId}
              onChange={(e) =>
                setForm((f) => ({ ...f, segmentId: e.target.value }))
              }
            >
              <option value="">All contacts</option>
              {(segs?.segments ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Outbound agent">
            <Select
              value={form.agentId}
              onChange={(e) =>
                setForm((f) => ({ ...f, agentId: e.target.value }))
              }
            >
              <option value="">Select an agent…</option>
              {(agents?.agents ?? []).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field label="Pacing (calls / hour)">
          <Input
            type="number"
            value={form.pacing}
            onChange={(e) =>
              setForm((f) => ({ ...f, pacing: Number(e.target.value) }))
            }
          />
        </Field>

        <p className={overCap ? "text-sm text-danger" : "text-sm text-muted"}>
          Audience: <strong>{audience}</strong> contacts (opted-out excluded).
          {overCap &&
            ` Over the launch cap of ${LAUNCH_CAP} — narrow the segment.`}
        </p>
      </div>
    </Modal>
  );
}

function CampaignDetail({
  campaignId,
  isAdmin,
  onClose,
  onChanged,
}: {
  campaignId: string;
  isAdmin: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const toast = useToast();
  const { data, refetch } = useQuery({
    queryKey: ["outbound-campaign", campaignId],
    queryFn: () =>
      api.get<{ campaign: CampaignDetailDTO }>(
        `/outbound/campaigns/${campaignId}`,
      ),
  });
  const c = data?.campaign;

  async function setStatus(status: "PAUSED" | "RUNNING" | "CANCELLED") {
    try {
      await api.put(`/outbound/campaigns/${campaignId}/status`, { status });
      await refetch();
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={c?.name ?? "Campaign"}
      size="lg"
      footer={<Button onClick={onClose}>Close</Button>}
    >
      {!c ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <Badge tone={STATUS_TONE[c.status]}>{c.status}</Badge>
            {c.stats && (
              <span className="text-muted">
                {c.stats.queued} queued · {c.stats.skipped} skipped ·{" "}
                {c.stats.total} in audience
              </span>
            )}
          </div>

          {isAdmin && (
            <div className="flex gap-2">
              {c.status === "RUNNING" && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setStatus("PAUSED")}
                >
                  Pause
                </Button>
              )}
              {c.status === "PAUSED" && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setStatus("RUNNING")}
                >
                  Resume
                </Button>
              )}
              {c.status !== "COMPLETED" && c.status !== "CANCELLED" && (
                <Button
                  size="sm"
                  variant="dangerGhost"
                  onClick={() => setStatus("CANCELLED")}
                >
                  Cancel
                </Button>
              )}
            </div>
          )}

          <div>
            <p className="mb-2 text-sm font-medium text-ink2">
              Members ({c.members.length})
            </p>
            <div className="max-h-64 space-y-1 overflow-y-auto">
              {c.members.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center justify-between rounded-lg border border-border px-3 py-1.5 text-sm"
                >
                  <span className="text-muted">{m.contactId}</span>
                  <Badge tone="neutral">{m.status}</Badge>
                </div>
              ))}
              {c.members.length === 0 && (
                <p className="text-sm text-muted">
                  No members yet — launch to generate calls.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
