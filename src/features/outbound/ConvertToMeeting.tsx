"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@shared/api/client";
import { Modal } from "@shared/ui/Modal";
import { Button, Field, Select, Input } from "@shared/ui/primitives";
import { useToast } from "@shared/ui/Toast";
import { CalendarPlus } from "lucide-react";
import type { RepsResponse } from "@contracts/outbound-meetings";

/** "Convert → Meeting" button + modal (own minimal scheduler; guards rep double-booking). */
export function ConvertToMeeting({ leadId }: { leadId: string }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [ownerId, setOwnerId] = useState("");
  const [start, setStart] = useState("");
  const [duration, setDuration] = useState(30);
  const [busy, setBusy] = useState(false);

  const { data: reps } = useQuery({
    queryKey: ["outbound-reps"],
    queryFn: () => api.get<RepsResponse>("/outbound/reps"),
    enabled: open,
  });

  async function convert() {
    if (!ownerId || !start) {
      toast.error("Pick an owner and a time");
      return;
    }
    setBusy(true);
    try {
      await api.post("/outbound/meetings", {
        leadId,
        ownerUserId: ownerId,
        start: new Date(start).toISOString(),
        durationMin: duration,
      });
      toast.success("Meeting scheduled");
      setOpen(false);
      await qc.invalidateQueries({ queryKey: ["outbound-lead", leadId] });
      await qc.invalidateQueries({ queryKey: ["outbound-leads"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not schedule");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button
        variant="secondary"
        leftIcon={<CalendarPlus size={15} />}
        onClick={() => setOpen(true)}
      >
        Convert → Meeting
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Schedule a meeting"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={convert} disabled={busy || !ownerId || !start}>
              {busy ? "Scheduling…" : "Schedule"}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Owner (rep)" required>
            <Select value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
              <option value="">Select a rep…</option>
              {(reps?.reps ?? []).map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name ?? r.email}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Start" required>
            <Input
              type="datetime-local"
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </Field>
          <Field label="Duration (minutes)">
            <Input
              type="number"
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
            />
          </Field>
        </div>
      </Modal>
    </>
  );
}
