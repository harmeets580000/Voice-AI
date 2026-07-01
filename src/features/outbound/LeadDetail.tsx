"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@shared/api/client";
import { Modal } from "@shared/ui/Modal";
import { Button, Badge, Field, Input, Select } from "@shared/ui/primitives";
import { useToast } from "@shared/ui/Toast";
import type {
  LeadDTO,
  LeadActivityDTO,
  LeadStageDTO,
} from "@contracts/outbound-leads";

const STAGES: LeadStageDTO[] = [
  "NEW",
  "CONTACTED",
  "QUALIFIED",
  "PROPOSAL",
  "WON",
  "LOST",
];

function describe(a: LeadActivityDTO): string {
  const d = (a.data ?? {}) as Record<string, unknown>;
  switch (a.type) {
    case "CREATED":
      return `Lead created${d.source ? ` (${String(d.source)})` : ""}`;
    case "STAGE_CHANGED":
      return `Moved ${String(d.from)} → ${String(d.to)}${
        d.reason ? ` — ${String(d.reason)}` : ""
      }`;
    case "NOTE":
      return `Note: ${String(d.note ?? "")}`;
    case "ASSIGNED":
      return "Owner changed";
    case "CALL":
      return "Call placed";
    case "CONVERTED":
      return "Converted to a meeting";
    default:
      return a.type;
  }
}

export function LeadDetail({
  leadId,
  onClose,
  onChanged,
  extraActions,
}: {
  leadId: string;
  onClose: () => void;
  onChanged?: () => void;
  /** Slot for phase-specific buttons (Place call in Q4, Convert in Q6). */
  extraActions?: (lead: LeadDTO) => React.ReactNode;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const [note, setNote] = useState("");
  const [value, setValue] = useState<string>("");

  const { data, refetch } = useQuery({
    queryKey: ["outbound-lead", leadId],
    queryFn: () => api.get<{ lead: LeadDTO }>(`/outbound/leads/${leadId}`),
  });
  const lead = data?.lead;

  async function refresh() {
    await refetch();
    onChanged?.();
    await qc.invalidateQueries({ queryKey: ["outbound-leads"] });
  }

  async function changeStage(stage: LeadStageDTO) {
    let lostReason: string | undefined;
    if (stage === "LOST") {
      lostReason = window.prompt("Reason for marking lost?") ?? undefined;
      if (!lostReason) return;
    }
    try {
      await api.put(`/outbound/leads/${leadId}/stage`, { stage, lostReason });
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not change stage");
    }
  }

  async function saveValue() {
    try {
      await api.patch(`/outbound/leads/${leadId}`, {
        value: value === "" ? null : Number(value),
      });
      setValue("");
      await refresh();
      toast.success("Saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    }
  }

  async function saveNote() {
    if (!note.trim()) return;
    try {
      await api.post(`/outbound/leads/${leadId}/notes`, { note });
      setNote("");
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not add note");
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={lead?.contact?.name ?? "Lead"}
      size="lg"
      footer={<Button onClick={onClose}>Close</Button>}
    >
      {!lead ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
            {lead.contact?.phone && <span>{lead.contact.phone}</span>}
            {lead.contact?.email && <span>· {lead.contact.email}</span>}
            <Badge tone="accent">{lead.source}</Badge>
            {lead.value != null && <span>· ${lead.value.toLocaleString()}</span>}
          </div>

          {extraActions && (
            <div className="flex flex-wrap gap-2">{extraActions(lead)}</div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label="Stage">
              <Select
                value={lead.stage}
                onChange={(e) => changeStage(e.target.value as LeadStageDTO)}
              >
                {STAGES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Deal value">
              <div className="flex gap-2">
                <Input
                  type="number"
                  placeholder={
                    lead.value != null ? String(lead.value) : "e.g. 5000"
                  }
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                />
                <Button variant="secondary" onClick={saveValue}>
                  Save
                </Button>
              </div>
            </Field>
          </div>

          {lead.lostReason && (
            <p className="text-sm text-danger">Lost: {lead.lostReason}</p>
          )}

          <div>
            <p className="mb-1.5 text-sm font-medium text-ink2">Add note</p>
            <div className="flex gap-2">
              <Input
                value={note}
                placeholder="Log a call outcome, next step…"
                onChange={(e) => setNote(e.target.value)}
              />
              <Button onClick={saveNote} disabled={!note.trim()}>
                Add
              </Button>
            </div>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium text-ink2">Activity</p>
            <ul className="space-y-2">
              {(lead.activities ?? []).map((a) => (
                <li key={a.id} className="flex gap-2 text-sm">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                  <div>
                    <div className="text-text">{describe(a)}</div>
                    <div className="text-xs text-faint">
                      {new Date(a.createdAt).toLocaleString()}
                    </div>
                  </div>
                </li>
              ))}
              {(lead.activities ?? []).length === 0 && (
                <li className="text-sm text-muted">No activity yet.</li>
              )}
            </ul>
          </div>
        </div>
      )}
    </Modal>
  );
}
