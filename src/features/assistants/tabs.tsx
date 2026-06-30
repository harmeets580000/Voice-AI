"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@shared/api/client";
import { Card, Button, Field, Input, Textarea, cx } from "@shared/ui/primitives";
import { useToast } from "@shared/ui/Toast";
import { OptionSelect } from "@features/voice/OptionSelect";
import { ServiceModal } from "@features/services/ServiceModal";
import { StaffModal } from "@features/staff/StaffModal";
import { KnowledgeModal } from "@features/knowledge/KnowledgeModal";
import { CustomToolModal } from "@features/tools/CustomToolModal";
import { Save, Plus } from "lucide-react";
import type { AssistantDTO, AssistantResponse } from "@contracts/assistants";
import type { ToolsResponse, VoiceOptionsResponse } from "@contracts/vapi";
import type { DocumentListResponse } from "@contracts/knowledge";

export type TabProps = {
  orgId: string;
  assistant: AssistantDTO;
  onSaved: () => Promise<unknown>;
};

export function AssistantConfig({ orgId, assistant, onSaved }: TabProps) {
  const toast = useToast();
  const { data: opts } = useQuery({
    queryKey: ["voice-options"],
    queryFn: () => api.get<VoiceOptionsResponse>("/voice-options"),
    staleTime: 5 * 60_000,
  });
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
        <OptionSelect
          label="Voice"
          value={form.voice}
          onChange={(v) => setForm((f) => ({ ...f, voice: v }))}
          options={opts?.voices ?? []}
        />
        <OptionSelect
          label="LLM model"
          value={form.llmModel}
          onChange={(v) => setForm((f) => ({ ...f, llmModel: v }))}
          options={opts?.models ?? []}
        />
      </div>
      <div>
        <Button leftIcon={<Save size={16} />} onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </Card>
  );
}

type PickItem = { id: string; label: string; sub?: string | null; mono?: boolean };

/** Shared checkbox picker for an assistant's selection from an org library (services/staff/KB/tools). */
function AssistantPicker({
  items,
  initialSelected,
  hint,
  emptyText,
  onSave,
  onAdd,
  addLabel = "Add new",
}: {
  items: PickItem[];
  initialSelected: string[];
  hint: string;
  emptyText: string;
  onSave: (ids: string[]) => Promise<void>;
  /** Opens a create modal so a new library item can be added without leaving this tab. */
  onAdd?: () => void;
  addLabel?: string;
}) {
  const [selected, setSelected] = useState<string[]>(initialSelected);
  const [saving, setSaving] = useState(false);

  function toggle(id: string) {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  async function save() {
    setSaving(true);
    try {
      await onSave(selected);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted">{hint}</p>
        <div className="flex shrink-0 items-center gap-2">
          {items.length > 0 && (
            <span className="text-xs text-muted">{selected.length} selected</span>
          )}
          {onAdd && (
            <Button
              size="sm"
              variant="secondary"
              leftIcon={<Plus size={14} />}
              onClick={onAdd}
            >
              {addLabel}
            </Button>
          )}
        </div>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-muted">{emptyText}</p>
      ) : (
        <ul className="space-y-1">
          {items.map((it) => (
            <li key={it.id}>
              <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-surface">
                <input
                  type="checkbox"
                  checked={selected.includes(it.id)}
                  onChange={() => toggle(it.id)}
                />
                <span className={cx("text-text", it.mono ? "font-mono text-xs" : "font-medium")}>
                  {it.label}
                </span>
                {it.sub && <span className="truncate text-xs text-muted">— {it.sub}</span>}
              </label>
            </li>
          ))}
        </ul>
      )}
      <Button leftIcon={<Save size={16} />} onClick={save} disabled={saving}>
        {saving ? "Saving…" : "Save selection"}
      </Button>
    </Card>
  );
}

export function AssistantServices({ orgId, assistant, onSaved }: TabProps) {
  const toast = useToast();
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const { data } = useQuery({
    queryKey: ["services", orgId],
    queryFn: () =>
      api.get<{ services: { id: string; name: string; durationMinutes: number }[] }>(
        "/services",
      ),
  });
  const items: PickItem[] = (data?.services ?? []).map((s) => ({
    id: s.id,
    label: s.name,
    sub: `${s.durationMinutes} min`,
  }));
  return (
    <>
      <AssistantPicker
        items={items}
        initialSelected={assistant.selectedServiceIds}
        hint="Choose which services this assistant offers on a call. No selection = it offers every service."
        emptyText="No services in the library yet — add one to get started."
        addLabel="Add service"
        onAdd={() => setAdding(true)}
        onSave={async (ids) => {
          try {
            await api.put(`/organizations/${orgId}/assistants/${assistant.id}/services`, {
              serviceIds: ids,
            });
            await onSaved();
            toast.success("Services updated");
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Save failed");
          }
        }}
      />
      <ServiceModal
        open={adding}
        onClose={() => setAdding(false)}
        onSaved={() => qc.invalidateQueries({ queryKey: ["services", orgId] })}
      />
    </>
  );
}

