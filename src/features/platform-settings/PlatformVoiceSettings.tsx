"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@shared/api/client";
import { useAuth } from "@features/auth/AuthProvider";
import { Role } from "@domain/enums";
import {
  Card,
  Button,
  Field,
  Input,
  Textarea,
  PasswordInput,
} from "@shared/ui/primitives";
import { useToast } from "@shared/ui/Toast";
import { OptionSelect } from "@features/voice/OptionSelect";
import type {
  PlatformVoiceResponse,
  VoiceOptionsResponse,
} from "@contracts/vapi";

/** Platform-wide voice defaults (super-admin). Embedded in the Settings page. */
export function PlatformVoiceSettings() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const [keyInput, setKeyInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    defaultVoice: "",
    defaultLlmModel: "",
    defaultGreeting: "",
    defaultPrompt: "",
    publicApiBaseUrl: "",
  });

  const { data } = useQuery({
    queryKey: ["platform-voice"],
    queryFn: () => api.get<PlatformVoiceResponse>("/platform-voice"),
    enabled: user?.role === Role.SUPER_ADMIN,
  });
  const { data: opts } = useQuery({
    queryKey: ["voice-options"],
    queryFn: () => api.get<VoiceOptionsResponse>("/voice-options"),
    enabled: user?.role === Role.SUPER_ADMIN,
    staleTime: 5 * 60_000,
  });

  useEffect(() => {
    if (data?.settings) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setForm({
        defaultVoice: data.settings.defaultVoice ?? "",
        defaultLlmModel: data.settings.defaultLlmModel ?? "",
        defaultGreeting: data.settings.defaultGreeting ?? "",
        defaultPrompt: data.settings.defaultPrompt ?? "",
        publicApiBaseUrl: data.settings.publicApiBaseUrl ?? "",
      });
    }
  }, [data]);

  if (user?.role !== Role.SUPER_ADMIN) {
    return <p className="text-sm text-muted">Super-admin only.</p>;
  }

  async function save() {
    setSaving(true);
    try {
      await api.put<PlatformVoiceResponse>("/platform-voice", {
        ...form,
        ...(keyInput ? { privateKey: keyInput } : {}),
      });
      setKeyInput("");
      await qc.invalidateQueries({ queryKey: ["platform-voice"] });
      toast.success("Platform voice settings saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const s = data?.settings;

  return (
    <Card className="space-y-4">
      <p className="text-sm text-muted">
        Defaults new organizations inherit unless overridden per-customer.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <OptionSelect
          label="Default voice"
          value={form.defaultVoice}
          onChange={(v) => setForm((f) => ({ ...f, defaultVoice: v }))}
          options={opts?.voices ?? []}
        />
        <OptionSelect
          label="Default LLM model"
          value={form.defaultLlmModel}
          onChange={(v) => setForm((f) => ({ ...f, defaultLlmModel: v }))}
          options={opts?.models ?? []}
        />
        <Field label="Default greeting">
          <Input
            value={form.defaultGreeting}
            onChange={(e) =>
              setForm((f) => ({ ...f, defaultGreeting: e.target.value }))
            }
          />
        </Field>
        <Field label="Public API base URL">
          <Input
            value={form.publicApiBaseUrl}
            onChange={(e) =>
              setForm((f) => ({ ...f, publicApiBaseUrl: e.target.value }))
            }
          />
        </Field>
      </div>

      <Field label="Default prompt">
        <Textarea
          rows={3}
          value={form.defaultPrompt}
          onChange={(e) =>
            setForm((f) => ({ ...f, defaultPrompt: e.target.value }))
          }
        />
      </Field>

      <div>
        <span className="mb-1.5 block text-sm font-medium text-ink2">
          Platform Vapi private key
        </span>
        <p className="mb-1.5 text-xs text-muted">
          {s?.hasPlatformKey
            ? `Currently set (…${s.keyLast4}). Leave blank to keep.`
            : "Not set. Usually provided via env (VAPI_API_KEY)."}
        </p>
        <PasswordInput
          aria-label="Platform Vapi private key"
          placeholder="sk_live_…"
          value={keyInput}
          onChange={(e) => setKeyInput(e.target.value)}
          className="max-w-sm font-mono"
        />
      </div>

      <div>
        <Button onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
    </Card>
  );
}
