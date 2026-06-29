"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@shared/ui/AppShell";
import { api } from "@shared/api/client";
import { useAuth } from "@features/auth/AuthProvider";
import { Role } from "@domain/enums";
import {
  PageContainer,
  PageHeader,
  Button,
  Field,
  Input,
  Select,
  Badge,
} from "@shared/ui/primitives";
import { DataTable, type Column } from "@shared/ui/DataTable";
import { Modal } from "@shared/ui/Modal";
import { useToast } from "@shared/ui/Toast";
import { Plus, ArrowLeft } from "lucide-react";
import { slugify, timezoneList, browserTimezone } from "@shared/format";
import { VapiSettingsPage } from "@features/organizations/VapiSettingsPage";

const TIMEZONES = timezoneList();
import type {
  OrgListResponse,
  CreateOrgResponse,
} from "@contracts/organizations";

type Org = OrgListResponse["organizations"][number];

export default function OrganizationsRoute() {
  return (
    <AppShell>
      <OrganizationsAdmin />
    </AppShell>
  );
}

const makeEmpty = () => ({
  name: "",
  slug: "",
  timezone: browserTimezone(),
  adminEmail: "",
});

function OrganizationsAdmin() {
  const { user, activeOrgId, setActiveOrg } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(makeEmpty);
  const [slugEdited, setSlugEdited] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["organizations"],
    queryFn: () => api.get<OrgListResponse>("/organizations"),
  });

  if (user?.role !== Role.SUPER_ADMIN) {
    return (
      <PageContainer>
        <p className="text-sm text-muted">Super-admin only.</p>
      </PageContainer>
    );
  }

  // An org is selected in the top switcher → manage that org's Vapi setup inline.
  if (activeOrgId) {
    return (
      <PageContainer size="wide">
        <div className="mb-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setActiveOrg(null)}
            leftIcon={<ArrowLeft size={16} />}
          >
            All organizations
          </Button>
        </div>
        <VapiSettingsPage orgId={activeOrgId} />
      </PageContainer>
    );
  }

  async function create() {
    setMsg(null);
    setSaving(true);
    try {
      const res = await api.post<CreateOrgResponse>("/organizations", form);
      await qc.invalidateQueries({ queryKey: ["organizations"] });
      setForm(makeEmpty());
      setSlugEdited(false);
      setOpen(false);
      toast.success(`Organization "${res.organization.name}" created`);
      // Keep the temp password on screen (toasts auto-dismiss) so it can be copied.
      setMsg(
        res.tempPassword
          ? `Temp admin password for ${res.organization.name}: ${res.tempPassword}`
          : null,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Create failed");
    } finally {
      setSaving(false);
    }
  }

  const columns: Column<Org>[] = [
    { key: "name", header: "Name" },
    {
      key: "slug",
      header: "Slug",
      render: (o) => <span className="font-mono text-xs text-muted">{o.slug}</span>,
    },
    { key: "status", header: "Status", render: (o) => <Badge>{o.status}</Badge> },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (o) => (
        <Button size="sm" variant="ghost" onClick={() => setActiveOrg(o.id)}>
          Manage Vapi →
        </Button>
      ),
    },
  ];

  return (
    <PageContainer>
      <PageHeader
        title="Vapi Settings"
        subtitle="Onboard customers and manage each organization's Vapi connection."
        actions={
          <Button onClick={() => setOpen(true)} leftIcon={<Plus size={16} />}>
            New organization
          </Button>
        }
      />
      {msg && (
        <p className="mb-3 rounded-lg bg-accent-tint px-3 py-2 text-sm text-accent">
          {msg}
        </p>
      )}
      <DataTable
        columns={columns}
        rows={isLoading ? [] : (data?.organizations ?? [])}
        emptyMessage={isLoading ? "Loading…" : "No organizations yet"}
        emptyAction={
          !isLoading && (
            <Button size="sm" onClick={() => setOpen(true)}>
              + Create the first organization
            </Button>
          )
        }
      />

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="New organization"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={create}
              disabled={saving || !form.name || !form.slug || !form.adminEmail}
            >
              {saving ? "Creating…" : "Create"}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Name" required>
            <Input
              value={form.name}
              onChange={(e) => {
                const name = e.target.value;
                setForm((f) => ({
                  ...f,
                  name,
                  slug: slugEdited ? f.slug : slugify(name),
                }));
              }}
            />
          </Field>
          <Field label="Slug" required>
            <Input
              value={form.slug}
              onChange={(e) => {
                setSlugEdited(true);
                setForm((f) => ({ ...f, slug: slugify(e.target.value) }));
              }}
            />
          </Field>
          <Field label="Timezone" required>
            <Select
              value={form.timezone}
              onChange={(e) =>
                setForm((f) => ({ ...f, timezone: e.target.value }))
              }
            >
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Admin email" required>
            <Input
              type="email"
              value={form.adminEmail}
              onChange={(e) =>
                setForm((f) => ({ ...f, adminEmail: e.target.value }))
              }
            />
          </Field>
        </div>
      </Modal>
    </PageContainer>
  );
}
