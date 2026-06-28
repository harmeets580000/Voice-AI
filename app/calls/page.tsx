"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@shared/ui/AppShell";
import { api } from "@shared/api/client";
import { PageContainer, PageHeader, Button } from "@shared/ui/primitives";
import { DataTable, type Column } from "@shared/ui/DataTable";
import { Modal } from "@shared/ui/Modal";
import { useFormatDate } from "@features/settings/SettingsProvider";

interface CallRow {
  id: string;
  fromNumber: string | null;
  durationSeconds: number | null;
  summary: string | null;
  createdAt: string;
  customer: { name: string | null; phone: string | null } | null;
}
interface Message {
  role: string;
  text: string;
  secondsFromStart: number | null;
}
interface CallDetail {
  id: string;
  fromNumber: string | null;
  toNumber: string | null;
  direction: string;
  durationSeconds: number | null;
  endedReason: string | null;
  cost: string | null;
  recordingUrl: string | null;
  summary: string | null;
  startedAt: string | null;
  endedAt: string | null;
  vapiCallId: string;
  costBreakdown: unknown;
  vapiRaw: unknown;
  customer: { name: string | null; phone: string | null } | null;
  messages: Message[];
}

export default function CallsRoute() {
  return (
    <AppShell>
      <CallsPage />
    </AppShell>
  );
}

function CallsPage() {
  const formatDate = useFormatDate();
  const [openId, setOpenId] = useState<string | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: ["calls"],
    queryFn: () => api.get<{ calls: CallRow[] }>("/calls"),
  });
  const { data: detail } = useQuery({
    queryKey: ["call", openId],
    queryFn: () => api.get<{ call: CallDetail }>(`/calls/${openId}`),
    enabled: !!openId,
  });

  const columns: Column<CallRow>[] = [
    {
      key: "when",
      header: "When",
      render: (c) => formatDate(c.createdAt),
    },
    {
      key: "from",
      header: "From",
      render: (c) => c.customer?.name ?? c.fromNumber ?? "—",
    },
    {
      key: "duration",
      header: "Duration",
      render: (c) => (c.durationSeconds ? `${c.durationSeconds}s` : "—"),
    },
    { key: "summary", header: "Summary", render: (c) => c.summary ?? "—" },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (c) => (
        <Button size="sm" variant="ghost" onClick={() => setOpenId(c.id)}>
          Transcript
        </Button>
      ),
    },
  ];

  return (
    <PageContainer>
      <PageHeader
        title="Calls"
        subtitle="Transcripts, recordings, and summaries from your receptionist."
      />
      <DataTable
        columns={columns}
        rows={isLoading ? [] : (data?.calls ?? [])}
        emptyMessage={
          isLoading ? "Loading…" : "No calls yet — they'll appear here after your first call"
        }
      />

      <Modal
        open={!!openId}
        onClose={() => setOpenId(null)}
        title="Call details"
        size="lg"
      >
        {detail?.call ? (
          <div className="space-y-4">
            {/* Metadata grid */}
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
              <Meta label="From" value={detail.call.fromNumber} />
              <Meta label="To" value={detail.call.toNumber} />
              <Meta label="Direction" value={detail.call.direction} />
              <Meta
                label="Duration"
                value={
                  detail.call.durationSeconds != null
                    ? `${detail.call.durationSeconds}s`
                    : null
                }
              />
              <Meta label="Ended reason" value={detail.call.endedReason} />
              <Meta
                label="Cost"
                value={detail.call.cost != null ? `$${detail.call.cost}` : null}
              />
              <Meta label="Started" value={formatDate(detail.call.startedAt)} />
              <Meta label="Ended" value={formatDate(detail.call.endedAt)} />
              <Meta label="Vapi call id" value={detail.call.vapiCallId} mono />
            </div>

            {detail.call.summary && (
              <div>
                <div className="mb-1 text-xs font-medium uppercase text-muted">
                  Summary
                </div>
                <p className="rounded-lg bg-surface px-3 py-2 text-sm text-text">
                  {detail.call.summary}
                </p>
              </div>
            )}

            {detail.call.recordingUrl && (
              <div>
                <div className="mb-1 text-xs font-medium uppercase text-muted">
                  Recording
                </div>
                <audio controls src={detail.call.recordingUrl} className="w-full" />
              </div>
            )}

            <div>
              <div className="mb-1 text-xs font-medium uppercase text-muted">
                Transcript
              </div>
              {detail.call.messages.length === 0 ? (
                <p className="text-sm text-muted">No transcript.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {detail.call.messages.map((m, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="w-20 shrink-0 font-medium capitalize text-muted">
                        {m.role}
                      </span>
                      <span className="text-text">{m.text}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {(detail.call.vapiRaw != null ||
              detail.call.costBreakdown != null) && (
              <details className="rounded-lg border border-border">
                <summary className="cursor-pointer px-3 py-2 text-xs font-medium uppercase text-muted">
                  Raw provider data
                </summary>
                <pre className="max-h-[40vh] overflow-auto whitespace-pre-wrap break-words border-t border-border bg-surface-2 p-3 font-mono text-xs text-text">
                  {JSON.stringify(
                    detail.call.vapiRaw ?? {
                      costBreakdown: detail.call.costBreakdown,
                    },
                    null,
                    2,
                  )}
                </pre>
              </details>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted">Loading…</p>
        )}
      </Modal>
    </PageContainer>
  );
}

function Meta({
  label,
  value,
  mono,
}: {
  label: string;
  value?: string | null;
  mono?: boolean;
}) {
  return (
    <div>
      <div className="text-xs text-muted">{label}</div>
      <div className={mono ? "truncate font-mono text-xs text-text" : "text-text"}>
        {value ?? "—"}
      </div>
    </div>
  );
}
