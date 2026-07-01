"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@shared/api/client";
import { Modal } from "@shared/ui/Modal";
import { Button, Field, Select } from "@shared/ui/primitives";
import { useToast } from "@shared/ui/Toast";
import { Phone } from "lucide-react";
import type { AgentsResponse } from "@contracts/outbound-agents";

/**
 * "Place call" button + modal (stub — queues an OutboundCall, nothing dials). Requires an Outbound
 * Agent, which supplies both the script and the from-number (its Vapi number). Opted-out contacts
 * are blocked server-side.
 */
export function PlaceCall({
  leadId,
  contactId,
}: {
  leadId?: string;
  contactId?: string;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [agentId, setAgentId] = useState("");
  const [busy, setBusy] = useState(false);

  const { data: agents } = useQuery({
    queryKey: ["outbound-agents"],
    queryFn: () => api.get<AgentsResponse>("/outbound/agents"),
    enabled: open,
  });
  const agentList = agents?.agents ?? [];
  const selected = agentList.find((a) => a.id === agentId);
  const noFromNumber = !!selected && !selected.providerPhoneNumber;

  async function place() {
    if (!agentId) {
      toast.error("Pick an agent");
      return;
    }
    setBusy(true);
    try {
      await api.post("/outbound/calls", { leadId, contactId, agentId });
      toast.success("Call queued");
      setOpen(false);
      if (leadId) {
        await qc.invalidateQueries({ queryKey: ["outbound-lead", leadId] });
        await qc.invalidateQueries({ queryKey: ["outbound-leads"] });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not place call");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button
        variant="secondary"
        leftIcon={<Phone size={15} />}
        onClick={() => setOpen(true)}
      >
        Place call
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Place call"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={place}
              disabled={busy || !agentId || noFromNumber}
            >
              {busy ? "Queuing…" : "Queue call"}
            </Button>
          </>
        }
      >
        {agentList.length === 0 ? (
          <p className="text-sm text-muted">
            No outbound agents yet. Create one (with a from-number) first.
          </p>
        ) : (
          <div className="space-y-3">
            <Field label="Agent" required>
              <Select
                value={agentId}
                onChange={(e) => setAgentId(e.target.value)}
              >
                <option value="">Select an agent…</option>
                {agentList.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            </Field>
            <p className="text-xs text-faint">
              From:{" "}
              {selected?.providerPhoneNumber ??
                "— set a from-number on this agent —"}
            </p>
            {noFromNumber && (
              <p className="text-xs text-danger">
                This agent has no from-number. Set one on the Agents page.
              </p>
            )}
            <p className="text-xs text-faint">
              Stub only — this queues a call; nothing dials this phase.
            </p>
          </div>
        )}
      </Modal>
    </>
  );
}
