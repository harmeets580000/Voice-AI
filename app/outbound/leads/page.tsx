"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@shared/ui/AppShell";
import { api } from "@shared/api/client";
import {
  PageContainer,
  PageHeader,
  Button,
  Badge,
  Field,
  Input,
  Select,
  cx,
} from "@shared/ui/primitives";
import { DataTable, type Column } from "@shared/ui/DataTable";
import { Modal } from "@shared/ui/Modal";
import { useToast } from "@shared/ui/Toast";
import { LayoutGrid, Table as TableIcon, Plus, Upload } from "lucide-react";
import type {
  LeadsResponse,
  LeadDTO,
  LeadStageDTO,
} from "@contracts/outbound-leads";
import type {
  ManualLeadResponse,
  ImportSummaryDTO,
} from "@contracts/outbound-lead-intake";
import { LeadDetail } from "@features/outbound/LeadDetail";
import { CsvImportModal } from "@features/outbound/CsvImportModal";
import { PlaceCall } from "@features/outbound/PlaceCall";
import { ConvertToMeeting } from "@features/outbound/ConvertToMeeting";

const STAGES: LeadStageDTO[] = [
  "NEW",
  "CONTACTED",
  "QUALIFIED",
  "PROPOSAL",
  "WON",
  "LOST",
];
const STAGE_LABEL: Record<LeadStageDTO, string> = {
  NEW: "New",
  CONTACTED: "Contacted",
  QUALIFIED: "Qualified",
  PROPOSAL: "Proposal",
  WON: "Won",
  LOST: "Lost",
};

function money(v: number | null): string {
  return v == null ? "—" : `$${v.toLocaleString()}`;
}

export default function OutboundLeadsRoute() {
  return (
    <AppShell>
      <LeadsPage />
    </AppShell>
  );
}

function LeadsPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const [view, setView] = useState<"kanban" | "table">("kanban");
  const [openId, setOpenId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [manual, setManual] = useState({
    name: "",
    phone: "",
    email: "",
    stage: "NEW" as LeadStageDTO,
    value: "",
    note: "",
  });
  const [saving, setSaving] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["outbound-leads"],
    queryFn: () => api.get<LeadsResponse>("/outbound/leads"),
  });
  const leads = data?.leads ?? [];

  async function saveManual() {
    setSaving(true);
    try {
      const res = await api.post<ManualLeadResponse>("/outbound/leads/manual", {
        name: manual.name || undefined,
        phone: manual.phone || undefined,
        email: manual.email || undefined,
        stage: manual.stage,
        value: manual.value ? Number(manual.value) : undefined,
        note: manual.note || undefined,
      });
      await qc.invalidateQueries({ queryKey: ["outbound-leads"] });
      setAddOpen(false);
      setManual({
        name: "",
        phone: "",
        email: "",
        stage: "NEW",
        value: "",
        note: "",
      });
      if (res.existed) {
        toast.info("That contact already has an open lead — opened it");
        setOpenId(res.lead.id);
      } else {
        toast.success("Lead created");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create lead");
    } finally {
      setSaving(false);
    }
  }

  async function moveStage(id: string, stage: LeadStageDTO) {
    let lostReason: string | undefined;
    if (stage === "LOST") {
      lostReason = window.prompt("Reason for marking this lead lost?") ?? undefined;
      if (!lostReason) return;
    }
    try {
      await api.put(`/outbound/leads/${id}/stage`, { stage, lostReason });
      await qc.invalidateQueries({ queryKey: ["outbound-leads"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not move lead");
    }
  }

  const columns: Column<LeadDTO>[] = [
    {
      key: "contact",
      header: "Contact",
      render: (l) => l.contact?.name ?? l.contact?.phone ?? "—",
    },
    {
      key: "stage",
      header: "Stage",
      render: (l) => <Badge tone="accent">{STAGE_LABEL[l.stage]}</Badge>,
    },
    { key: "source", header: "Source", render: (l) => l.source },
    { key: "value", header: "Value", render: (l) => money(l.value) },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (l) => (
        <Button size="sm" variant="secondary" onClick={() => setOpenId(l.id)}>
          Open
        </Button>
      ),
    },
  ];

  return (
    <PageContainer size="wide">
      <PageHeader
        title="Leads"
        subtitle="Work your pipeline. Drag cards between stages; every change is logged."
        actions={
          <>
            <Button
              variant="secondary"
              onClick={() => setImportOpen(true)}
              leftIcon={<Upload size={16} />}
            >
              Import leads
            </Button>
            <Button onClick={() => setAddOpen(true)} leftIcon={<Plus size={16} />}>
              Add lead
            </Button>
            <div className="flex gap-1 rounded-lg border border-border p-0.5">
              <Button
                size="sm"
                variant={view === "kanban" ? "primary" : "ghost"}
                onClick={() => setView("kanban")}
                leftIcon={<LayoutGrid size={15} />}
              >
                Kanban
              </Button>
              <Button
                size="sm"
                variant={view === "table" ? "primary" : "ghost"}
                onClick={() => setView("table")}
                leftIcon={<TableIcon size={15} />}
              >
                Table
              </Button>
            </div>
          </>
        }
      />

      {isLoading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : view === "table" ? (
        <DataTable
          columns={columns}
          rows={leads}
          emptyMessage="No leads yet — promote contacts or add leads to get started"
        />
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          {STAGES.map((stage) => {
            const col = leads.filter((l) => l.stage === stage);
            return (
              <div
                key={stage}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  const id = e.dataTransfer.getData("text/lead-id");
                  if (id) void moveStage(id, stage);
                }}
                className="flex min-h-40 flex-col rounded-xl border border-border bg-surface/40 p-2"
              >
                <div className="mb-2 flex items-center justify-between px-1 text-xs font-semibold uppercase tracking-wide text-muted">
                  <span>{STAGE_LABEL[stage]}</span>
                  <span>{col.length}</span>
                </div>
                <div className="space-y-2">
                  {col.map((l) => (
                    <div
                      key={l.id}
                      draggable
                      onDragStart={(e) =>
                        e.dataTransfer.setData("text/lead-id", l.id)
                      }
                      onClick={() => setOpenId(l.id)}
                      className={cx(
                        "cursor-pointer rounded-lg border border-border bg-card p-2.5 text-sm shadow-sm transition-shadow hover:shadow",
                      )}
                    >
                      <div className="font-medium text-text">
                        {l.contact?.name ?? l.contact?.phone ?? "Unknown"}
                      </div>
                      <div className="mt-1 flex items-center justify-between text-xs text-muted">
                        <span>{l.source}</span>
                        <span>{money(l.value)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {openId && (
        <LeadDetail
          leadId={openId}
          onClose={() => setOpenId(null)}
          onChanged={() =>
            qc.invalidateQueries({ queryKey: ["outbound-leads"] })
          }
          extraActions={(lead) => (
            <>
              <PlaceCall leadId={lead.id} />
              <ConvertToMeeting leadId={lead.id} />
            </>
          )}
        />
      )}

      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="New lead"
        footer={
          <>
            <Button variant="secondary" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={saveManual}
              disabled={
                saving || (!manual.name && !manual.phone && !manual.email)
              }
            >
              {saving ? "Saving…" : "Create lead"}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Name">
            <Input
              value={manual.name}
              onChange={(e) =>
                setManual((m) => ({ ...m, name: e.target.value }))
              }
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Phone">
              <Input
                value={manual.phone}
                onChange={(e) =>
                  setManual((m) => ({ ...m, phone: e.target.value }))
                }
              />
            </Field>
            <Field label="Email">
              <Input
                type="email"
                value={manual.email}
                onChange={(e) =>
                  setManual((m) => ({ ...m, email: e.target.value }))
                }
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Stage">
              <Select
                value={manual.stage}
                onChange={(e) =>
                  setManual((m) => ({
                    ...m,
                    stage: e.target.value as LeadStageDTO,
                  }))
                }
              >
                {STAGES.map((s) => (
                  <option key={s} value={s}>
                    {STAGE_LABEL[s]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Deal value">
              <Input
                type="number"
                value={manual.value}
                onChange={(e) =>
                  setManual((m) => ({ ...m, value: e.target.value }))
                }
              />
            </Field>
          </div>
          <Field label="Note">
            <Input
              value={manual.note}
              onChange={(e) =>
                setManual((m) => ({ ...m, note: e.target.value }))
              }
            />
          </Field>
        </div>
      </Modal>

      <CsvImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="Import leads"
        fields={[
          { key: "name", label: "Name" },
          { key: "phone", label: "Phone" },
          { key: "email", label: "Email" },
          { key: "notes", label: "Notes" },
          { key: "stage", label: "Stage" },
          { key: "value", label: "Deal value" },
        ]}
        onImport={async ({ filename, mapping, parsedRows }) => {
          const rows = parsedRows.map((pr) => {
            const get = (f: string) =>
              mapping[f] ? pr[mapping[f]]?.trim() || undefined : undefined;
            const stage = get("stage")?.toUpperCase();
            const valueRaw = get("value");
            const value = valueRaw
              ? Number(valueRaw.replace(/[^0-9.]/g, ""))
              : undefined;
            return {
              name: get("name"),
              phone: get("phone"),
              email: get("email"),
              notes: get("notes"),
              stage: STAGES.includes(stage as LeadStageDTO)
                ? (stage as LeadStageDTO)
                : undefined,
              value: value != null && !Number.isNaN(value) ? value : undefined,
            };
          });
          const res = await api.post<{ summary: ImportSummaryDTO }>(
            "/outbound/lead-imports",
            { filename, mapping, rows },
          );
          await qc.invalidateQueries({ queryKey: ["outbound-leads"] });
          return res.summary;
        }}
      />
    </PageContainer>
  );
}
