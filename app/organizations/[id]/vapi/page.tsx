"use client";

import { useParams } from "next/navigation";
import { AppShell } from "@shared/ui/AppShell";
import { VapiSettingsPage } from "@features/organizations/VapiSettingsPage";

export default function OrgVapiSettingsRoute() {
  const params = useParams<{ id: string }>();
  return (
    <AppShell>
      <VapiSettingsPage orgId={params.id} />
    </AppShell>
  );
}
