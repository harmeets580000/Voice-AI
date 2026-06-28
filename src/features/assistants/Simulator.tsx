"use client";

import { useRef, useState } from "react";
import { api } from "@shared/api/client";
import { Card, Button, Badge, Input, cx } from "@shared/ui/primitives";
import { useToast } from "@shared/ui/Toast";
import { Phone, PhoneOff, Send, Wrench } from "lucide-react";
import type { AssistantDTO, SimulateResponse } from "@contracts/assistants";

type ChatMsg = { role: "user" | "assistant"; content: string };
type CallState = "idle" | "connecting" | "active" | "error";

/**
 * Per-assistant simulator: place a real Vapi web voice call to the provisioned assistant, or
 * use the Claude-driven text chat (always available). Both run the assistant's selected tools
 * against real data, so bookings/cancellations actually happen.
 */
export function Simulator({
  orgId,
  assistant,
  vapiPublicKey,
}: {
  orgId: string;
  assistant: AssistantDTO;
  vapiPublicKey: string | null;
}) {
  const toast = useToast();

  // ---- Voice call (Vapi web SDK) ----
  const [callState, setCallState] = useState<CallState>("idle");
  // The @vapi-ai/web instance is loaded lazily on click (browser-only).
  const vapiRef = useRef<{ stop: () => void } | null>(null);

  async function startCall() {
    if (!vapiPublicKey) {
      toast.error("Set the org's Vapi public key in Settings → Integrations first.");
      return;
    }
    if (!assistant.providerAssistantId) {
      toast.error("Provision this assistant before calling it.");
      return;
    }
    try {
      setCallState("connecting");
      const { default: Vapi } = await import("@vapi-ai/web");
      const vapi = new Vapi(vapiPublicKey);
      vapiRef.current = vapi;
      vapi.on("call-start", () => setCallState("active"));
      vapi.on("call-end", () => setCallState("idle"));
      vapi.on("error", (e: unknown) => {
        setCallState("error");
        toast.error(e instanceof Error ? e.message : "Call error");
      });
      await vapi.start(assistant.providerAssistantId);
    } catch (e) {
      setCallState("error");
      toast.error(e instanceof Error ? e.message : "Could not start the call");
    }
  }

  function stopCall() {
    vapiRef.current?.stop();
    vapiRef.current = null;
    setCallState("idle");
  }

  // ---- Text chat (Claude tool loop) ----
  const [chat, setChat] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [toolLog, setToolLog] = useState<SimulateResponse["toolCalls"]>([]);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    const next: ChatMsg[] = [...chat, { role: "user", content: text }];
    setChat(next);
    setInput("");
    setBusy(true);
    try {
      const res = await api.post<SimulateResponse>(
        `/organizations/${orgId}/assistants/${assistant.id}/simulate`,
        { messages: next },
      );
      setChat([...next, { role: "assistant", content: res.reply }]);
      if (res.toolCalls.length) setToolLog((p) => [...p, ...res.toolCalls]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Simulator failed");
      setChat(next);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-text">Voice call</h3>
          <Badge tone={callState === "active" ? "accent" : "neutral"}>{callState}</Badge>
        </div>
        <p className="mb-3 text-xs text-muted">
          Place a real browser voice call to this assistant (uses your mic). Needs a provisioned
          assistant + the org Vapi public key.
        </p>
        {callState === "active" || callState === "connecting" ? (
          <Button variant="dangerGhost" leftIcon={<PhoneOff size={16} />} onClick={stopCall}>
            End call
          </Button>
        ) : (
          <Button leftIcon={<Phone size={16} />} onClick={startCall}>
            Call this assistant
          </Button>
        )}
      </Card>

      <Card className="p-4">
        <h3 className="mb-3 text-sm font-semibold text-text">Text chat tester</h3>
        <div className="mb-3 h-56 space-y-2 overflow-y-auto rounded-lg border border-border bg-bg p-3">
          {chat.length === 0 && (
            <p className="text-xs text-muted">
              Say something like “I’d like to book a haircut tomorrow at 3pm”.
            </p>
          )}
          {chat.map((m, i) => (
            <div
              key={i}
              className={cx(
                "max-w-[85%] rounded-lg px-3 py-2 text-sm",
                m.role === "user"
                  ? "ml-auto bg-accent-tint text-text"
                  : "bg-surface text-text",
              )}
            >
              {m.content}
            </div>
          ))}
          {busy && <p className="text-xs text-muted">…thinking</p>}
        </div>
        <div className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder="Type a message…"
            disabled={busy}
          />
          <Button leftIcon={<Send size={16} />} onClick={send} disabled={busy}>
            Send
          </Button>
        </div>
        {toolLog.length > 0 && (
          <div className="mt-3">
            <div className="mb-1 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-faint">
              <Wrench size={12} /> Tool calls
            </div>
            <ul className="space-y-1">
              {toolLog.map((t, i) => (
                <li key={i} className="rounded bg-surface px-2 py-1 font-mono text-[11px] text-ink2">
                  {t.name}({JSON.stringify(t.args)}) → {JSON.stringify(t.result)}
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>
    </div>
  );
}
