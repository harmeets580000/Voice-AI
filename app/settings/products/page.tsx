"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@shared/ui/AppShell";
import { useAuth } from "@features/auth/AuthProvider";
import { api } from "@shared/api/client";
import {
  PageContainer,
  PageHeader,
  Button,
  Card,
  Badge,
  Spinner,
} from "@shared/ui/primitives";
import { useToast } from "@shared/ui/Toast";
import { Role } from "@domain/enums";
import type { ProductsResponse, ProductDTO } from "@contracts/products";
import { PhoneIncoming, PhoneOutgoing, type LucideIcon } from "lucide-react";

const META: Record<
  ProductDTO["product"],
  { name: string; desc: string; icon: LucideIcon; base?: boolean }
> = {
  AI_RECEPTIONIST: {
    name: "AI Receptionist",
    desc: "Inbound voice assistant that answers calls and books appointments.",
    icon: PhoneIncoming,
    base: true,
  },
  OUTBOUND_SALES: {
    name: "Outbound Sales & Lead Gen",
    desc: "Contacts, segments, sales agents, voice campaigns, and a lead pipeline.",
    icon: PhoneOutgoing,
  },
};

export default function ProductsSettingsRoute() {
  return (
    <AppShell>
      <ProductsSettingsPage />
    </AppShell>
  );
}

function ProductsSettingsPage() {
  const { user, activeOrgId } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();

  const isSuper = user?.role === Role.SUPER_ADMIN;
  const canToggle = isSuper || user?.role === Role.ORG_ADMIN;
  const needsOrg = isSuper && !activeOrgId;

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["products", activeOrgId],
    queryFn: () => api.get<ProductsResponse>("/products"),
    enabled: !needsOrg,
  });

  async function toggle(p: ProductDTO) {
    const next = p.status === "active" ? "inactive" : "active";
    try {
      await api.put(`/products/${p.product}`, { status: next });
      await qc.invalidateQueries({ queryKey: ["products"] });
      toast.success(
        `${META[p.product].name} ${next === "active" ? "enabled" : "disabled"}`,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    }
  }

  return (
    <PageContainer>
      <PageHeader
        title="Products"
        subtitle="Enable or disable products for this organization. Disabling hides its nav but keeps all data."
      />

      {needsOrg ? (
        <Card className="text-sm text-muted">
          Use the organization switcher in the top bar to act as an organization,
          then manage its products here.
        </Card>
      ) : isLoading ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : isError ? (
        <Card className="text-sm text-danger">
          Couldn&apos;t load products
          {error instanceof Error ? `: ${error.message}` : ""}. If you just added
          the Outbound module, restart the dev server and try again.
        </Card>
      ) : (data?.products?.length ?? 0) === 0 ? (
        <Card className="text-sm text-muted">No products available.</Card>
      ) : (
        <div className="space-y-3">
          {(data?.products ?? []).map((p) => {
            const meta = META[p.product];
            const Icon = meta.icon;
            const active = p.status === "active";
            return (
              <Card key={p.product} className="flex items-center gap-4">
                <div className="rounded-lg bg-surface p-2.5 text-accent">
                  <Icon size={20} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-text">{meta.name}</span>
                    {meta.base ? (
                      <Badge tone="neutral">Base product</Badge>
                    ) : active ? (
                      <Badge tone="success">Enabled</Badge>
                    ) : (
                      <Badge tone="neutral">Disabled</Badge>
                    )}
                  </div>
                  <p className="mt-0.5 text-sm text-muted">{meta.desc}</p>
                </div>
                {meta.base ? (
                  <span className="text-xs italic text-faint">Always on</span>
                ) : (
                  <Button
                    variant={active ? "secondary" : "primary"}
                    disabled={!canToggle}
                    onClick={() => toggle(p)}
                  >
                    {active ? "Disable" : "Enable"}
                  </Button>
                )}
              </Card>
            );
          })}
          {!canToggle && (
            <p className="text-xs text-muted">
              You need an admin role to change products.
            </p>
          )}
        </div>
      )}
    </PageContainer>
  );
}
