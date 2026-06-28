"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@shared/api/client";
import { useAuth } from "@features/auth/AuthProvider";
import {
  PageContainer,
  PageHeader,
  Card,
  Button,
  Badge,
  Field,
  Input,
  Textarea,
  cx,
} from "@shared/ui/primitives";
import { useToast } from "@shared/ui/Toast";
import { Plus, Bot, Cloud, Star, Save } from "lucide-react";
import type {
  AssistantDTO,
  AssistantsResponse,
} from "@contracts/assistants";
import type { ToolsResponse, VapiSettingsResponse } from "@contracts/vapi";
import { Simulator } from "./Simulator";

type Tab = "config" | "tools" | "simulator";

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

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [tab, setTab] = useState<Tab>("config");

  const { data, isLoading } = useQuery({
    queryKey: ["assistants", orgId],
    queryFn: () => api.get<AssistantsResponse>(`/organizations/${orgId}/assistants`),
    enabled: !!orgId,
  });
  const vapi = useQuery({
    queryKey: ["vapi", orgId],
    queryFn: () => api.get<VapiSettingsResponse>(`/organizations/${orgId}/vapi`),
    enabled: !!orgId,
  });

  const assistants = data?.assistants ?? [];
  const selected =
    assistants.find((a) => a.id === selectedId) ?? assistants[0] ?? null;

  function refresh() {
    return qc.invalidateQueries({ queryKey: ["assistants", orgId] });
  }

  async function create() {
    if (!newName.trim() || !orgId) return;
    try {
      await api.post(`/organizations/${orgId}/assistants`, { name: newName.trim() });
      setNewName("");
      await refresh();
      toast.success("Assistant created");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Create failed");
    }
  }

  async function provision(a: AssistantDTO) {
    try {
      await api.post(`/organizations/${orgId}/assistants/${a.id}/provision`);
      await refresh();
      toast.success("Provisioning complete");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Provision failed");
    }
  }

  async function makeDefault(a: AssistantDTO) {
    try {
      await api.post(`/organizations/${orgId}/assistants/${a.id}/set-default`);
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
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
        subtitle="Voice agents for this organization — each has its own number, prompt, voice, and selected tools."
      />
      <div className="grid gap-4 md:grid-cols-[260px_1fr]">
        {/* List + create */}
        <div className="space-y-2">
          <Card className="p-3">
            <div className="flex gap-2">
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && create()}
                placeholder="New assistant name"
              />
              <Button leftIcon={<Plus size={16} />} onClick={create}>
                Add
              </Button>
            </div>
          </Card>
          {isLoading && <Card className="p-3 text-sm text-muted">Loading…</Card>}
          {!isLoading && assistants.length === 0 && (
            <Card className="p-3 text-sm text-muted">No assistants yet.</Card>
          )}
          {assistants.map((a) => (
            <button
              key={a.id}
              onClick={() => setSelectedId(a.id)}
              className={cx(
                "flex w-full items-center gap-2 rounded-lg border p-3 text-left text-sm transition-colors",
                selected?.id === a.id
                  ? "border-accent bg-accent-tint"
                  : "border-border hover:bg-surface",
              )}
            >
              <Bot size={16} className="shrink-0 text-muted" />
              <span className="min-w-0 flex-1 truncate font-medium text-text">
                {a.name}
              </span>
              {a.isDefault && <Star size={13} className="shrink-0 text-accent" />}
              <Badge tone={syncTone(a.syncStatus)}>{a.syncStatus}</Badge>
            </button>
          ))}
        </div>

        {/* Detail */}
        {selected ? (
          <div className="space-y-4">
            <Card className="p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-semibold text-text">{selected.name}</h2>
                    {selected.isDefault && <Badge tone="accent">default</Badge>}
                  </div>
                  <p className="mt-0.5 text-xs text-muted">
                    {selected.providerPhoneNumber
                      ? `📞 ${selected.providerPhoneNumber}`
                      : "Not provisioned yet"}
                  </p>
                </div>
                <div className="flex gap-2">
                  {!selected.isDefault && (
                    <Button
                      size="sm"
                      variant="ghost"
                      leftIcon={<Star size={14} />}
                      onClick={() => makeDefault(selected)}
                    >
                      Make default
                    </Button>
                  )}
                  <Button
                    size="sm"
                    leftIcon={<Cloud size={14} />}
                    onClick={() => provision(selected)}
                  >
                    Provision
                  </Button>
                </div>
              </div>
              {selected.syncError && (
                <p className="mt-2 text-xs text-danger">{selected.syncError}</p>
              )}
            </Card>

            <div className="flex gap-1 border-b border-border">
              {(["config", "tools", "simulator"] as Tab[]).map((t) => (
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

            {tab === "config" && (
              <AssistantConfig
                key={selected.id}
                orgId={orgId}
                assistant={selected}
                onSaved={refresh}
              />
            )}
            {tab === "tools" && (
              <AssistantTools key={selected.id} orgId={orgId} assistant={selected} onSaved={refresh} />
            )}
            {tab === "simulator" && (
              <Simulator
                orgId={orgId}
                assistant={selected}
                vapiPublicKey={vapi.data?.settings.vapiPublicKey ?? null}
              />
            )}
          </div>
        ) : (
          <Card className="p-6 text-sm text-muted">
            Create or select an assistant to configure it.
          </Card>
        )}
      </div>
    </PageContainer>
  );
}

function AssistantConfig({
  orgId,
  assistant,
  onSaved,
}: {
  orgId: string;
  assistant: AssistantDTO;
  onSaved: () => Promise<unknown>;
}) {
  const toast = useToast();
  const [form, setForm] = useState({
    name: assistant.name,
    greeting: assistant.greeting ?? "",
    prompt: assistant.prompt ?? "",
    voice: assistant.voice ?? "",
    llmModel: assistant.llmModel ?? "",
  });
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await api.put(`/organizations/${orgId}/assistants/${assistant.id}`, form);
      await onSaved();
      toast.success("Saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="space-y-3 p-4">
      <Field label="Name">
        <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      </Field>
      <Field label="Greeting (first message)">
        <Input
          value={form.greeting}
          onChange={(e) => setForm({ ...form, greeting: e.target.value })}
        />
      </Field>
      <Field label="System prompt">
        <Textarea
          rows={5}
          value={form.prompt}
          onChange={(e) => setForm({ ...form, prompt: e.target.value })}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Voice">
          <Input value={form.voice} onChange={(e) => setForm({ ...form, voice: e.target.value })} />
        </Field>
        <Field label="LLM model">
          <Input
            value={form.llmModel}
            onChange={(e) => setForm({ ...form, llmModel: e.target.value })}
          />
        </Field>
      </div>
      <div>
        <Button leftIcon={<Save size={16} />} onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </Card>
  );
}

function AssistantTools({
  orgId,
  assistant,
  onSaved,
}: {
  orgId: string;
  assistant: AssistantDTO;
  onSaved: () => Promise<unknown>;
}) {
  const toast = useToast();
  const [selected, setSelected] = useState<string[]>(assistant.selectedToolIds);
  const [saving, setSaving] = useState(false);

  const { data } = useQuery({
    queryKey: ["tools", orgId],
    queryFn: () => api.get<ToolsResponse>(`/organizations/${orgId}/tools`),
  });
  const tools = data?.tools ?? [];

  function toggle(id: string) {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  async function save() {
    setSaving(true);
    try {
      await api.put(`/organizations/${orgId}/assistants/${assistant.id}/tools`, {
        toolIds: selected,
      });
      await onSaved();
      toast.success("Tools updated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="space-y-3 p-4">
      <p className="text-xs text-muted">
        Pick which tools this assistant can use. Tools are an org-level library shared across
        assistants.
      </p>
      <ul className="space-y-1">
        {tools.map((t) => (
          <li key={t.id}>
            <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-surface">
              <input
                type="checkbox"
                checked={selected.includes(t.id)}
                onChange={() => toggle(t.id)}
              />
              <span className="font-mono text-xs text-text">{t.name}</span>
              {t.description && (
                <span className="truncate text-xs text-muted">— {t.description}</span>
              )}
            </label>
          </li>
        ))}
      </ul>
      <Button leftIcon={<Save size={16} />} onClick={save} disabled={saving}>
        {saving ? "Saving…" : "Save selection"}
      </Button>
    </Card>
  );
}
