"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@shared/api/client";
import { Modal } from "@shared/ui/Modal";
import { Button, Field, Input, Textarea } from "@shared/ui/primitives";
import { OptionSelect } from "@features/voice/OptionSelect";
import { useToast } from "@shared/ui/Toast";
import type { VoiceOptionsResponse } from "@contracts/vapi";

/** Create-assistant popup — captures all the details up front, then opens its detail page. */
export function AssistantModal({
  open,
  onClose,
  orgId,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  orgId: string;
  onCreated: (id: string) => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const { data: opts } = useQuery({
    queryKey: ["voice-options"],
    queryFn: () => api.get<VoiceOptionsResponse>("/voice-options"),
    staleTime: 5 * 60_000,
  });
  const [form, setForm] = useState({
    name: "",
    greeting: "",
    prompt: "",
    voice: "",
    llmModel: "",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setForm({ name: "", greeting: "", prompt: "", voice: "", llmModel: "" });
    }
  }, [open]);

  async function save() {
    setSaving(true);
    try {
      const res = await api.post<{ assistant: { id: string } }>(
        `/organizations/${orgId}/assistants`,
        {
          name: form.name.trim(),
          greeting: form.greeting || undefined,
          prompt: form.prompt || undefined,
          voice: form.voice || undefined,
          llmModel: form.llmModel || undefined,
        },
      );
      await qc.invalidateQueries({ queryKey: ["assistants", orgId] });
      toast.success("Assistant created");
      onCreated(res.assistant.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Create failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add assistant"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving || !form.name.trim()}>
            {saving ? "Creating…" : "Create"}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Name" required>
          <Input
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="e.g. Front desk"
          />
        </Field>
        <Field label="Greeting (first message)">
          <Input
            value={form.greeting}
            onChange={(e) => setForm((f) => ({ ...f, greeting: e.target.value }))}
            placeholder="Hi, thanks for calling — how can I help?"
          />
        </Field>
        <Field label="System prompt">
          <Textarea
            rows={4}
            value={form.prompt}
            onChange={(e) => setForm((f) => ({ ...f, prompt: e.target.value }))}
            placeholder="You are a friendly receptionist for…"
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
      </div>
    </Modal>
  );
}