export function AssistantStaff({ orgId, assistant, onSaved }: TabProps) {
  const toast = useToast();
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const { data } = useQuery({
    queryKey: ["staff", orgId],
    queryFn: () =>
      api.get<{ staff: { id: string; name: string; title: string | null; isActive: boolean }[] }>(
        "/staff",
      ),
  });
  const items: PickItem[] = (data?.staff ?? [])
    .filter((s) => s.isActive)
    .map((s) => ({ id: s.id, label: s.name, sub: s.title }));
  return (
    <>
      <AssistantPicker
        items={items}
        initialSelected={assistant.selectedStaffIds}
        hint="Choose which staff this assistant books with. No selection = any staff member."
        emptyText="No staff in the library yet — add one to get started."
        addLabel="Add staff"
        onAdd={() => setAdding(true)}
        onSave={async (ids) => {
          try {
            await api.put(`/organizations/${orgId}/assistants/${assistant.id}/staff`, {
              staffIds: ids,
            });
            await onSaved();
            toast.success("Staff updated");
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Save failed");
          }
        }}
      />
      <StaffModal
        open={adding}
        onClose={() => setAdding(false)}
        onSaved={() => qc.invalidateQueries({ queryKey: ["staff", orgId] })}
      />
    </>
  );
}

export function AssistantKnowledge({ orgId, assistant, onSaved }: TabProps) {
  const toast = useToast();
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const { data } = useQuery({
    queryKey: ["knowledge", orgId],
    queryFn: () => api.get<DocumentListResponse>("/knowledge"),
  });
  const items: PickItem[] = (data?.documents ?? [])
    .filter((d) => d.knowledgeFileId)
    .map((d) => ({ id: d.knowledgeFileId!, label: d.title, sub: d.syncStatus }));
  return (
    <>
      <AssistantPicker
        items={items}
        initialSelected={assistant.selectedKnowledgeFileIds}
        hint="Choose which documents this assistant can reference. No selection = all documents."
        emptyText="No synced documents yet — upload one to get started."
        addLabel="Upload document"
        onAdd={() => setAdding(true)}
        onSave={async (ids) => {
          try {
            await api.put(`/organizations/${orgId}/assistants/${assistant.id}/knowledge`, {
              fileIds: ids,
            });
            await onSaved();
            toast.success("Knowledge updated");
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Save failed");
          }
        }}
      />
      <KnowledgeModal
        open={adding}
        onClose={() => setAdding(false)}
        onSaved={() => qc.invalidateQueries({ queryKey: ["knowledge", orgId] })}
      />
    </>
  );
}

export function AssistantTools({ orgId, assistant, onSaved }: TabProps) {
  const toast = useToast();
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const { data } = useQuery({
    queryKey: ["tools", orgId],
    queryFn: () => api.get<ToolsResponse>(`/organizations/${orgId}/tools`),
  });
  const items: PickItem[] = (data?.tools ?? []).map((t) => ({
    id: t.id,
    label: t.name,
    sub: t.description,
    mono: true,
  }));
  return (
    <>
      <AssistantPicker
        items={items}
        initialSelected={assistant.selectedToolIds}
        hint="Pick which tools this assistant can use. Tools are an org-level library shared across assistants."
        emptyText="No tools in the library yet."
        addLabel="Add custom tool"
        onAdd={() => setAdding(true)}
        onSave={async (ids) => {
          try {
            const res = await api.put<AssistantResponse>(
              `/organizations/${orgId}/assistants/${assistant.id}/tools`,
              { toolIds: ids },
            );
            await onSaved();
            if (res.assistant.syncStatus === "failed") {
              toast.error(
                res.assistant.syncError ??
                  "Tools saved, but syncing them to the voice provider failed.",
              );
            } else {
              toast.success("Tools updated");
            }
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Save failed");
          }
        }}
      />
      <CustomToolModal
        orgId={orgId}
        open={adding}
        onClose={() => setAdding(false)}
        onSaved={() => qc.invalidateQueries({ queryKey: ["tools", orgId] })}
      />
    </>
  );
}
