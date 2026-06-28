"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Save, RefreshCw, Zap, KeyRound, Bot, Phone, RotateCcw } from "lucide-react";
import { api } from "@shared/api/client";
import {
  PageHeader,
  Card,
  Button,
  Field,
  Input,
  Select,
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
  ToolsSyncResponse,
  AssistantListResponse,
} from "@contracts/vapi";

type Tab = "connection" | "assistant" | "tools" | "status" | "history";
const TABS: { id: Tab; label: string }[] = [
  { id: "connection", label: "Connection" },
  { id: "assistant", label: "Assistant" },
  { id: "tools", label: "Tools" },
  { id: "status", label: "Status" },
  { id: "history", label: "History" },
];

/**
 * Per-customer Vapi settings (super-admin only). The private key field is masked and the
 * plaintext is NEVER rendered back — only the stored last-4 is shown (test C-SEC-07).
 */
export function VapiSettingsPage({ orgId }: { orgId: string }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [keyInput, setKeyInput] = useState("");
  const [selectingAssistant, setSelectingAssistant] = useState(false);
  const [tab, setTab] = useState<Tab>("connection");
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
  const assistantsQuery = useQuery({
    queryKey: ["vapi-assistants", orgId],
    queryFn: () =>
      api.get<AssistantListResponse>(`/organizations/${orgId}/vapi/assistants`),
    enabled: !!data?.settings?.hasCustomKey,
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

  async function onSave(): Promise<boolean> {
    try {
      await api.put<VapiSettingsResponse>(`/organizations/${orgId}/vapi`, {
        ...form,
        ...(keyInput ? { privateKey: keyInput } : {}),
      });
      setKeyInput("");
      await queryClient.invalidateQueries({ queryKey: ["vapi", orgId] });
      toast.success("Vapi settings saved");
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
      return false;
    }
  }

  async function onTestKey() {
    try {
      const res = await api.post<TestKeyResponse>(
        `/organizations/${orgId}/vapi/test-key`,
        { apiKey: keyInput },
      );
      if (res.valid) {
        toast.success("Key valid — saving & syncing from Vapi…");
        // Persist the key first so the sync (and later provision) use it. With no platform
        // key in .env, an unsaved key would leave the sync with nothing to authenticate with.
        await onSave();
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

  async function onSelectAssistant(assistantId: string) {
    if (!assistantId || assistantId === s?.vapiAssistantId) return;
    setSelectingAssistant(true);
    try {
      await api.put<VapiSettingsResponse>(
        `/organizations/${orgId}/vapi/assistants`,
        { assistantId },
      );
      await queryClient.invalidateQueries();
      toast.success("Active assistant updated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not switch assistant");
    } finally {
      setSelectingAssistant(false);
    }
  }

  async function onSaveAndProvision() {
    if (!(await onSave())) return;
    await onProvision();
    // Also push this org's tools (built-in + custom, enabled set) to Vapi.
    try {
      const res = await api.post<ToolsSyncResponse>(
        `/organizations/${orgId}/tools/sync`,
      );
      if (res.syncError) toast.error(`Tools sync: ${res.syncError}`);
      else toast.success("Tools synced to Vapi");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Tools sync failed");
    }
    await queryClient.invalidateQueries();
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

  async function onReset() {
    if (
      !window.confirm(
        "Reset this org's Vapi data? Deletes its synced config, imported calls, tool links, and sync history. The saved API key is kept.",
      )
    )
      return;
    try {
      await api.post<VapiSettingsResponse>(
        `/organizations/${orgId}/vapi/reset`,
      );
      await queryClient.invalidateQueries();
      toast.success("Vapi data reset — key kept");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Reset failed");
    }
  }

  return (
    <div className="max-w-4xl space-y-5">
      <PageHeader
        title="Vapi settings"
        subtitle="Configure and inspect this customer's voice setup."
      />

      <div role="tablist" className="flex flex-wrap gap-2 text-sm">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`rounded-lg px-3 py-1.5 transition-colors ${
              tab === t.id
                ? "bg-accent text-on-accent"
                : "border border-control text-text hover:bg-surface"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Connection: the Vapi API key + connection-level actions */}
      {tab === "connection" && (
        <Card className="space-y-3">
        <div className="flex items-center gap-2">
          <KeyRound size={18} className="text-accent" />
          <h2 className="font-medium text-text">Vapi API key</h2>
          {s &&
            (s.hasCustomKey ? (
              <Badge tone="success">Configured · …{s.keyLast4}</Badge>
            ) : (
              <Badge tone="warning">Not configured</Badge>
            ))}
        </div>
        <p className="text-xs text-muted">
          First step: this organization authenticates to Vapi with its own private key. Stored
          encrypted — only the last 4 are ever shown. Test &amp; save it before provisioning or
          syncing.
        </p>
        {s?.hasCustomKey && (
          <p className="text-xs text-muted">
            A key is already configured for this organization. Enter a new key below only to
            replace it.
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <PasswordInput
            aria-label="Vapi private key"
            placeholder={
              s?.hasCustomKey ? "Enter a new key to replace…" : "Vapi private key…"
            }
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            className="w-72 font-mono"
          />
          <Button
            onClick={onTestKey}
            disabled={!keyInput}
            leftIcon={<KeyRound size={16} />}
            title="Validate this key against Vapi, then save it (encrypted) and pull any existing data for this org."
          >
            Test &amp; save key
          </Button>
          <Button
            variant="secondary"
            onClick={onSync}
            disabled={!s?.hasCustomKey}
            leftIcon={<RefreshCw size={16} />}
            title="Mirror this org's Vapi account into the portal — assistant config, phone, tools, and new calls. Vapi is the source of truth, so this overwrites the editable fields."
          >
            Sync from Vapi
          </Button>
          <Button
            variant="dangerGhost"
            onClick={onReset}
            leftIcon={<RotateCcw size={16} />}
            title="Delete everything Vapi-derived for this org (synced config, imported calls, tool links, sync history). Your saved API key is kept."
          >
            Reset Vapi data
          </Button>
        </div>
        </Card>
      )}

      {/* Assistant: active-assistant selector + editable config */}
      {tab === "assistant" && (
        <Card className="space-y-3">
        <h2 className="font-medium text-text">Assistant</h2>
        <p className="text-xs text-muted">
          Vapi is the source of truth: these fields auto-reflect from Vapi every minute, so changes
          made in the Vapi dashboard appear here (and overwrite unsaved edits). Edit here and Save to
          push your changes to Vapi.
        </p>
        {s?.hasCustomKey && (
          <Field label="Active assistant">
            <Select
              value={s?.vapiAssistantId ?? ""}
              disabled={selectingAssistant || assistantsQuery.isLoading}
              onChange={(e) => onSelectAssistant(e.target.value)}
              title="Pick which assistant in this org's Vapi account is the active one. Selecting loads its config and links its calls."
            >
              <option value="">
                {assistantsQuery.isLoading
                  ? "Loading assistants…"
                  : "— Select an assistant —"}
              </option>
              {assistantsQuery.data?.assistants.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name || a.id}
                </option>
              ))}
            </Select>
          </Field>
        )}
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
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <Button
            onClick={onSave}
            leftIcon={<Save size={16} />}
            title="Save these assistant settings to our database (and push them to the live Vapi assistant if this org is already provisioned)."
          >
            Save
          </Button>
          <Button
            variant="secondary"
            onClick={onSaveAndProvision}
            leftIcon={<Zap size={16} />}
            title="Save the settings, then create/update this org's assistant and phone number in Vapi, and sync its enabled tools."
          >
            {s?.vapiAssistantId
              ? "Save & re-provision to Vapi"
              : "Save & provision to Vapi"}
          </Button>
        </div>
        </Card>
      )}

      {/* Tools: per-customer tools (built-in + custom), pushed on "Save & provision"
          or via the Tools "Sync to Vapi" button. */}
      {tab === "tools" && <ToolsManager orgId={orgId} />}

      {/* Status: live mirror of what's provisioned in Vapi */}
      {tab === "status" && (
        <Card className="space-y-3 text-sm">
        <div className="mb-1 flex items-center gap-2">
          <Bot size={18} className="text-accent" />
          <h2 className="font-medium text-text">Live Vapi status</h2>
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

        <p className="text-xs text-muted">
          Mirrored from Vapi on Provision / Sync — our database is the source of truth; these ids
          link each record to its Vapi copy.
        </p>
        <Row label="Assistant id" value={s?.vapiAssistantId} mono />
        <Row label="Phone number id" value={s?.vapiPhoneNumberId} mono />
        <Row label="Knowledge base id" value={s?.vapiKnowledgeBaseId} mono />
        <Row label="Vapi org id" value={s?.vapiOrgId} mono />
        <Row label="Last synced" value={s?.lastSyncedAt} />
        <Row label="Sync error" value={s?.syncError} />
        <Row label="Tools webhook" value={s?.toolsWebhookUrl} mono />
        <Row label="Call-ended webhook" value={s?.callEndedWebhookUrl} mono />
      </Card>
      )}

      {/* History: every sync run for this org */}
      {tab === "history" && <SyncHistory orgId={orgId} defaultOpen />}
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
