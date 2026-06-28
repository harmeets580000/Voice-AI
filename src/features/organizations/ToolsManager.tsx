"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@shared/api/client";
import {
  Card,
  Button,
  Badge,
  Field,
  Input,
  Textarea,
  cx,
} from "@shared/ui/primitives";
import { Modal } from "@shared/ui/Modal";
import { useToast } from "@shared/ui/Toast";
import { Wrench, RefreshCw, Plus, Trash2 } from "lucide-react";
import type {
  ToolsResponse,
  ToolsSyncResponse,
  VapiToolDTO,
} from "@contracts/vapi";

const EMPTY = { name: "", description: "", serverUrl: "", parameters: "" };

/**
 * Per-customer tool management. Built-ins can be enabled/disabled; custom tools can be added,
 * edited (description/params/URL), and deleted. "Sync to Vapi" reconciles the enabled set.
 */
export function ToolsManager({ orgId }: { orgId: string }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [syncing, setSyncing] = useState(false);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  const { data } = useQuery({
    queryKey: ["tools", orgId],
    queryFn: () => api.get<ToolsResponse>(`/organizations/${orgId}/tools`),
  });
  const tools = data?.tools ?? [];

  async function refresh() {
    await qc.invalidateQueries({ queryKey: ["tools", orgId] });
    await qc.invalidateQueries({ queryKey: ["vapi", orgId] });
  }

  async function toggle(t: VapiToolDTO) {
    try {
      await api.patch(`/organizations/${orgId}/tools/${t.id}`, {
        enabled: !t.enabled,
      });
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    }
  }

  async function removeTool(t: VapiToolDTO) {
    if (!window.confirm(`Delete custom tool "${t.name}"?`)) return;
    try {
      await api.del(`/organizations/${orgId}/tools/${t.id}`);
      await refresh();
      toast.success("Tool deleted");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  }

  async function syncTools() {
    setSyncing(true);
    try {
      const res = await api.post<ToolsSyncResponse>(
        `/organizations/${orgId}/tools/sync`,
      );
      await refresh();
      if (res.syncError) toast.error(`Tools sync: ${res.syncError}`);
      else toast.success("Tools synced to Vapi");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Tools sync failed");
    } finally {
      setSyncing(false);
    }
  }

  async function createTool() {
    setSaving(true);
    try {
      let parameters: unknown;
      if (form.parameters.trim()) {
        try {
          parameters = JSON.parse(form.parameters);
        } catch {
          toast.error("Parameters must be valid JSON");
          setSaving(false);
          return;
        }
      }
      await api.post(`/organizations/${orgId}/tools`, {
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        serverUrl: form.serverUrl.trim(),
        parameters,
      });
      await refresh();
      setOpen(false);
      setForm(EMPTY);
      toast.success("Custom tool created — Sync to push it to Vapi");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Create failed");
    } finally {
      setSaving(false);
    }
  }

  const statusTone = (s: string) =>
    s === "synced" ? "success" : s === "failed" ? "danger" : "neutral";

  return (
    <Card className="space-y-3 text-sm">
      <div className="flex items-center gap-2">
        <Wrench size={18} className="text-accent" />
        <h2 className="font-medium text-text">Tools</h2>
        <div className="ml-auto flex items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setOpen(true)}
            leftIcon={<Plus size={14} />}
          >
            Add custom tool
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={syncTools}
            disabled={syncing}
            leftIcon={<RefreshCw size={14} />}
          >
            {syncing ? "Syncing…" : "Sync to Vapi"}
          </Button>
        </div>
      </div>
      <p className="text-xs text-muted">
        Enable the tools this customer&apos;s assistant should use, then Sync to Vapi.
        Built-ins are handled by our webhook (scoped by{" "}
        <span className="font-mono">organization_id</span>); custom tools call your own URL.
      </p>

      {tools.length === 0 ? (
        <p className="text-muted">No tools yet.</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-surface/60 text-left text-xs uppercase text-muted">
                <th className="px-3 py-2">Tool</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Enabled</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {tools.map((t) => (
                <tr
                  key={t.id}
                  className="border-b border-border/60 align-top last:border-0"
                >
                  <td className="px-3 py-2">
                    <div className="font-mono text-xs text-text">{t.name}</div>
                    {t.description && (
                      <div className="text-xs text-muted">{t.description}</div>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <Badge tone={t.kind === "custom" ? "accent" : "neutral"}>
                      {t.kind}
                    </Badge>
                  </td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => toggle(t)}
                      aria-pressed={t.enabled}
                      className={cx(
                        "rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors",
                        t.enabled
                          ? "bg-positive/15 text-positive"
                          : "bg-surface-2 text-muted",
                      )}
                    >
                      {t.enabled ? "On" : "Off"}
                    </button>
                  </td>
                  <td className="px-3 py-2">
                    <Badge tone={statusTone(t.syncStatus)}>{t.syncStatus}</Badge>
                  </td>
                  <td className="px-3 py-2 text-right">
                    {t.kind === "custom" && (
                      <Button
                        size="sm"
                        variant="dangerGhost"
                        leftIcon={<Trash2 size={14} />}
                        onClick={() => removeTool(t)}
                      >
                        Delete
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Add custom tool"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={createTool}
              disabled={saving || !form.name.trim() || !form.serverUrl.trim()}
            >
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
              placeholder="get_order_status"
            />
          </Field>
          <Field label="Description">
            <Input
              value={form.description}
              onChange={(e) =>
                setForm((f) => ({ ...f, description: e.target.value }))
              }
              placeholder="What this tool does (the assistant reads this)"
            />
          </Field>
          <Field label="Server URL" required>
            <Input
              value={form.serverUrl}
              onChange={(e) =>
                setForm((f) => ({ ...f, serverUrl: e.target.value }))
              }
              placeholder="https://your-api.example.com/tool"
            />
          </Field>
          <Field label="Parameters (JSON schema, optional)">
            <Textarea
              rows={5}
              className="font-mono text-xs"
              value={form.parameters}
              onChange={(e) =>
                setForm((f) => ({ ...f, parameters: e.target.value }))
              }
              placeholder={'{\n  "type": "object",\n  "properties": {}\n}'}
            />
          </Field>
        </div>
      </Modal>
    </Card>
  );
}
