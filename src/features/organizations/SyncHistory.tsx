"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@shared/api/client";
import { Card, Badge, Button, cx } from "@shared/ui/primitives";
import { Modal } from "@shared/ui/Modal";
import { History, ChevronDown } from "lucide-react";
import type { SyncLogListResponse, SyncLogDTO } from "@contracts/sync";

const TYPE_LABEL: Record<string, string> = {
  provision: "Provision",
  resync: "Sync from Vapi",
  tools_sync: "Tools sync",
};

/** Full audit history of every Vapi sync run for an org, with per-run detail. */
export function SyncHistory({
  orgId,
  defaultOpen = false,
}: {
  orgId: string;
  defaultOpen?: boolean;
}) {
  const [selected, setSelected] = useState<SyncLogDTO | null>(null);
  const [expanded, setExpanded] = useState(defaultOpen);

  const { data } = useQuery({
    queryKey: ["sync-logs", orgId],
    queryFn: () =>
      api.get<SyncLogListResponse>(`/organizations/${orgId}/sync-logs`),
  });
  const logs = data?.logs ?? [];

  const tone = (s: string) =>
    s === "success" ? "success" : s === "partial" ? "warning" : "danger";

  return (
    <Card className="space-y-3 text-sm">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2 text-left"
        aria-expanded={expanded}
      >
        <History size={18} className="text-accent" />
        <h2 className="font-medium text-text">Sync history</h2>
        {logs.length > 0 && <Badge tone="neutral">{logs.length}</Badge>}
        <ChevronDown
          size={16}
          className={cx(
            "ml-auto text-muted transition-transform",
            expanded && "rotate-180",
          )}
        />
      </button>

      {expanded && (
        <p className="text-xs text-muted">
          Every provision, sync, and tools-sync run, newest first. Click a row for full detail.
        </p>
      )}

      {expanded &&
        (logs.length === 0 ? (
          <p className="text-muted">No sync runs yet.</p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-surface/60 text-left text-xs uppercase text-muted">
                <th className="px-3 py-2">When</th>
                <th className="px-3 py-2">Run</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Summary</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr
                  key={l.id}
                  onClick={() => setSelected(l)}
                  className="cursor-pointer border-b border-border/60 last:border-0 hover:bg-surface/60"
                >
                  <td className="px-3 py-2 text-xs text-muted">
                    {new Date(l.startedAt).toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-text">
                    {TYPE_LABEL[l.type] ?? l.type}
                    <span className="ml-2 text-xs text-muted">
                      {l.details &&
                      typeof l.details === "object" &&
                      (l.details as { auto?: boolean }).auto
                        ? "· auto"
                        : "· manual"}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <Badge tone={tone(l.status)}>{l.status}</Badge>
                  </td>
                  <td className="px-3 py-2 text-muted">{l.summary ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        ))}

      <Modal
        open={!!selected}
        onClose={() => setSelected(null)}
        title="Sync run details"
        size="lg"
        footer={
          <Button variant="secondary" onClick={() => setSelected(null)}>
            Close
          </Button>
        }
      >
        {selected && (
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-2">
              <Detail label="Run" value={TYPE_LABEL[selected.type] ?? selected.type} />
              <Detail label="Status" value={selected.status} />
              <Detail
                label="Started"
                value={new Date(selected.startedAt).toLocaleString()}
              />
              <Detail
                label="Finished"
                value={
                  selected.finishedAt
                    ? new Date(selected.finishedAt).toLocaleString()
                    : "—"
                }
              />
              <Detail label="Summary" value={selected.summary ?? "—"} />
              <Detail label="Triggered by" value={selected.triggeredBy ?? "system"} />
            </div>
            {selected.error && (
              <p className="rounded-lg bg-danger/10 px-3 py-2 text-danger">
                {selected.error}
              </p>
            )}
            <div>
              <div className="mb-1 text-xs text-muted">Details</div>
              <pre className="max-h-[50vh] overflow-auto whitespace-pre-wrap break-words rounded-lg bg-surface-2 p-3 font-mono text-xs text-text">
                {JSON.stringify(selected.details ?? {}, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </Modal>
    </Card>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted">{label}</div>
      <div className="text-text">{value}</div>
    </div>
  );
}
