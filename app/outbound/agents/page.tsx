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
  Card,
  Badge,
  Field,
  Input,
  Select,
  Textarea,
} from "@shared/ui/primitives";
import { Modal } from "@shared/ui/Modal";
import { useToast } from "@shared/ui/Toast";
import { Plus, Trash2 } from "lucide-react";
import { Role } from "@domain/enums";
import type {
  AgentsResponse,
  OutboundAgentDTO,
  OutboundActionTypeDTO,
} from "@contracts/outbound-agents";
import type { VapiNumbersResponse } from "@contracts/outbound-calls";

const ACTION_LABELS: Record<OutboundActionTypeDTO, string> = {
  QUALIFY_LEAD: "Qualify lead",
  BOOK_MEETING: "Book meeting",
  CAPTURE_CONTACT: "Capture contact",
  SEND_FOLLOWUP: "Send follow-up",
  MARK_DNC: "Mark do-not-call",
  ANSWER_KB: "Answer from knowledge",
};

const STATUS_TONE: Record<string, "neutral" | "success" | "warning"> = {
  DRAFT: "warning",
  ACTIVE: "success",
  INACTIVE: "neutral",
};

export default function OutboundAgentsRoute() {
  return (
    <AppShell>
      <AgentsPage />
    </AppShell>
  );
}

function AgentsPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const { user } = useAuth();
  const isAdmin =
    user?.role === Role.ORG_ADMIN || user?.role === Role.SUPER_ADMIN;

  const [editing, setEditing] = useState<OutboundAgentDTO | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["outbound-agents"],
    queryFn: () => api.get<AgentsResponse>("/outbound/agents"),
  });

  async function newAgent() {
    try {
      const res = await api.post<{ agent: OutboundAgentDTO }>(
        "/outbound/agents",
        { name: "New agent" },
      );
      await qc.invalidateQueries({ queryKey: ["outbound-agents"] });
      setEditing(res.agent);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create agent");
    }
  }

  async function remove(id: string) {
    if (!window.confirm("Delete this agent?")) return;
    try {
      await api.del(`/outbound/agents/${id}`);
      await qc.invalidateQueries({ queryKey: ["outbound-agents"] });
      toast.success("Agent deleted");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  }

  return (
    <PageContainer>
      <PageHeader
        title="Outbound Agents"
        subtitle="Sales scripts for voice campaigns and one-off calls. Config only — nothing dials yet."
        actions={
          isAdmin && (
            <Button onClick={newAgent} leftIcon={<Plus size={16} />}>
              New agent
            </Button>
          )
        }
      />

      {isLoading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : (data?.agents.length ?? 0) === 0 ? (
        <Card className="text-sm text-muted">
          No agents yet.{isAdmin ? " Create one to script your outbound calls." : ""}
        </Card>
      ) : (
        <div className="space-y-2">
          {data!.agents.map((a) => (
            <Card key={a.id} className="flex items-center gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-text">{a.name}</span>
                  <Badge tone={STATUS_TONE[a.status]}>{a.status}</Badge>
                </div>
                <p className="mt-0.5 text-sm text-muted">
                  {a.persona || "No persona set"} ·{" "}
                  {a.actions.filter((ac) => ac.enabled).length} actions on
                </p>
              </div>
              {isAdmin && (
                <>
                  <Button variant="secondary" onClick={() => setEditing(a)}>
                    Edit
                  </Button>
                  <Button
                    variant="dangerGhost"
                    onClick={() => remove(a.id)}
                    leftIcon={<Trash2 size={14} />}
                  >
                    Delete
                  </Button>
                </>
              )}
            </Card>
          ))}
        </div>
      )}

      {editing && (
        <AgentEditor
          agent={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            void qc.invalidateQueries({ queryKey: ["outbound-agents"] });
            setEditing(null);
          }}
        />
      )}
    </PageContainer>
  );
}

