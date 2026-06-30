"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@shared/api/client";
import { Modal } from "@shared/ui/Modal";
import { Button, Field, Input, Textarea } from "@shared/ui/primitives";
import { useToast } from "@shared/ui/Toast";

/**
 * Create a custom voice tool (an external API endpoint the assistant can call). Posts to the org's
 * tools library; the assistant then selects it like any other tool. `orgId` scopes the request.
 */
export function CustomToolModal({
  orgId,
  open,
  onClose,
  onSaved,
}: {
  orgId: string;
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState({
    name: "",
    description: "",
    serverUrl: "",
    parameters: "",
  });
  const [saving, setSaving] = useState(false);

  function reset() {
    setForm({ name: "", description: "", serverUrl: "", parameters: "" });
  }

  async function save() {
    setSaving(true);
    try {
      let parameters: unknown;
      if (form.parameters.trim()) {
        try {
          parameters = JSON.parse(form.parameters);
        } catch {
          toast.error("Parameters must be valid JSON (a JSON-schema object).");
          setSaving(false);
          return;
        }
      }
      await api.post(`/organizations/${orgId}/tools`, {
        name: form.name,
        description: form.description || undefined,
        serverUrl: form.serverUrl,
        parameters,
      });
      await qc.invalidateQueries({ queryKey: ["tools", orgId] });
      reset();
      onSaved?.();
      onClose();
      toast.success("Custom tool added");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add custom tool"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving || !form.name || !form.serverUrl}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Name" required>
          <Input
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="letters, numbers, underscores"
          />
        </Field>
        <Field label="Description">
          <Textarea
            rows={2}
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            placeholder="What this tool does (the assistant reads this)."
          />
        </Field>
        <Field label="Server URL" required>
          <Input
            value={form.serverUrl}
            onChange={(e) => setForm((f) => ({ ...f, serverUrl: e.target.value }))}
            placeholder="https://your-api.example.com/endpoint"
          />
        </Field>
        <Field label="Parameters (JSON schema, optional)">
          <Textarea
            rows={4}
            value={form.parameters}
            onChange={(e) => setForm((f) => ({ ...f, parameters: e.target.value }))}
            placeholder='{"type":"object","properties":{}}'
          />
        </Field>
      </div>
    </Modal>
  );
}
