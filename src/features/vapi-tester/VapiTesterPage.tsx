"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "@shared/api/client";
import { useAuth } from "@features/auth/AuthProvider";
import { Role } from "@domain/enums";
import {
  PageContainer,
  PageHeader,
  Card,
  Button,
  Field,
  Input,
  Select,
  PasswordInput,
  Badge,
  Spinner,
  Label,
} from "@shared/ui/primitives";
import { useToast } from "@shared/ui/Toast";
import { Play, Copy } from "lucide-react";
import type { OrgListResponse } from "@contracts/organizations";
import type {
  VapiTesterOp,
  VapiKeySource,
  VapiTestResponse,
} from "@contracts/vapi-tester";

type ParamKey = "id" | "assistantId" | "limit";

interface OpDef {
  op: VapiTesterOp;
  label: string;
  endpoint: string;
  params: {
    key: ParamKey;
    label: string;
    required?: boolean;
    placeholder?: string;
  }[];
}

/** Catalog of the read-only Vapi operations the website uses, with the inputs each needs. */
const OPERATIONS: OpDef[] = [
  { op: "validateKey", label: "Validate key", endpoint: "GET /assistant?limit=1", params: [] },
  {
    op: "listAssistants",
    label: "List assistants",
    endpoint: "GET /assistant",
    params: [{ key: "limit", label: "Limit", placeholder: "100" }],
  },
  {
    op: "getAssistant",
    label: "Get assistant",
    endpoint: "GET /assistant/{id}",
    params: [{ key: "id", label: "Assistant ID", required: true }],
  },
  {
    op: "listPhoneNumbers",
    label: "List phone numbers",
    endpoint: "GET /phone-number",
    params: [{ key: "limit", label: "Limit", placeholder: "100" }],
  },
  {
    op: "getPhoneNumber",
    label: "Get phone number",
    endpoint: "GET /phone-number/{id}",
    params: [{ key: "id", label: "Phone number ID", required: true }],
  },
  {
    op: "listCalls",
    label: "List calls",
    endpoint: "GET /call",
    params: [
      { key: "assistantId", label: "Assistant ID (optional filter)" },
      { key: "limit", label: "Limit", placeholder: "100" },
    ],
  },
  {
    op: "getCall",
    label: "Get call",
    endpoint: "GET /call/{id}",
    params: [{ key: "id", label: "Call ID", required: true }],
  },
  { op: "listVoices", label: "List voices", endpoint: "GET /voice-library", params: [] },
];

const KEY_SOURCES: { value: VapiKeySource; label: string }[] = [
  { value: "pasted", label: "Pasted key" },
  { value: "platform", label: "Platform key (server)" },
  { value: "org", label: "Organization's stored key" },
];