function AgentEditor({
  agent,
  onClose,
  onSaved,
}: {
  agent: OutboundAgentDTO;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: agent.name,
    language: agent.language,
    voiceId: agent.voiceId ?? "",
    persona: agent.persona ?? "",
    openingLine: agent.openingLine ?? "",
    systemPrompt: agent.systemPrompt ?? "",
    status: agent.status,
    primaryGoal:
      (agent.goalsJson as { primary?: string } | null)?.primary ?? "BOOK_MEETING",
    providerPhoneNumber: agent.providerPhoneNumber ?? "",
    providerPhoneNumberId: agent.providerPhoneNumberId ?? "",
  });

  // The org's Vapi numbers, pulled live for the from-number picker (manual entry also allowed).
  const { data: numbersData } = useQuery({
    queryKey: ["outbound-phone-numbers"],
    queryFn: () => api.get<VapiNumbersResponse>("/outbound/phone-numbers"),
  });
  const numbers = numbersData?.numbers ?? [];
  const [actions, setActions] = useState(
    () =>
      new Map(
        agent.actions.map((a) => [
          a.type,
          {
            enabled: a.enabled,
            note: (a.configJson as { note?: string } | null)?.note ?? "",
          },
        ]),
      ),
  );

  function setAction(
    type: OutboundActionTypeDTO,
    patch: { enabled?: boolean; note?: string },
  ) {
    setActions((prev) => {
      const next = new Map(prev);
      const cur = next.get(type) ?? { enabled: false, note: "" };
      next.set(type, { ...cur, ...patch });
      return next;
    });
  }

  async function save() {
    setSaving(true);
    try {
      await api.patch(`/outbound/agents/${agent.id}`, {
        name: form.name,
        language: form.language,
        voiceId: form.voiceId || undefined,
        persona: form.persona || undefined,
        openingLine: form.openingLine || undefined,
        systemPrompt: form.systemPrompt || undefined,
        status: form.status,
        goals: { primary: form.primaryGoal },
        providerPhoneNumber: form.providerPhoneNumber,
        providerPhoneNumberId: form.providerPhoneNumberId || undefined,
      });
      for (const [type, v] of actions) {
        await api.put(`/outbound/agents/${agent.id}/actions/${type}`, {
          enabled: v.enabled,
          config: v.note ? { note: v.note } : undefined,
        });
      }
      toast.success("Agent saved");
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Edit agent"
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving || !form.name}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Name" required>
            <Input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </Field>
          <Field label="Status">
            <Select
              value={form.status}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  status: e.target.value as OutboundAgentDTO["status"],
                }))
              }
            >
              <option value="DRAFT">Draft</option>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
            </Select>
          </Field>
          <Field label="Language">
            <Input
              value={form.language}
              onChange={(e) =>
                setForm((f) => ({ ...f, language: e.target.value }))
              }
            />
          </Field>
          <Field label="Voice">
            <Input
              value={form.voiceId}
              placeholder="voice id (optional)"
              onChange={(e) =>
                setForm((f) => ({ ...f, voiceId: e.target.value }))
              }
            />
          </Field>
        </div>
        <Field label="From number (pick a Vapi number or type one)">
          <>
            <Input
              list="agent-vapi-numbers"
              placeholder="+14155550123"
              value={form.providerPhoneNumber}
              onChange={(e) => {
                const num = e.target.value;
                const match = numbers.find((n) => n.number === num);
                setForm((f) => ({
                  ...f,
                  providerPhoneNumber: num,
                  providerPhoneNumberId: match?.id ?? "",
                }));
              }}
            />
            <datalist id="agent-vapi-numbers">
              {numbers.map((n) => (
                <option key={n.id} value={n.number} />
              ))}
            </datalist>
          </>
        </Field>
        <Field label="Persona">
          <Input
            value={form.persona}
            onChange={(e) => setForm((f) => ({ ...f, persona: e.target.value }))}
          />
        </Field>
        <Field label="Opening line">
          <Input
            value={form.openingLine}
            onChange={(e) =>
              setForm((f) => ({ ...f, openingLine: e.target.value }))
            }
          />
        </Field>
        <Field label="System prompt (sales script / objection handling)">
          <Textarea
            rows={4}
            value={form.systemPrompt}
            onChange={(e) =>
              setForm((f) => ({ ...f, systemPrompt: e.target.value }))
            }
          />
        </Field>
        <Field label="Primary goal">
          <Select
            value={form.primaryGoal}
            onChange={(e) =>
              setForm((f) => ({ ...f, primaryGoal: e.target.value }))
            }
          >
            <option value="BOOK_MEETING">Book a meeting</option>
            <option value="QUALIFY_LEAD">Qualify the lead</option>
            <option value="CAPTURE_CONTACT">Capture contact info</option>
          </Select>
        </Field>

        <div>
          <p className="mb-2 text-sm font-medium text-ink2">Actions</p>
          <div className="space-y-2">
            {agent.actions.map((a) => {
              const state = actions.get(a.type)!;
              return (
                <div
                  key={a.type}
                  className="flex items-center gap-3 rounded-lg border border-border px-3 py-2"
                >
                  <input
                    type="checkbox"
                    checked={state.enabled}
                    onChange={(e) =>
                      setAction(a.type, { enabled: e.target.checked })
                    }
                  />
                  <span className="w-40 text-sm text-text">
                    {ACTION_LABELS[a.type]}
                  </span>
                  <Input
                    placeholder="config note (optional)"
                    value={state.note}
                    onChange={(e) =>
                      setAction(a.type, { note: e.target.value })
                    }
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </Modal>
  );
}
