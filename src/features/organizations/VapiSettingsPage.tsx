"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Save, RefreshCw, Zap, KeyRound, Bot, Phone } from "lucide-react";
import { api } from "@shared/api/client";
import {
  PageHeader,
  Card,
  Button,
  Field,
  Input,
  Textarea,
  PasswordInput,
  Badge,
} from "@shared/ui/primitives";
import { useToast } from "@shared/ui/Toast";
import { OptionSelect } from "@features/voice/OptionSelect";
import { ToolsManager } from "./ToolsManager";
import { SyncHistory } from "./SyncHistory";
import type {
  VapiSettingsResponse,
  TestKeyResponse,
  ProvisionResponse,
  VoiceOptionsResponse,
} from "@contracts/vapi";

/**
 * Per-customer Vapi settings (super-admin only). The private key field is masked and the
 * plaintext is NEVER rendered back — only the stored last-4 is shown (test C-SEC-07).
 */
export function VapiSettingsPage({ orgId }: { orgId: string }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [keyInput, setKeyInput] = useState("");
  const [form, setForm] = useState({
    greeting: "",
    prompt: "",
    voice: "",
    llmModel: "",
  });

  const { data } = useQuery({
    queryKey: ["vapi", orgId],
    queryFn: () => api.get<VapiSettingsResponse>(`/organizations/${orgId}/vapi`),
  });
  const { data: opts } = useQuery({
    queryKey: ["voice-options"],
    queryFn: () => api.get<VoiceOptionsResponse>("/voice-options"),
    staleTime: 5 * 60_000,
  });

  useEffect(() => {
    if (data?.settings) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setForm({
        greeting: data.settings.greeting ?? "",
        prompt: data.settings.prompt ?? "",
        voice: data.settings.voice ?? "",
        llmModel: data.settings.llmModel ?? "",
      });
    }
  }, [data]);

  const s = data?.settings;

  async function onSave() {
    try {
      await api.put<VapiSettingsResponse>(`/organizations/${orgId}/vapi`, {
        ...form,
        ...(keyInput ? { privateKey: keyInput } : {}),
      });
      setKeyInput("");
      await queryClient.invalidateQueries({ queryKey: ["vapi", orgId] });
      toast.success("Vapi settings saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    }
  }

  async function onTestKey() {
    try {
      const res = await api.post<TestKeyResponse>(
        `/organizations/${orgId}/vapi/test-key`,
        { apiKey: keyInput },
      );
      if (res.valid) {
        toast.success("Key valid — syncing from Vapi…");
        await onSync();
      } else {
        toast.error(`Invalid: ${res.reason}`);
      }
    } catch {
      toast.error("Could not validate key");
    }
  }

  async function onProvision() {
    try {
      const res = await api.post<ProvisionResponse>(
        `/organizations/${orgId}/provision`,
      );
      await queryClient.invalidateQueries({ queryKey: ["vapi", orgId] });
      if (res.syncStatus === "synced") toast.success("Provisioned successfully");
      else toast.error(`Provision ${res.syncStatus}: ${res.syncError ?? ""}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Provision failed");
    }
  }

  async function onSync() {
    try {
      const res = await api.post<{
        syncStatus: string;
        importedCalls: number;
        syncError: string | null;
      }>(`/organizations/${orgId}/resync`);
      await queryClient.invalidateQueries();
      if (res.syncStatus === "synced") {
        const phone = s?.vapiPhoneNumber ? ` · ${s.vapiPhoneNumber}` : "";
        toast.success(
          `Synced from Vapi${phone} · ${res.importedCalls} call(s) imported`,
        );
      } else {
        toast.error(`Sync ${res.syncStatus}: ${res.syncError ?? ""}`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Sync failed");
    }
  }

  return (
    <div className="max-w-3xl space-y-5">
      <PageHeader
        title="Vapi settings"
        subtitle="Configure and inspect this customer's voice setup."
      />

      {/* Read-only summary of what's currently synced from Vapi */}
      <Card className="space-y-3">
        <div className="flex items-center gap-2">
          <Bot size={18} className="text-accent" />
          <h2 className="font-medium text-text">Assistant (synced from Vapi)</h2>
          {s?.syncStatus && (
            <Badge tone={s.syncStatus === "synced" ? "success" : "neutral"}>
              {s.syncStatus}
            </Badge>
          )}
        </div>

        {/* Phone number, prominent */}
        <div className="flex items-center gap-2 rounded-lg bg-accent-tint px-3 py-2">
          <Phone size={16} className="text-accent" />
          <span className="text-sm text-muted">Phone number</span>
          <span className="ml-auto font-mono font-medium text-text">
            {s?.vapiPhoneNumber ?? "Not provisioned yet"}
          </span>
        </div>

        <div className="grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
          <Row label="Voice" value={s?.voice} />
          <Row label="LLM model" value={s?.llmModel} />
          <Row label="Assistant id" value={s?.vapiAssistantId} mono />
          <Row label="Knowledge base id" value={s?.vapiKnowledgeBaseId} mono />
        </div>
        <div className="space-y-1 text-sm">
          <div className="text-muted">Greeting</div>
          <div className="rounded-lg bg-surface px-3 py-2 text-text">
            {s?.greeting || "—"}
          </div>
        </div>
        <div className="space-y-1 text-sm">
          <div className="text-muted">System prompt</div>
          <div className="max-h-32 overflow-auto whitespace-pre-wrap rounded-lg bg-surface px-3 py-2 text-text">
            {s?.prompt || "—"}
          </div>
        </div>
        <p className="text-xs text-faint">
          Last synced: {s?.lastSyncedAt ?? "never"}. Edit below and Save to push changes,
          or Sync from Vapi to pull the latest.
        </p>
      </Card>

      <Card className="space-y-3">
        <h2 className="font-medium text-text">Assistant</h2>
        <Field label="Greeting (first message)">
          <Input
            value={form.greeting}
            onChange={(e) => setForm((f) => ({ ...f, greeting: e.target.value }))}
          />
        </Field>
        <Field label="System prompt">
          <Textarea
            rows={3}
            value={form.prompt}
            onChange={(e) => setForm((f) => ({ ...f, prompt: e.target.value }))}
          />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
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
      </Card>

      <Card className="space-y-2">
        <h2 className="font-medium text-text">Per-customer Vapi private key</h2>
        <p className="text-xs text-muted">
          Leave blank to use the platform key. If set, it&apos;s stored encrypted; only
          the last 4 are ever shown. Current:{" "}
          {s?.hasCustomKey ? (
            <span className="font-mono text-text">…{s.keyLast4}</span>
          ) : (
            <span>platform key</span>
          )}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <PasswordInput
            aria-label="Vapi private key"
            placeholder="sk_live_…"
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            className="w-72 font-mono"
          />
          <Button
            variant="secondary"
            onClick={onTestKey}
            disabled={!keyInput}
            leftIcon={<KeyRound size={16} />}
          >
            Test key
          </Button>
        </div>
      </Card>

      <Card className="space-y-1.5 text-sm">
        <div className="mb-1 flex items-center gap-2">
          <h2 className="font-medium text-text">Status &amp; identifiers</h2>
          {s?.syncStatus && (
            <Badge tone={s.syncStatus === "synced" ? "success" : "neutral"}>
              {s.syncStatus}
            </Badge>
          )}
        </div>
        <p className="mb-1 text-xs text-muted">
          Mirrored from Vapi on Provision / Sync. Our database is the source of truth;
          these ids link each record to its Vapi copy.
        </p>
        <Row label="Last synced" value={s?.lastSyncedAt} />
        <Row label="Sync error" value={s?.syncError} />
        <Row label="Assistant id" value={s?.vapiAssistantId} mono />
        <Row label="Phone number" value={s?.vapiPhoneNumber} mono />
        <Row label="Phone number id" value={s?.vapiPhoneNumberId} mono />
        <Row label="Knowledge base id" value={s?.vapiKnowledgeBaseId} mono />
        <Row label="Vapi org id" value={s?.vapiOrgId} mono />
        <Row label="Tools webhook" value={s?.toolsWebhookUrl} mono />
        <Row label="Call-ended webhook" value={s?.callEndedWebhookUrl} mono />
      </Card>

      {/* Per-customer tools (built-in + custom), reconciled to Vapi */}
      <ToolsManager orgId={orgId} />

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={onSave} leftIcon={<Save size={16} />}>
          Save
        </Button>
        <Button
          variant="secondary"
          onClick={onProvision}
          leftIcon={<Zap size={16} />}
        >
          {s?.vapiAssistantId ? "Re-provision" : "Provision"}
        </Button>
        <Button
          variant="secondary"
          onClick={onSync}
          leftIcon={<RefreshCw size={16} />}
        >
          Sync from Vapi
        </Button>
      </div>

      {/* Full sync history */}
      <SyncHistory orgId={orgId} />
    </div>
  );
}

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value?: string | null;
  mono?: boolean;
}) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted">{label}</span>
      <span className={mono ? "truncate font-mono text-xs text-text" : "text-text"}>
        {value ?? "—"}
      </span>
    </div>
  );
}