export function VapiTesterPage() {
  const { user } = useAuth();
  const toast = useToast();

  const [opName, setOpName] = useState<VapiTesterOp>("validateKey");
  const [keySource, setKeySource] = useState<VapiKeySource>("pasted");
  const [apiKey, setApiKey] = useState("");
  const [orgId, setOrgId] = useState("");
  const [params, setParams] = useState<Record<string, string>>({});

  const isSuper = user?.role === Role.SUPER_ADMIN;

  const orgsQuery = useQuery({
    queryKey: ["organizations"],
    queryFn: () => api.get<OrgListResponse>("/organizations"),
    enabled: isSuper && keySource === "org",
  });

  const currentOp = OPERATIONS.find((o) => o.op === opName) ?? OPERATIONS[0];

  const runMutation = useMutation({
    mutationFn: () => {
      const payloadParams: Record<string, unknown> = {};
      for (const p of currentOp.params) {
        const v = params[p.key]?.trim();
        if (!v) continue;
        payloadParams[p.key] = p.key === "limit" ? Number(v) : v;
      }
      return api.post<VapiTestResponse>("/vapi-tester", {
        operation: opName,
        keySource,
        apiKey: keySource === "pasted" ? apiKey : undefined,
        organizationId: keySource === "org" ? orgId : undefined,
        params: payloadParams,
      });
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Request failed"),
  });

  if (!isSuper) {
    return (
      <PageContainer>
        <p className="text-sm text-muted">Super-admin only.</p>
      </PageContainer>
    );
  }

  const canRun =
    !(keySource === "pasted" && !apiKey.trim()) &&
    !(keySource === "org" && !orgId) &&
    currentOp.params.every((p) => !p.required || !!params[p.key]?.trim());

  const result = runMutation.data;
  const pretty = result
    ? JSON.stringify(result.ok ? result.data : (result.error ?? result.data), null, 2)
    : "";

  async function copyResponse() {
    if (!pretty) return;
    try {
      await navigator.clipboard.writeText(pretty);
      toast.success("Response copied");
    } catch {
      toast.error("Could not copy");
    }
  }

  return (
    <PageContainer size="wide">
      <PageHeader
        title="Vapi API Tester"
        subtitle="Run a read-only Vapi call with any key and inspect the raw response. Super-admin only."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Controls */}
        <Card className="space-y-4">
          <Field label="Operation">
            <Select
              value={opName}
              onChange={(e) => {
                setOpName(e.target.value as VapiTesterOp);
                setParams({});
              }}
            >
              {OPERATIONS.map((o) => (
                <option key={o.op} value={o.op}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>
          <p className="-mt-2 font-mono text-xs text-muted">{currentOp.endpoint}</p>

          <Field label="Key source">
            <Select
              value={keySource}
              onChange={(e) => setKeySource(e.target.value as VapiKeySource)}
            >
              {KEY_SOURCES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </Select>
          </Field>

          {keySource === "pasted" && (
            <Field label="Vapi private key">
              <PasswordInput
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-…"
                autoComplete="off"
              />
            </Field>
          )}

          {keySource === "platform" && (
            <p className="rounded-lg bg-surface-2 px-3 py-2 text-xs text-muted">
              Uses the server&apos;s configured platform key (VAPI_API_KEY). The key is never sent
              to the browser.
            </p>
          )}

          {keySource === "org" && (
            <Field label="Organization">
              <Select value={orgId} onChange={(e) => setOrgId(e.target.value)}>
                <option value="">
                  {orgsQuery.isLoading ? "Loading…" : "Select an organization…"}
                </option>
                {orgsQuery.data?.organizations.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}

          {currentOp.params.length > 0 && (
            <div className="space-y-3 border-t border-border pt-4">
              {currentOp.params.map((p) => (
                <Field key={p.key} label={p.label} required={p.required}>
                  <Input
                    value={params[p.key] ?? ""}
                    inputMode={p.key === "limit" ? "numeric" : undefined}
                    placeholder={p.placeholder}
                    onChange={(e) =>
                      setParams((prev) => ({ ...prev, [p.key]: e.target.value }))
                    }
                  />
                </Field>
              ))}
            </div>
          )}

          <Button
            onClick={() => runMutation.mutate()}
            disabled={!canRun || runMutation.isPending}
            leftIcon={
              runMutation.isPending ? <Spinner size={16} /> : <Play size={16} />
            }
          >
            {runMutation.isPending ? "Running…" : "Run"}
          </Button>
        </Card>

        {/* Response */}
        <Card className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <Label>Response</Label>
            {result && (
              <div className="flex items-center gap-2">
                <Badge tone={result.ok ? "success" : "danger"}>
                  {result.ok ? "OK" : "Error"}
                  {result.statusCode != null ? ` · ${result.statusCode}` : ""}
                </Badge>
                <span className="text-xs text-muted">{result.durationMs} ms</span>
                <Button size="sm" variant="ghost" onClick={copyResponse} leftIcon={<Copy size={14} />}>
                  Copy
                </Button>
              </div>
            )}
          </div>

          {runMutation.isPending ? (
            <div className="flex items-center gap-2 text-sm text-muted">
              <Spinner size={16} /> Calling Vapi…
            </div>
          ) : result ? (
            <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap break-words rounded-lg bg-surface-2 p-3 font-mono text-xs text-text">
              {pretty || "(empty response)"}
            </pre>
          ) : (
            <p className="text-sm text-muted">
              Choose an operation and key source, then run to see the raw Vapi response here.
            </p>
          )}
        </Card>
      </div>
    </PageContainer>
  );
}
