"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, KeyRound, Bot, Phone, RotateCcw } from "lucide-react";
import { api } from "@shared/api/client";
import {
  PageHeader,
  Card,
  Button,
  PasswordInput,
  Badge,
} from "@shared/ui/primitives";
import { useToast } from "@shared/ui/Toast";
import { SyncHistory } from "./SyncHistory";
import type {
  VapiSettingsResponse,
  TestKeyResponse,
} from "@contracts/vapi";

type Tab = "connection" | "status" | "history";
const TABS: { id: Tab; label: string }[] = [
  { id: "connection", label: "Connection" },
  { id: "status", label: "Status" },
  { id: "history", label: "History" },
];

/**
 * Per-customer Vapi settings (super-admin only) — the org-level Vapi CONNECTION, live status
 * mirror, and sync history. Assistants and Tools have their own dedicated pages (/assistants,
 * /tools), so they are intentionally not duplicated here. The private key field is masked and the
 * plaintext is NEVER rendered back — only the stored last-4 is shown (test C-SEC-07).
 */
export function VapiSettingsPage({ orgId }: { orgId: string }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [keyInput, setKeyInput] = useState("");
  const [tab, setTab] = useState<Tab>("connection");

  const { data } = useQuery({
    queryKey: ["vapi", orgId],
    queryFn: () => api.get<VapiSettingsResponse>(`/organizations/${orgId}/vapi`),
  });

  const s = data?.settings;

  async function onSave(): Promise<boolean> {
    try {
      await api.put<VapiSettingsResponse>(`/organizations/${orgId}/vapi`, {
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
        // Persist the key first so the sync uses it. With no platform key in .env, an unsaved
        // key would leave the sync with nothing to authenticate with.
        await onSave();
        await onSync();
      } else {
        toast.error(`Invalid: ${res.reason}`);
      }
    } catch {
      toast.error("Could not validate key");
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
        subtitle="Connect this customer to Vapi and inspect its live voice setup."
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
